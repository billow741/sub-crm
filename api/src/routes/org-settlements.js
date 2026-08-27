/**
 * org-settlements 路由
 * 机构结算单：查询详情、生成、收款、删除、预览
 */
import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';

const orgSettlements = new Hono();

// ── 权限检查 ──
function requireSuperAdmin(c) {
  const role = c.req.header('X-User-Role') || 'org_admin';
  return role === 'super_admin';
}

// ── 1. 所有结算单 ──
orgSettlements.get('/', async (c) => {
  const DB = c.env.DB;
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';
  const statusFilter = c.req.query('status');
  const orgIdQuery = c.req.query('org_id');

  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 数据隔离
  if (userRole !== 'super_admin') {
    if (userOrgId) {
      whereClause += ' AND s.org_id = ?';
      params.push(parseInt(userOrgId));
    }
  } else if (orgIdQuery) {
    whereClause += ' AND s.org_id = ?';
    params.push(parseInt(orgIdQuery));
  }

  if (statusFilter) {
    whereClause += ' AND s.status = ?';
    params.push(statusFilter);
  }

  // 统计总数
  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM org_settlements s ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  // 查询数据
  const results = await DB.prepare(`
    SELECT s.*, o.name as org_name
    FROM org_settlements s
    JOIN organizations o ON s.org_id = o.id
    ${whereClause}
    ORDER BY s.generated_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  const data = results.results?.map(item => ({
    id: item.id,
    org_id: item.org_id,
    org_name: item.org_name,
    period_start: item.period_start,
    period_end: item.period_end,
    total_classes: item.total_classes,
    total_hours: item.total_hours,
    unit_price_cny: item.unit_price_cny,
    amount_due_cny: item.amount_due_cny,
    status: item.status,
    paid_at: item.paid_at,
    payment_ref: item.payment_ref,
    generated_at: item.generated_at
  })) || [];

  return c.json(success({ data, pagination }));
});

// ── 2. 预览结算单（不写库）──
orgSettlements.get('/preview', async (c) => {
  const DB = c.env.DB;

  const orgId = c.req.query('org_id');
  const periodStart = c.req.query('period_start');
  const periodEnd = c.req.query('period_end');

  if (!orgId || !periodStart || !periodEnd) {
    return c.json(error('VALIDATION_ERROR', 'org_id, period_start, period_end 均为必填'), 400);
  }

  // 查询机构单价
  const org = await DB.prepare('SELECT unit_price_cny, unit_price_25_cny FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) {
    return c.json(error('NOT_FOUND', '机构不存在'), 404);
  }
  const unitPrice50 = org.unit_price_cny || 0;
  const unitPrice25 = org.unit_price_25_cny || 50;

  try {
    // 查询该周期内已完成的课程（排除已结算的）— 按次数区分
    let classList = [];
    try {
      const classesResult = await DB.prepare(`
        SELECT c.id, c.hours,
          CASE WHEN c.hours >= 1.0 THEN '50min' ELSE '25min' END as duration_type
        FROM classes c
        WHERE c.organization_id = ?
          AND c.status = 'completed'
          AND (c.is_self_paid = 0 OR c.is_self_paid IS NULL)
          AND c.date >= ? AND c.date <= ?
          AND c.id NOT IN (
            SELECT class_id FROM org_settlement_items
            WHERE settlement_id IN (
              SELECT id FROM org_settlements
              WHERE org_id = ? AND status != 'void'
            )
          )
      `).bind(orgId, periodStart, periodEnd, orgId).all();
      classList = classesResult.results || [];
    } catch (queryErr) {
      const classesResult = await DB.prepare(`
        SELECT c.id, c.hours,
          CASE WHEN c.hours >= 1.0 THEN '50min' ELSE '25min' END as duration_type
        FROM classes c
        WHERE c.organization_id = ?
          AND c.status = 'completed'
          AND c.date >= ? AND c.date <= ?
          AND c.id NOT IN (
            SELECT class_id FROM org_settlement_items
            WHERE settlement_id IN (
              SELECT id FROM org_settlements
              WHERE org_id = ? AND status != 'void'
            )
          )
      `).bind(orgId, periodStart, periodEnd, orgId).all();
      classList = classesResult.results || [];
    }

    const totalClasses = classList.length;
    const totalHours = classList.reduce((sum, cls) => sum + (cls.hours || 0), 0);
    const count50 = classList.filter(cls => (cls.hours || 0) >= 1.0).length;
    const count25 = classList.filter(cls => (cls.hours || 0) < 1.0).length;
    const amountDue = count50 * unitPrice50 + count25 * unitPrice25;

    return c.json(success({
      org_id: parseInt(orgId),
      period_start: periodStart,
      period_end: periodEnd,
      total_classes: totalClasses,
      total_hours: totalHours,
      count_50min: count50,
      count_25min: count25,
      unit_price_cny: unitPrice50,
      unit_price_25_cny: unitPrice25,
      amount_due_cny: amountDue
    }));
  } catch (err) {
    console.error('GET /org-settlements/preview 失败:', err);
    return c.json(error('DATABASE_ERROR', '结算预览失败: ' + err.message), 500);
  }
});

// ── 3. 结算单详情（带明细）──
orgSettlements.get('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const settlement = await DB.prepare(`
    SELECT s.*, o.name as org_name
    FROM org_settlements s
    JOIN organizations o ON s.org_id = o.id
    WHERE s.id = ?
  `).bind(id).first();

  if (!settlement) {
    return c.json(error('NOT_FOUND', '结算单不存在'), 404);
  }

  const items = await DB.prepare(`
    SELECT id, class_id, student_id, student_name, teacher_name, class_date, hours, unit_price_cny, subtotal_cny
    FROM org_settlement_items
    WHERE settlement_id = ?
    ORDER BY class_date DESC
  `).bind(id).all();

  return c.json(success({
    id: settlement.id,
    org_id: settlement.org_id,
    org_name: settlement.org_name,
    period_start: settlement.period_start,
    period_end: settlement.period_end,
    total_classes: settlement.total_classes,
    total_hours: settlement.total_hours,
    unit_price_cny: settlement.unit_price_cny,
    amount_due_cny: settlement.amount_due_cny,
    status: settlement.status,
    paid_at: settlement.paid_at,
    payment_ref: settlement.payment_ref,
    generated_at: settlement.generated_at,
    items: items.results || []
  }));
});

// ── 3. 生成结算单 ──
orgSettlements.post('/generate', async (c) => {
  const DB = c.env.DB;

  if (!requireSuperAdmin(c)) {
    return c.json(error('FORBIDDEN', '只有超管可以生成结算单'), 403);
  }

  const body = await c.req.json();
  const { org_id, period_start, period_end } = body;

  if (!org_id || !period_start || !period_end) {
    return c.json(error('VALIDATION_ERROR', 'org_id, period_start, period_end 均为必填'), 400);
  }

  let settlementId = null;

  try {
    // 查询机构单价（50分钟 + 25分钟）
    const org = await DB.prepare('SELECT id, name, unit_price_cny, unit_price_25_cny FROM organizations WHERE id = ?').bind(org_id).first();
    if (!org) {
      return c.json(error('NOT_FOUND', '机构不存在'), 404);
    }
    const unitPrice50 = org.unit_price_cny || 0;
    const unitPrice25 = org.unit_price_25_cny || 50;

    // 查询该周期内已完成的课程（排除已结算的）
    let classList = [];
    try {
      const classesResult = await DB.prepare(`
        SELECT c.id, c.student_id, c.teacher_id, c.date, c.hours,
               s.name as student_name, t.name as teacher_name
        FROM classes c
        JOIN students s ON c.student_id = s.id
        LEFT JOIN teachers t ON c.teacher_id = t.id
        WHERE c.organization_id = ?
          AND c.status = 'completed'
          AND (c.is_self_paid = 0 OR c.is_self_paid IS NULL)
          AND c.date >= ? AND c.date <= ?
          AND c.id NOT IN (
            SELECT class_id FROM org_settlement_items
            WHERE settlement_id IN (
              SELECT id FROM org_settlements
              WHERE org_id = ? AND status != 'void'
            )
          )
        ORDER BY c.date DESC
      `).bind(org_id, period_start, period_end, org_id).all();
      classList = classesResult.results || [];
    } catch (queryErr) {
      // 降级查询（若 is_self_paid 列不存在）
      const classesResult = await DB.prepare(`
        SELECT c.id, c.student_id, c.teacher_id, c.date, c.hours,
               s.name as student_name, t.name as teacher_name
        FROM classes c
        JOIN students s ON c.student_id = s.id
        LEFT JOIN teachers t ON c.teacher_id = t.id
        WHERE c.organization_id = ?
          AND c.status = 'completed'
          AND c.date >= ? AND c.date <= ?
          AND c.id NOT IN (
            SELECT class_id FROM org_settlement_items
            WHERE settlement_id IN (
              SELECT id FROM org_settlements
              WHERE org_id = ? AND status != 'void'
            )
          )
        ORDER BY c.date DESC
      `).bind(org_id, period_start, period_end, org_id).all();
      classList = classesResult.results || [];
    }

    if (classList.length === 0) {
      return c.json(error('NO_DATA', '该周期内无符合的已完课记录'), 400);
    }

    // 计算汇总 — 按次数分别计费
    const totalClasses = classList.length;
    const totalHours = classList.reduce((sum, cls) => sum + (cls.hours || 0), 0);
    const count50 = classList.filter(cls => (cls.hours || 0) >= 1.0).length;
    const count25 = classList.filter(cls => (cls.hours || 0) < 1.0).length;
    const amountDue = count50 * unitPrice50 + count25 * unitPrice25;

    // 先插入结算单
    const insertSettle = await DB.prepare(`
      INSERT INTO org_settlements (org_id, period_start, period_end, total_classes, total_hours, unit_price_cny, amount_due_cny, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(org_id, period_start, period_end, totalClasses, totalHours, unitPrice50, amountDue).run();

    settlementId = insertSettle.meta?.last_row_id;

    // 插入明细 — 按课时类型选单价
    for (const cls of classList) {
      const hours = cls.hours || 0;
      const is50min = hours >= 1.0;
      const price = is50min ? unitPrice50 : unitPrice25;
      const subtotal = price; // 按次计费，每次1个单价
      const durationType = is50min ? '50min' : '25min';

      try {
        await DB.prepare(`
          INSERT INTO org_settlement_items (settlement_id, class_id, student_id, student_name, teacher_name, class_date, hours, unit_price_cny, subtotal_cny, duration_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          settlementId,
          cls.id,
          cls.student_id,
          cls.student_name || '',
          cls.teacher_name || '',
          cls.date,
          hours,
          price,
          subtotal,
          durationType
        ).run();
      } catch (itemErr) {
        // 降级：若 duration_type 列不存在
        await DB.prepare(`
          INSERT INTO org_settlement_items (settlement_id, class_id, student_id, student_name, teacher_name, class_date, hours, unit_price_cny, subtotal_cny)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          settlementId,
          cls.id,
          cls.student_id,
          cls.student_name || '',
          cls.teacher_name || '',
          cls.date,
          hours,
          price,
          subtotal
        ).run();
      }
    }

    // 查询返回
    const items = await DB.prepare(`
      SELECT id, class_id, student_id, student_name, teacher_name, class_date, hours, unit_price_cny, subtotal_cny
      FROM org_settlement_items
      WHERE settlement_id = ?
      ORDER BY class_date DESC
    `).bind(settlementId).all();

    return c.json(success({
      id: settlementId,
      org_id: org_id,
      org_name: org.name,
      period_start,
      period_end,
      total_classes: totalClasses,
      total_hours: totalHours,
      count_50min: count50,
      count_25min: count25,
      unit_price_cny: unitPrice50,
      unit_price_25_cny: unitPrice25,
      amount_due_cny: amountDue,
      status: 'pending',
      generated_at: new Date().toISOString(),
      items: items.results || []
    }), 201);
  } catch (err) {
    console.error('POST /org-settlements/generate 失败:', err);
    // 自动清理已创建的半成品结算单
    if (settlementId) {
      try {
        await DB.prepare('DELETE FROM org_settlement_items WHERE settlement_id = ?').bind(settlementId).run();
        await DB.prepare('DELETE FROM org_settlements WHERE id = ?').bind(settlementId).run();
      } catch (_) {}
    }
    return c.json(error('DATABASE_ERROR', '生成结算单失败: ' + err.message), 500);
  }
});

// ── 4. 确认收款 ──
orgSettlements.post('/:id/pay', async (c) => {
  const DB = c.env.DB;

  if (!requireSuperAdmin(c)) {
    return c.json(error('FORBIDDEN', '只有超管可以确认收款'), 403);
  }

  const id = c.req.param('id');
  let body = {};
  try { body = await c.req.json(); } catch (_) { /* no body */ }
  const paymentRef = body.payment_ref || null;

  const settlement = await DB.prepare('SELECT * FROM org_settlements WHERE id = ?').bind(id).first();
  if (!settlement) {
    return c.json(error('NOT_FOUND', '结算单不存在'), 404);
  }

  if (settlement.status === 'paid') {
    return c.json(error('ALREADY_PAID', '该结算单已标记为已收款'), 400);
  }

  await DB.prepare(`
    UPDATE org_settlements SET status = 'paid', paid_at = datetime('now'), payment_ref = ?
    WHERE id = ?
  `).bind(paymentRef, id).run();

  return c.json(success({
    id: settlement.id,
    status: 'paid',
    paid_at: new Date().toISOString(),
    payment_ref: paymentRef
  }));
});

// ── 5. 删除 pending 结算单 ──
orgSettlements.delete('/:id', async (c) => {
  const DB = c.env.DB;

  if (!requireSuperAdmin(c)) {
    return c.json(error('FORBIDDEN', '只有超管可以删除结算单'), 403);
  }

  const id = c.req.param('id');

  const settlement = await DB.prepare('SELECT * FROM org_settlements WHERE id = ?').bind(id).first();
  if (!settlement) {
    return c.json(error('NOT_FOUND', '结算单不存在'), 404);
  }

  if (settlement.status !== 'pending') {
    return c.json(error('INVALID_STATUS', '只有 pending 状态的结算单可以删除'), 400);
  }

  // 先删明细，再删主单
  await DB.prepare('DELETE FROM org_settlement_items WHERE settlement_id = ?').bind(id).run();
  await DB.prepare('DELETE FROM org_settlements WHERE id = ?').bind(id).run();

  return c.json(success({ message: '结算单已删除' }));
});

export default orgSettlements;
