import { Hono } from 'hono';
import { success, error } from '../utils/response.js';

/**
 * Organizations 路由
 * 管理合作机构（校区/代理）
 */
const organizations = new Hono();

// 获取所有机构列表
organizations.get('/', async (c) => {
  const DB = c.env.DB;
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '50';
  const status = c.req.query('status');

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM organizations ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;

  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const results = await DB.prepare(`
    SELECT * FROM organizations
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, parseInt(pageSize), offset).all();

  const orgs = results.results || [];
  const data = await Promise.all(orgs.map(async org => {
    const stats = await getOrgStats(DB, org.id);
    return {
      id: org.id,
      name: org.name,
      login_code: org.login_code,
      has_password: !!org.password_hash,
      contact_name: org.contact_name,
      contact_phone: org.contact_phone,
      contact_email: org.contact_email,
      address: org.address,
      notes: org.notes,
      unit_price_cny: org.unit_price_cny,
      settlement_day: org.settlement_day,
      credit_limit_cny: org.credit_limit_cny,
      status: org.status,
      student_count: stats.student_count,
      teacher_count: stats.teacher_count,
      class_count: stats.class_count,
      created_at: org.created_at,
      updated_at: org.updated_at,
      _links: {
        self: `/api/v1/organizations/${org.id}`,
        students: `/api/v1/organizations/${org.id}/students`,
        teachers: `/api/v1/organizations/${org.id}/teachers`,
        classes: `/api/v1/organizations/${org.id}/classes`
      }
    };
  }));

  return c.json(success({
    data,
    pagination: {
      total,
      page: parseInt(page),
      page_size: parseInt(pageSize),
      pages: Math.ceil(total / parseInt(pageSize))
    }
  }));
});

// 获取单个机构详情
organizations.get('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const org = await DB.prepare(`
    SELECT * FROM organizations WHERE id = ?
  `).bind(id).first();

  if (!org) {
    return c.json(error('NOT_FOUND', '机构不存在'), 404);
  }

  // 统计机构数据
  const stats = await getOrgStats(DB, id);

  return c.json(success({ ...org, stats }));
});

// 创建新机构
organizations.post('/', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();
  const { name, contact_name, contact_phone, contact_email, address, notes, login_code, password, unit_price_cny, settlement_day, credit_limit_cny } = body;

  if (!name) {
    return c.json(error('VALIDATION_ERROR', '机构名称不能为空'), 400);
  }

  // 检查 login_code 唯一性
  if (login_code) {
    const existing = await DB.prepare('SELECT id FROM organizations WHERE login_code = ?').bind(login_code).first();
    if (existing) {
      return c.json(error('DUPLICATE', '该登录代码已被使用'), 400);
    }
  }

  // 如果有密码，hash 它
  let passwordHash = null;
  if (password) {
    const { hashPassword } = await import('./auth.js');
    passwordHash = await hashPassword(password);
  }

  const result = await DB.prepare(`
    INSERT INTO organizations (name, contact_name, contact_phone, contact_email, address, notes, login_code, password_hash, unit_price_cny, settlement_day, credit_limit_cny, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(name, contact_name || null, contact_phone || null, contact_email || null, address || null, notes || null, login_code || null, passwordHash, unit_price_cny ?? 80, settlement_day || 'monday', credit_limit_cny ?? 0).run();

  return c.json(success({
    id: result.meta.last_row_id,
    name,
    status: 'active'
  }), 201);
});

// 更新机构信息
organizations.patch('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();

  const { name, contact_name, contact_phone, contact_email, address, notes, status, login_code, password, unit_price_cny, settlement_day, credit_limit_cny } = body;

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (contact_name !== undefined) { updates.push('contact_name = ?'); values.push(contact_name); }
  if (contact_phone !== undefined) { updates.push('contact_phone = ?'); values.push(contact_phone); }
  if (contact_email !== undefined) { updates.push('contact_email = ?'); values.push(contact_email); }
  if (address !== undefined) { updates.push('address = ?'); values.push(address); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (login_code !== undefined) { updates.push('login_code = ?'); values.push(login_code); }
  if (unit_price_cny !== undefined) { updates.push('unit_price_cny = ?'); values.push(unit_price_cny); }
  if (settlement_day !== undefined) { updates.push('settlement_day = ?'); values.push(settlement_day); }
  if (credit_limit_cny !== undefined) { updates.push('credit_limit_cny = ?'); values.push(credit_limit_cny); }

  // 密码单独处理：如果传了非空 password，则 hash 后存储
  if (password) {
    const { hashPassword } = await import('./auth.js');
    const hashed = await hashPassword(password);
    updates.push('password_hash = ?');
    values.push(hashed);
  }

  if (updates.length === 0) {
    return c.json(error('VALIDATION_ERROR', '没有需要更新的字段'), 400);
  }

  values.push(id);

  await DB.prepare(`
    UPDATE organizations SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...values).run();

  return c.json(success({ id }));
});

// 删除机构（软删除，改为 inactive）
organizations.delete('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  await DB.prepare(
    'UPDATE organizations SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind('inactive', id).run();

  return c.json(success({ message: '机构已停用' }));
});

// 获取机构的学生列表
organizations.get('/:id/students', async (c) => {
  const DB = c.env.DB;
  const orgId = c.req.param('id');
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';

  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const results = await DB.prepare(`
    SELECT id, name, phone, email, age, grade, parent_name, status, total_hours, used_hours, created_at
    FROM students
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(orgId, parseInt(pageSize), offset).all();

  return c.json(success(results.results || []));
});

// 获取机构的排课列表
organizations.get('/:id/classes', async (c) => {
  const DB = c.env.DB;
  const orgId = c.req.param('id');
  const date = c.req.query('date');

  let whereClause = 'WHERE c.organization_id = ?';
  const params = [orgId];

  if (date) {
    whereClause += ' AND c.date = ?';
    params.push(date);
  }

  const results = await DB.prepare(`
    SELECT c.*, s.name as student_name, t.name as teacher_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN teachers t ON c.teacher_id = t.id
    ${whereClause}
    ORDER BY c.date DESC, c.start_time DESC
  `).bind(...params).all();

  return c.json(success(results.results || []));
});

// 获取机构的教师列表
organizations.get('/:id/teachers', async (c) => {
  const DB = c.env.DB;
  const orgId = c.req.param('id');

  const results = await DB.prepare(`
    SELECT id, name, phone, email, subjects, status, created_at
    FROM teachers
    WHERE organization_id = ?
    ORDER BY name ASC
  `).bind(orgId).all();

  return c.json(success(results.results || []));
});

// 辅助函数：获取机构统计数据
async function getOrgStats(DB, orgId) {
  const studentResult = await DB.prepare('SELECT COUNT(*) as count FROM students WHERE organization_id = ?').bind(orgId).first();
  const classResult = await DB.prepare('SELECT COUNT(*) as count FROM classes WHERE organization_id = ?').bind(orgId).first();
  
  // teachers 用 organization_ids JSON 数组，用 LIKE 匹配（参数化查询防注入）
  const likePattern = `%${orgId}%`;
  const teacherResult = await DB.prepare(`SELECT COUNT(*) as count FROM teachers WHERE organization_ids LIKE ?`).bind(likePattern).first();

  return {
    student_count: studentResult?.count || 0,
    teacher_count: teacherResult?.count || 0,
    class_count: classResult?.count || 0
  };
}

export default organizations;