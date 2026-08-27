import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';
import { validateParams, idParamSchema } from '../utils/validation.js';

/**
 * OrgPackages 路由
 * 机构课时包管理
 */
const orgPackages = new Hono();

// ── 工具函数 ──
function getUserInfo(c) {
  return {
    role: c.req.header('X-User-Role') || 'org_admin',
    orgId: c.req.header('X-Organization-Id') || null
  };
}

/**
 * 1. GET / - 获取课时包列表
 * 超管可查看所有（支持 ?org_id= 过滤），机构端只看本机构
 */
orgPackages.get('/', async (c) => {
  const DB = c.env.DB;
  const { role, orgId } = getUserInfo(c);
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 超管支持 org_id 过滤
  if (role === 'super_admin') {
    if (c.req.query('org_id')) {
      whereClause += ' AND op.org_id = ?';
      params.push(parseInt(c.req.query('org_id')));
    }
  } else {
    // 机构端只看自己的
    if (orgId) {
      whereClause += ' AND op.org_id = ?';
      params.push(parseInt(orgId));
    } else {
      return c.json(error('FORBIDDEN', '缺少机构信息'), 403);
    }
  }

  // 统计总数
  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM org_packages op ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  // 查询数据
  const results = await DB.prepare(`
    SELECT op.*, o.name as org_name
    FROM org_packages op
    LEFT JOIN organizations o ON op.org_id = o.id
    ${whereClause}
    ORDER BY op.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  // 动态校准真实消耗课时
  const rawData = results.results || [];
  const data = await Promise.all(rawData.map(async (p) => {
    try {
      const realUsed = await DB.prepare(`
        SELECT COALESCE(SUM(c.hours), 0) as total
        FROM classes c
        WHERE c.organization_id = ?
          AND c.status = 'completed'
          AND (c.is_self_paid = 0 OR c.is_self_paid IS NULL)
          AND c.student_id IN (SELECT DISTINCT student_id FROM org_hour_allocations WHERE org_id = ?)
      `).bind(p.org_id, p.org_id).first();

      const actualUsedHours = realUsed?.total !== undefined ? realUsed.total : (p.used_hours || 0);
      const remain = Math.max(0, Math.round(((p.total_hours || 0) - actualUsedHours) * 100) / 100);

      // 如果数据有偏差，同步纠正数据库
      if (p.used_hours !== actualUsedHours) {
        await DB.prepare('UPDATE org_packages SET used_hours = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(actualUsedHours, p.id).run();
      }

      return {
        ...p,
        used_hours: actualUsedHours,
        remaining_hours: remain
      };
    } catch (_) {
      return {
        ...p,
        remaining_hours: Math.max(0, (p.total_hours || 0) - (p.used_hours || 0))
      };
    }
  }));

  // 汇总总课时与已用课时
  const totalHours = data.reduce((sum, p) => sum + (p.total_hours || 0), 0);
  const totalUsedHours = data.reduce((sum, p) => sum + (p.used_hours || 0), 0);
  const totalRemainingHours = data.reduce((sum, p) => sum + (p.remaining_hours || 0), 0);

  // 统计已分配课时总数
  let totalAllocatedHours = 0;
  try {
    let allocQuery = 'SELECT COALESCE(SUM(hours), 0) as total FROM org_hour_allocations';
    const allocParams = [];
    if (orgId && role !== 'super_admin') {
      allocQuery += ' WHERE org_id = ?';
      allocParams.push(parseInt(orgId));
    } else if (c.req.query('org_id')) {
      allocQuery += ' WHERE org_id = ?';
      allocParams.push(parseInt(c.req.query('org_id')));
    }
    const allocRes = await DB.prepare(allocQuery).bind(...allocParams).first();
    totalAllocatedHours = allocRes?.total || 0;
  } catch (_) {}

  // 课时池待分配课时 = 总课时 - 已分配课时
  const totalUnallocatedHours = Math.max(0, Math.round((totalHours - totalAllocatedHours) * 100) / 100);

  return c.json(success({
    data,
    total_hours: totalHours,
    total_used_hours: totalUsedHours,
    total_available_hours: totalRemainingHours,
    total_remaining_hours: totalRemainingHours,
    total_allocated_hours: totalAllocatedHours,
    total_unallocated_hours: totalUnallocatedHours,
    pagination
  }));
});

/**
 * 2. POST / - 超管创建课时包
 */
orgPackages.post('/', async (c) => {
  const DB = c.env.DB;
  const { role } = getUserInfo(c);

  if (role !== 'super_admin') {
    return c.json(error('FORBIDDEN', '只有超管可以创建课时包'), 403);
  }

  const body = await c.req.json();
  const { org_id, total_hours, unit_price_cny, notes } = body;

  // 校验必填
  if (!org_id || !total_hours || !unit_price_cny) {
    return c.json(error('VALIDATION_ERROR', '缺少 org_id, total_hours 或 unit_price_cny'), 400);
  }

  const hours = parseFloat(total_hours);
  const price = parseFloat(unit_price_cny);
  const amountCny = Math.round(hours * price * 100) / 100;

  // 插入课时包
  const { last_row_id: pkgId } = await DB.prepare(
    `INSERT INTO org_packages (org_id, total_hours, used_hours, unit_price_cny, amount_cny, paid_amount_cny, status, notes, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?, 0, 'pending', ?, datetime('now'), datetime('now'))`
  ).bind(org_id, hours, price, amountCny, notes || null).run().then(r => r.meta);

  // 同时更新 organizations.unit_price_cny
  await DB.prepare(
    `UPDATE organizations SET unit_price_cny = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(price, org_id).run();

  const pkg = await DB.prepare(
    `SELECT op.*, o.name as org_name FROM org_packages op
     LEFT JOIN organizations o ON op.org_id = o.id WHERE op.id = ?`
  ).bind(pkgId).first();

  return c.json(success(pkg), 201);
});

/**
 * 3. POST /allocate - 机构端分配课时给学生
 *    （放在 /:id 之前，避免被参数路由拦截）
 */
orgPackages.post('/allocate', async (c) => {
  const DB = c.env.DB;
  const { role, orgId: headerOrgId } = getUserInfo(c);
  const body = await c.req.json();
  const { student_id, hours, notes, package_id } = body;

  // org_id 从 header 或 body 获取
  let org_id = headerOrgId ? parseInt(headerOrgId) : null;
  if (!org_id && body.org_id) {
    org_id = parseInt(body.org_id);
  }

  if (!org_id) {
    return c.json(error('VALIDATION_ERROR', '缺少 org_id'), 400);
  }
  if (!student_id || !hours) {
    return c.json(error('VALIDATION_ERROR', '缺少 student_id 或 hours'), 400);
  }

  const numHours = parseFloat(hours);
  if (isNaN(numHours) || numHours <= 0) {
    return c.json(error('VALIDATION_ERROR', 'hours 必须为正数'), 400);
  }

  // 检查学生是否存在
  const student = await DB.prepare('SELECT id, name, total_hours, organization_id FROM students WHERE id = ?').bind(student_id).first();
  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 非超管只能操作本机构
  if (role !== 'super_admin' && headerOrgId && student.organization_id !== parseInt(headerOrgId)) {
    return c.json(error('FORBIDDEN', '无权操作其他机构学生'), 403);
  }

  // 找一个 pending/partial_paid 的包（用于记录分配来源，不修改 used_hours）
  let targetPkgId = package_id || null;
  if (!targetPkgId) {
    const targetPkg = await DB.prepare(
      `SELECT id, total_hours, used_hours FROM org_packages
       WHERE org_id = ? AND status IN ('pending', 'partial_paid')
       ORDER BY created_at DESC LIMIT 1`
    ).bind(org_id).first();

    if (targetPkg) {
      targetPkgId = targetPkg.id;
    }
  }

  // 更新学生总课时
  await DB.prepare(
    `UPDATE students SET total_hours = total_hours + ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(numHours, student_id).run();

  // 插入分配记录
  const allocResult = await DB.prepare(
    `INSERT INTO org_hour_allocations (org_id, package_id, student_id, hours, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(org_id, targetPkgId, student_id, numHours, notes || null, role).run();

  const allocationId = allocResult.meta.last_row_id;

  // 记录 hour_changes
  await DB.prepare(
    `INSERT INTO hour_changes (student_id, type, amount, related_id, description, created_at)
     VALUES (?, 'adjust', ?, ?, ?, datetime('now'))`
  ).bind(student_id, numHours, allocationId, `机构分配课时 +${numHours}节`).run();

  const updatedStudent = await DB.prepare('SELECT id, name, total_hours, used_hours FROM students WHERE id = ?').bind(student_id).first();
  const updatedPkg = targetPkgId ? await DB.prepare('SELECT * FROM org_packages WHERE id = ?').bind(targetPkgId).first() : null;

  return c.json(success({
    package: updatedPkg || null,
    student: updatedStudent,
    allocation_id: allocationId,
    allocated_hours: numHours
  }), 201);
});

/**
 * 4. GET /allocations - 查看分配流水
 *    （放在 /:id 之前，避免被参数路由拦截）
 */
orgPackages.get('/allocations', async (c) => {
  const DB = c.env.DB;
  const { role, orgId } = getUserInfo(c);
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (role === 'super_admin') {
    if (c.req.query('org_id')) {
      whereClause += ' AND a.org_id = ?';
      params.push(parseInt(c.req.query('org_id')));
    }
  } else {
    // 机构端只能看自己的
    const id = orgId || null;
    if (id) {
      whereClause += ' AND a.org_id = ?';
      params.push(parseInt(id));
    } else {
      return c.json(error('FORBIDDEN', '缺少机构信息'), 403);
    }
  }

  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM org_hour_allocations a ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  const results = await DB.prepare(`
    SELECT a.*, s.name as student_name, o.name as org_name, op.total_hours, op.used_hours
    FROM org_hour_allocations a
    LEFT JOIN students s ON a.student_id = s.id
    LEFT JOIN organizations o ON a.org_id = o.id
    LEFT JOIN org_packages op ON a.package_id = op.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  const data = results.results || [];

  return c.json(success({ data, pagination }));
});

/**
 * 5. GET /:id - 查单个包（含分配记录列表）
 */
orgPackages.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { role, orgId } = getUserInfo(c);

  const pkg = await DB.prepare(`
    SELECT op.*, o.name as org_name
    FROM org_packages op
    LEFT JOIN organizations o ON op.org_id = o.id
    WHERE op.id = ?
  `).bind(id).first();

  if (!pkg) {
    return c.json(error('NOT_FOUND', '课时包不存在'), 404);
  }

  // 非超管只能看本机构
  if (role !== 'super_admin' && orgId && pkg.org_id !== parseInt(orgId)) {
    return c.json(error('FORBIDDEN', '无权访问'), 403);
  }

  // 获取分配记录
  const allocations = await DB.prepare(`
    SELECT a.*, s.name as student_name
    FROM org_hour_allocations a
    LEFT JOIN students s ON a.student_id = s.id
    WHERE a.package_id = ?
    ORDER BY a.created_at DESC
  `).bind(id).all();

  return c.json(success({
    ...pkg,
    remaining_hours: (pkg.total_hours || 0) - (pkg.used_hours || 0),
    allocations: allocations.results || []
  }));
});

/**
 * 6. PATCH /:id - 超管更新包（标记收款等）
 */
orgPackages.patch('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { role } = getUserInfo(c);

  if (role !== 'super_admin') {
    return c.json(error('FORBIDDEN', '只有超管可以更新'), 403);
  }

  const pkg = await DB.prepare('SELECT * FROM org_packages WHERE id = ?').bind(id).first();
  if (!pkg) {
    return c.json(error('NOT_FOUND', '课时包不存在'), 404);
  }

  const body = await c.req.json();
  const { paid_amount_cny, status, notes } = body;

  const updates = [];
  const values = [];

  if (paid_amount_cny !== undefined) {
    updates.push('paid_amount_cny = ?');
    values.push(parseFloat(paid_amount_cny));
  }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (notes !== undefined) {
    updates.push('notes = ?');
    values.push(notes);
  }

  if (updates.length === 0) {
    return c.json(error('VALIDATION_ERROR', '没有需要更新的字段'), 400);
  }

  values.push(id);

  await DB.prepare(`UPDATE org_packages SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values).run();

  const updated = await DB.prepare(`SELECT op.*, o.name as org_name FROM org_packages op
     LEFT JOIN organizations o ON op.org_id = o.id WHERE op.id = ?`).bind(id).first();

  return c.json(success(updated));
});

/**
 * 7. POST /:id/pay - 超管标记课时包已收款
 */
orgPackages.post('/:id/pay', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { role } = getUserInfo(c);

  if (role !== 'super_admin') {
    return c.json(error('FORBIDDEN', '只有超管可以标记收款'), 403);
  }

  const body = await c.req.json();
  const { paid_amount_cny, payment_ref } = body;

  const pkg = await DB.prepare('SELECT * FROM org_packages WHERE id = ?').bind(id).first();
  if (!pkg) {
    return c.json(error('NOT_FOUND', '课时包不存在'), 404);
  }

  // 状态机更新
  let newStatus = pkg.status;
  const paid = parseFloat(paid_amount_cny) || 0;
  const total = parseFloat(pkg.amount_cny) || 0;
  const currentPaid = parseFloat(pkg.paid_amount_cny) || 0;
  const totalPaid = currentPaid + paid;

  if (totalPaid >= total) {
    newStatus = 'paid';
  } else if (totalPaid > 0) {
    newStatus = 'partial_paid';
  } else {
    newStatus = 'pending';
  }

  await DB.prepare(
    `UPDATE org_packages
     SET paid_amount_cny = paid_amount_cny + ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(paid, newStatus, id).run();

  const updated = await DB.prepare(`SELECT op.*, o.name as org_name FROM org_packages op
     LEFT JOIN organizations o ON op.org_id = o.id WHERE op.id = ?`).bind(id).first();

  return c.json(success({ ...updated, payment_ref, payment_applied: paid, total_paid: totalPaid, status: newStatus }));
});

export default orgPackages;
