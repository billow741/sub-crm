/**
 * Teacher Payments 路由
 * 教师薪资「结算单 + 付款单」双凭证及核销体系
 */
import { Hono } from 'hono';
import { success, error } from '../utils/response.js';

const teacherPayments = new Hono();

// ── 1. 教师薪资付款看板全景聚合 ──
teacherPayments.get('/board-summary', async (c) => {
  const DB = c.env.DB;

  const teachers = await DB.prepare(`
    SELECT id, name, hourly_rate, hourly_rate_25, status
    FROM teachers
    ORDER BY status ASC, name ASC
  `).all();

  const teacherList = teachers.results || [];
  const currentMonth = new Date().toISOString().substring(0, 7);

  const boardData = [];

  for (const t of teacherList) {
    // 待支付结算单（状态为 pending 或 partial）
    const pendingSettlement = await DB.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN balance_due > 0 THEN balance_due ELSE (total_amount - COALESCE(paid_amount, 0)) END), 0) as amount
      FROM teacher_payments
      WHERE teacher_id = ? AND status IN ('pending', 'partial')
    `).bind(t.id).first();

    // 可用预付款余额 (unallocated advance vouchers)
    const advanceData = await DB.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(unallocated_amount), 0) as balance
      FROM teacher_payment_vouchers
      WHERE teacher_id = ? AND voucher_type = 'advance' AND status IN ('unallocated', 'partially_allocated')
    `).bind(t.id).first();

    // 本月实际已付出账 (基于付款单 paid_at)
    const paidMonthData = await DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as amount
      FROM teacher_payment_vouchers
      WHERE teacher_id = ? AND status != 'cancelled' AND strftime('%Y-%m', paid_at) = ?
    `).bind(t.id, currentMonth).first();

    // 历史累计已付出账
    const totalPaidData = await DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as amount
      FROM teacher_payment_vouchers
      WHERE teacher_id = ? AND status != 'cancelled'
    `).bind(t.id).first();

    // 最近一笔结算单
    const latestSettlement = await DB.prepare(`
      SELECT id, period_start, period_end, total_amount, paid_amount, balance_due, status, paid_at
      FROM teacher_payments
      WHERE teacher_id = ?
      ORDER BY period_end DESC, id DESC
      LIMIT 1
    `).bind(t.id).first();

    // 未结课时数：自最新结算周期后已完课节数
    const latestPeriodEnd = latestSettlement?.period_end || '1970-01-01';
    const unsettledClasses = await DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(hours), 0) as hours
      FROM classes
      WHERE teacher_id = ?
        AND status = 'completed'
        AND date > ?
    `).bind(t.id, latestPeriodEnd).first();

    boardData.push({
      id: t.id,
      name: t.name,
      hourly_rate: t.hourly_rate || 0,
      hourly_rate_25: t.hourly_rate_25 || 80,
      status: t.status,
      pending_settlements_count: pendingSettlement?.count || 0,
      pending_settlements_amount: Math.round((pendingSettlement?.amount || 0) * 100) / 100,
      advance_balance: Math.round((advanceData?.balance || 0) * 100) / 100,
      advance_count: advanceData?.count || 0,
      paid_this_month: Math.round((paidMonthData?.amount || 0) * 100) / 100,
      total_paid: Math.round((totalPaidData?.amount || 0) * 100) / 100,
      latest_settlement: latestSettlement || null,
      unsettled_classes_count: unsettledClasses?.count || 0,
      unsettled_classes_hours: Math.round((unsettledClasses?.hours || 0) * 100) / 100
    });
  }

  // 全局汇总指标
  const globalPending = boardData.reduce((sum, item) => sum + item.pending_settlements_amount, 0);
  const globalAdvance = boardData.reduce((sum, item) => sum + item.advance_balance, 0);
  const globalPaidThisMonth = boardData.reduce((sum, item) => sum + item.paid_this_month, 0);
  const activeTeachers = boardData.filter(item => item.status === 'active').length;

  return c.json(success({
    teachers: boardData,
    global_stats: {
      total_pending_amount: Math.round(globalPending * 100) / 100,
      total_advance_balance: Math.round(globalAdvance * 100) / 100,
      total_paid_this_month: Math.round(globalPaidThisMonth * 100) / 100,
      active_teachers_count: activeTeachers,
      total_teachers_count: boardData.length
    }
  }));
});

// ── 2. 付款单列表 ──
teacherPayments.get('/vouchers', async (c) => {
  const DB = c.env.DB;
  const teacherId = c.req.query('teacher_id');
  const voucherType = c.req.query('voucher_type');
  const status = c.req.query('status');
  const month = c.req.query('month');

  let where = 'WHERE 1=1';
  const params = [];

  if (teacherId) {
    where += ' AND v.teacher_id = ?';
    params.push(teacherId);
  }
  if (voucherType) {
    where += ' AND v.voucher_type = ?';
    params.push(voucherType);
  }
  if (status) {
    where += ' AND v.status = ?';
    params.push(status);
  }
  if (month) {
    where += " AND strftime('%Y-%m', v.paid_at) = ?";
    params.push(month);
  }

  const vouchers = await DB.prepare(`
    SELECT
      v.*,
      t.name as teacher_name
    FROM teacher_payment_vouchers v
    LEFT JOIN teachers t ON v.teacher_id = t.id
    ${where}
    ORDER BY v.paid_at DESC, v.id DESC
  `).bind(...params).all();

  return c.json(success(vouchers.results || []));
});

// ── 3. 录入付款单 ──
teacherPayments.post('/vouchers', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();
  const { teacher_id, amount, voucher_type, payment_method, transaction_ref, paid_at, notes, settlement_id } = body;

  const numAmount = parseFloat(amount);
  if (!teacher_id || isNaN(numAmount) || numAmount <= 0) {
    return c.json(error('BAD_REQUEST', '教师和有效付款金额必填且需大于0'), 400);
  }

  const vType = voucher_type === 'advance' ? 'advance' : 'settlement';
  const payDate = paid_at || new Date().toISOString().substring(0, 10);
  const voucherNo = 'PV-' + payDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

  let allocatedAmount = 0;
  let unallocatedAmount = numAmount;
  let voucherStatus = 'unallocated';

  // 如果指定了具体结算单进行核销打款
  let targetSettlement = null;
  if (settlement_id) {
    targetSettlement = await DB.prepare(`
      SELECT id, total_amount, paid_amount, balance_due, status
      FROM teacher_payments WHERE id = ? AND teacher_id = ?
    `).bind(settlement_id, teacher_id).first();
  }

  if (targetSettlement && targetSettlement.status !== 'cancelled' && targetSettlement.status !== 'paid') {
    const curBalance = targetSettlement.balance_due > 0 ? targetSettlement.balance_due : (targetSettlement.total_amount - (targetSettlement.paid_amount || 0));
    const canAlloc = Math.min(curBalance, numAmount);
    allocatedAmount = canAlloc;
    unallocatedAmount = Math.max(0, numAmount - canAlloc);
    voucherStatus = unallocatedAmount <= 0.001 ? 'fully_allocated' : 'partially_allocated';
  }

  const insertResult = await DB.prepare(`
    INSERT INTO teacher_payment_vouchers (
      voucher_no, teacher_id, amount, allocated_amount, unallocated_amount,
      voucher_type, payment_method, transaction_ref, paid_at, notes, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    voucherNo, teacher_id, numAmount, allocatedAmount, unallocatedAmount,
    vType, payment_method || 'gcash', transaction_ref || null, payDate, notes || null, voucherStatus
  ).run();

  const voucherId = insertResult.meta.last_row_id;

  // 如果核销了结算单，写入核销明细并更新结算单余额
  if (targetSettlement && allocatedAmount > 0) {
    await DB.prepare(`
      INSERT INTO teacher_settlement_allocations (settlement_id, voucher_id, allocated_amount)
      VALUES (?, ?, ?)
    `).bind(targetSettlement.id, voucherId, allocatedAmount).run();

    const newPaid = (targetSettlement.paid_amount || 0) + allocatedAmount;
    const newBalance = Math.max(0, targetSettlement.total_amount - newPaid);
    const newStatus = newBalance <= 0.001 ? 'paid' : 'partial';

    await DB.prepare(`
      UPDATE teacher_payments
      SET paid_amount = ?, balance_due = ?, status = ?,
          paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END,
          payment_method = COALESCE(payment_method, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(newPaid, newBalance, newStatus, newStatus, payment_method || 'gcash', targetSettlement.id).run();
  }

  return c.json(success({
    id: voucherId,
    voucher_no: voucherNo,
    teacher_id,
    amount: numAmount,
    allocated_amount: allocatedAmount,
    unallocated_amount: unallocatedAmount,
    voucher_type: vType,
    status: voucherStatus
  }), 201);
});

// ── 4. 撤销/删除付款单 ──
teacherPayments.delete('/vouchers/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const voucher = await DB.prepare('SELECT * FROM teacher_payment_vouchers WHERE id = ?').bind(id).first();
  if (!voucher) return c.json(error('NOT_FOUND', '付款单不存在'), 404);

  if (voucher.allocated_amount > 0) {
    return c.json(error('BAD_REQUEST', '该付款单已部分或全部核销至结算单，请先解除关联或取消对应结算单'), 400);
  }

  await DB.prepare('DELETE FROM teacher_payment_vouchers WHERE id = ?').bind(id).run();
  return c.json(success({ id: parseInt(id) }));
});

// ── 5. 获取教师某周期的上课统计与可用预付款 ──
teacherPayments.get('/stats/:teacher_id', async (c) => {
  const DB = c.env.DB;
  const teacherId = c.req.param('teacher_id');
  const startDate = c.req.query('start_date');
  const endDate = c.req.query('end_date');

  if (!startDate || !endDate) {
    return c.json(error('BAD_REQUEST', '请提供开始和结束日期'), 400);
  }

  // 查询该周期已完成的课程 — 按次数区分
  const classes = await DB.prepare(`
    SELECT
      COUNT(*) as total_classes,
      SUM(hours) as total_hours,
      SUM(CASE WHEN hours >= 1.0 THEN 1 ELSE 0 END) as count_50min,
      SUM(CASE WHEN hours < 1.0 THEN 1 ELSE 0 END) as count_25min
    FROM classes
    WHERE teacher_id = ?
      AND date >= ?
      AND date <= ?
      AND status = 'completed'
  `).bind(teacherId, startDate, endDate).first();

  // 获取教师单价（50分钟 + 25分钟）
  const teacher = await DB.prepare(`
    SELECT hourly_rate, hourly_rate_25 FROM teachers WHERE id = ?
  `).bind(teacherId).first();

  if (!teacher) {
    return c.json(error('NOT_FOUND', '教师不存在'), 404);
  }

  const rate50 = teacher.hourly_rate || 0;
  const rate25 = teacher.hourly_rate_25 || 80;
  const totalHours = classes?.total_hours || 0;
  const count50 = classes?.count_50min || 0;
  const count25 = classes?.count_25min || 0;
  const totalAmount = count50 * rate50 + count25 * rate25;

  // 查询该教师当前可用的预付款余额
  const advanceData = await DB.prepare(`
    SELECT
      COALESCE(SUM(unallocated_amount), 0) as balance,
      COUNT(*) as count
    FROM teacher_payment_vouchers
    WHERE teacher_id = ? AND voucher_type = 'advance' AND status IN ('unallocated', 'partially_allocated') AND unallocated_amount > 0
  `).bind(teacherId).first();

  return c.json(success({
    teacher_id: teacherId,
    period_start: startDate,
    period_end: endDate,
    total_classes: classes?.total_classes || 0,
    total_hours: totalHours,
    hourly_rate: rate50,
    count_50min: count50,
    count_25min: count25,
    rate_50min: rate50,
    rate_25min: rate25,
    total_amount: totalAmount,
    advance_balance: advanceData?.balance || 0,
    advance_count: advanceData?.count || 0
  }));
});

// ── 6. 获取所有结算单列表 ──
teacherPayments.get('/', async (c) => {
  const DB = c.env.DB;
  const status = c.req.query('status');
  const teacherId = c.req.query('teacher_id');

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (status) {
    whereClause += ' AND tp.status = ?';
    params.push(status);
  }

  if (teacherId) {
    whereClause += ' AND tp.teacher_id = ?';
    params.push(teacherId);
  }

  const payments = await DB.prepare(`
    SELECT
      tp.*,
      t.name as teacher_name
    FROM teacher_payments tp
    LEFT JOIN teachers t ON tp.teacher_id = t.id
    ${whereClause}
    ORDER BY tp.created_at DESC, tp.id DESC
  `).bind(...params).all();

  return c.json(success(payments.results || []));
});

// ── 7. 创建结算单（支持自动核销可用预付款） ──
teacherPayments.post('/', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();
  const { teacher_id, period_start, period_end, notes, auto_allocate_advances } = body;

  if (!teacher_id || !period_start || !period_end) {
    return c.json(error('BAD_REQUEST', '缺少必要字段'), 400);
  }

  // 获取上课统计 — 按次数区分50分钟和25分钟
  const stats = await DB.prepare(`
    SELECT
      COUNT(*) as total_classes,
      SUM(hours) as total_hours,
      SUM(CASE WHEN hours >= 1.0 THEN 1 ELSE 0 END) as count_50min,
      SUM(CASE WHEN hours < 1.0 THEN 1 ELSE 0 END) as count_25min
    FROM classes
    WHERE teacher_id = ?
      AND date >= ?
      AND date <= ?
      AND status = 'completed'
  `).bind(teacher_id, period_start, period_end).first();

  const teacher = await DB.prepare(`
    SELECT hourly_rate, hourly_rate_25 FROM teachers WHERE id = ?
  `).bind(teacher_id).first();

  if (!teacher) {
    return c.json(error('NOT_FOUND', '教师不存在'), 404);
  }

  const rate50 = teacher.hourly_rate || 0;
  const rate25 = teacher.hourly_rate_25 || 80;
  const totalClasses = stats?.total_classes || 0;
  const totalHours = stats?.total_hours || 0;
  const count50 = stats?.count_50min || 0;
  const count25 = stats?.count_25min || 0;
  const totalAmount = count50 * rate50 + count25 * rate25;

  // 检查是否已存在该周期的非取消结算
  const existing = await DB.prepare(`
    SELECT id FROM teacher_payments
    WHERE teacher_id = ? AND period_start = ? AND period_end = ? AND status != 'cancelled'
  `).bind(teacher_id, period_start, period_end).first();

  if (existing) {
    return c.json(error('CONFLICT', '该周期已有结算记录'), 409);
  }

  // 初始创建待付款结算单
  const result = await DB.prepare(`
    INSERT INTO teacher_payments
      (teacher_id, period_start, period_end, total_classes, total_hours, hourly_rate, total_amount, paid_amount, balance_due, notes, count_50min, count_25min, rate_50min, rate_25min, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(teacher_id, period_start, period_end, totalClasses, totalHours, rate50, totalAmount, totalAmount, notes || null, count50, count25, rate50, rate25).run();

  const settlementId = result.meta.last_row_id;

  // ── 自动核销可用预付款 (FIFO 机制) ──
  const shouldAllocate = auto_allocate_advances !== false;
  let remainingSettlementBalance = totalAmount;
  let totalDeductedAdvance = 0;

  if (shouldAllocate && totalAmount > 0) {
    const unallocatedAdvances = await DB.prepare(`
      SELECT id, voucher_no, unallocated_amount, allocated_amount, amount
      FROM teacher_payment_vouchers
      WHERE teacher_id = ? AND voucher_type = 'advance' AND status IN ('unallocated', 'partially_allocated') AND unallocated_amount > 0
      ORDER BY paid_at ASC, id ASC
    `).bind(teacher_id).all();

    for (const adv of (unallocatedAdvances.results || [])) {
      if (remainingSettlementBalance <= 0) break;
      const allocAmount = Math.min(adv.unallocated_amount, remainingSettlementBalance);

      // 写入核销明细
      await DB.prepare(`
        INSERT INTO teacher_settlement_allocations (settlement_id, voucher_id, allocated_amount)
        VALUES (?, ?, ?)
      `).bind(settlementId, adv.id, allocAmount).run();

      // 更新付款单
      const newAdvAllocated = adv.allocated_amount + allocAmount;
      const newAdvUnallocated = Math.max(0, adv.unallocated_amount - allocAmount);
      const newAdvStatus = newAdvUnallocated <= 0.001 ? 'fully_allocated' : 'partially_allocated';

      await DB.prepare(`
        UPDATE teacher_payment_vouchers
        SET allocated_amount = ?, unallocated_amount = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newAdvAllocated, newAdvUnallocated, newAdvStatus, adv.id).run();

      remainingSettlementBalance -= allocAmount;
      totalDeductedAdvance += allocAmount;
    }

    if (totalDeductedAdvance > 0) {
      const finalStatus = remainingSettlementBalance <= 0.001 ? 'paid' : 'partial';
      await DB.prepare(`
        UPDATE teacher_payments
        SET paid_amount = ?, balance_due = ?, status = ?,
            paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(totalDeductedAdvance, Math.max(0, remainingSettlementBalance), finalStatus, finalStatus, settlementId).run();
    }
  }

  return c.json(success({
    id: settlementId,
    teacher_id,
    period_start,
    period_end,
    total_classes: totalClasses,
    total_hours: totalHours,
    hourly_rate: rate50,
    total_amount: totalAmount,
    paid_amount: totalDeductedAdvance,
    balance_due: Math.max(0, remainingSettlementBalance),
    status: remainingSettlementBalance <= 0.001 && totalAmount > 0 ? 'paid' : (totalDeductedAdvance > 0 ? 'partial' : 'pending'),
    advance_deducted: totalDeductedAdvance
  }), 201);
});

// ── 8. 获取结算明细（含课程明细与付款核销记录） ──
teacherPayments.get('/:id/details', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const payment = await DB.prepare('SELECT * FROM teacher_payments WHERE id = ?').bind(id).first();
  if (!payment) return c.json(error('NOT_FOUND', '结算记录不存在'), 404);

  const details = await DB.prepare(`
    SELECT id, date, start_time, end_time, subject, hours, status, student_id
    FROM classes
    WHERE teacher_id = ?
      AND date >= ?
      AND date <= ?
      AND status = 'completed'
    ORDER BY date ASC, start_time ASC
  `).bind(payment.teacher_id, payment.period_start, payment.period_end).all();

  const studentIds = (details.results || []).map(d => d.student_id).filter(Boolean);
  let studentMap = {};
  if (studentIds.length > 0) {
    const placeholders = studentIds.map(() => '?').join(',');
    const students = await DB.prepare(`SELECT id, name, english_name FROM students WHERE id IN (${placeholders})`).bind(...studentIds).all();
    (students.results || []).forEach(s => { studentMap[s.id] = s; });
  }

  const detailList = (details.results || []).map(d => ({
    class_id: d.id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    subject: d.subject,
    hours: d.hours,
    is_50min: d.hours >= 1.0,
    student_name: d.student_id ? (studentMap[d.student_id]?.name || '') : '',
    student_english_name: d.student_id ? (studentMap[d.student_id]?.english_name || '') : ''
  }));

  // 查询该结算单的所有付款核销记录
  const allocations = await DB.prepare(`
    SELECT
      a.allocated_amount,
      a.created_at as allocated_at,
      v.id as voucher_id,
      v.voucher_no,
      v.voucher_type,
      v.payment_method,
      v.paid_at,
      v.notes
    FROM teacher_settlement_allocations a
    JOIN teacher_payment_vouchers v ON a.voucher_id = v.id
    WHERE a.settlement_id = ?
    ORDER BY a.created_at ASC
  `).bind(id).all();

  return c.json(success({
    payment: {
      id: payment.id,
      teacher_id: payment.teacher_id,
      period_start: payment.period_start,
      period_end: payment.period_end,
      total_classes: payment.total_classes,
      total_hours: payment.total_hours,
      total_amount: payment.total_amount,
      paid_amount: payment.paid_amount || 0,
      balance_due: payment.balance_due !== undefined ? payment.balance_due : (payment.total_amount - (payment.paid_amount || 0)),
      count_50min: payment.count_50min,
      count_25min: payment.count_25min,
      rate_50min: payment.rate_50min,
      rate_25min: payment.rate_25min,
      status: payment.status,
      notes: payment.notes
    },
    details: detailList,
    allocations: allocations.results || []
  }));
});

// ── 9. 直接支付结算单尾款 ──
teacherPayments.patch('/:id/pay', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { payment_method, paid_at, amount } = body;

  const settlement = await DB.prepare(`
    SELECT id, teacher_id, total_amount, paid_amount, balance_due, status
    FROM teacher_payments WHERE id = ?
  `).bind(id).first();

  if (!settlement) {
    return c.json(error('NOT_FOUND', '结算单不存在'), 404);
  }

  if (settlement.status === 'paid') {
    return c.json(error('BAD_REQUEST', '该结算单已完全结清'), 400);
  }

  const curBalance = settlement.balance_due > 0 ? settlement.balance_due : (settlement.total_amount - (settlement.paid_amount || 0));
  const payAmt = amount ? Math.min(parseFloat(amount), curBalance) : curBalance;

  const payDate = paid_at || new Date().toISOString().substring(0, 10);
  const voucherNo = 'PV-' + payDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

  // 1. 生成付款单
  const vResult = await DB.prepare(`
    INSERT INTO teacher_payment_vouchers (
      voucher_no, teacher_id, amount, allocated_amount, unallocated_amount,
      voucher_type, payment_method, paid_at, notes, status
    ) VALUES (?, ?, ?, ?, 0, 'settlement', ?, ?, '结算账单支付', 'fully_allocated')
  `).bind(voucherNo, settlement.teacher_id, payAmt, payAmt, payment_method || 'gcash', payDate).run();

  const voucherId = vResult.meta.last_row_id;

  // 2. 写入核销记录
  await DB.prepare(`
    INSERT INTO teacher_settlement_allocations (settlement_id, voucher_id, allocated_amount)
    VALUES (?, ?, ?)
  `).bind(id, voucherId, payAmt).run();

  // 3. 更新结算单状态
  const newPaid = (settlement.paid_amount || 0) + payAmt;
  const newBalance = Math.max(0, settlement.total_amount - newPaid);
  const newStatus = newBalance <= 0.001 ? 'paid' : 'partial';

  await DB.prepare(`
    UPDATE teacher_payments
    SET status = ?, paid_amount = ?, balance_due = ?,
        paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END,
        payment_method = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newStatus, newPaid, newBalance, newStatus, payment_method || 'gcash', id).run();

  return c.json(success({ id, status: newStatus, paid_amount: newPaid, balance_due: newBalance }));
});

// ── 10. 取消结算单（自动反冲释放核销的付款单） ──
teacherPayments.patch('/:id/cancel', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const payment = await DB.prepare('SELECT id, status FROM teacher_payments WHERE id = ?').bind(id).first();
  if (!payment) return c.json(error('NOT_FOUND', '结算单不存在'), 404);

  // 查询该结算单的所有核销记录
  const allocations = await DB.prepare(`
    SELECT id, voucher_id, allocated_amount FROM teacher_settlement_allocations WHERE settlement_id = ?
  `).bind(id).all();

  // 反冲付款单的已核销额度
  for (const alloc of (allocations.results || [])) {
    const v = await DB.prepare('SELECT id, allocated_amount, unallocated_amount, amount FROM teacher_payment_vouchers WHERE id = ?').bind(alloc.voucher_id).first();
    if (v) {
      const newAllocated = Math.max(0, v.allocated_amount - alloc.allocated_amount);
      const newUnallocated = v.unallocated_amount + alloc.allocated_amount;
      const newStatus = newAllocated === 0 ? 'unallocated' : 'partially_allocated';

      await DB.prepare(`
        UPDATE teacher_payment_vouchers
        SET allocated_amount = ?, unallocated_amount = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newAllocated, newUnallocated, newStatus, v.id).run();
    }
  }

  // 删除核销明细
  await DB.prepare('DELETE FROM teacher_settlement_allocations WHERE settlement_id = ?').bind(id).run();

  // 更新结算单为 cancelled
  await DB.prepare(`
    UPDATE teacher_payments
    SET status = 'cancelled', balance_due = 0, updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  return c.json(success({ id, status: 'cancelled' }));
});

// ── 11. 删除结算单 ──
teacherPayments.delete('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const payment = await DB.prepare(`
    SELECT id, status FROM teacher_payments WHERE id = ?
  `).bind(id).first();

  if (!payment) {
    return c.json(error('NOT_FOUND', '结算记录不存在'), 404);
  }

  // 只允许删除待支付或已取消的记录
  if (payment.status === 'paid') {
    return c.json(error('BAD_REQUEST', '已全额支付的结算单不能直接删除，请先取消'), 400);
  }

  // 先清退所有核销关联
  const allocations = await DB.prepare(`
    SELECT id, voucher_id, allocated_amount FROM teacher_settlement_allocations WHERE settlement_id = ?
  `).bind(id).all();

  for (const alloc of (allocations.results || [])) {
    const v = await DB.prepare('SELECT id, allocated_amount, unallocated_amount FROM teacher_payment_vouchers WHERE id = ?').bind(alloc.voucher_id).first();
    if (v) {
      const newAllocated = Math.max(0, v.allocated_amount - alloc.allocated_amount);
      const newUnallocated = v.unallocated_amount + alloc.allocated_amount;
      const newStatus = newAllocated === 0 ? 'unallocated' : 'partially_allocated';

      await DB.prepare(`
        UPDATE teacher_payment_vouchers
        SET allocated_amount = ?, unallocated_amount = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newAllocated, newUnallocated, newStatus, v.id).run();
    }
  }

  await DB.prepare('DELETE FROM teacher_settlement_allocations WHERE settlement_id = ?').bind(id).run();
  await DB.prepare('DELETE FROM teacher_payments WHERE id = ?').bind(id).run();

  return c.body(null, 204);
});

export default teacherPayments;
