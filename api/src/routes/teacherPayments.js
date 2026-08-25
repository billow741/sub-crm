/**
 * Teacher Payments 路由
 * 教师薪资结算
 */
import { Hono } from 'hono';
import { success, error } from '../utils/response.js';

const teacherPayments = new Hono();

// 获取教师某周的上课统计
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
  const totalHours = classes.total_hours || 0;
  const count50 = classes.count_50min || 0;
  const count25 = classes.count_25min || 0;
  const totalAmount = count50 * rate50 + count25 * rate25;

  return c.json(success({
    teacher_id: teacherId,
    period_start: startDate,
    period_end: endDate,
    total_classes: classes.total_classes || 0,
    total_hours: totalHours,
    hourly_rate: rate50,
    count_50min: count50,
    count_25min: count25,
    rate_50min: rate50,
    rate_25min: rate25,
    total_amount: totalAmount
  }));
});

// 获取所有薪资结算记录
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
    ORDER BY tp.created_at DESC
  `).bind(...params).all();

  return c.json(success(payments.results));
});

// 创建薪资结算记录
teacherPayments.post('/', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();

  const { teacher_id, period_start, period_end, notes } = body;

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

  // 获取教师单价（50分钟 + 25分钟）
  const teacher = await DB.prepare(`
    SELECT hourly_rate, hourly_rate_25 FROM teachers WHERE id = ?
  `).bind(teacher_id).first();

  if (!teacher) {
    return c.json(error('NOT_FOUND', '教师不存在'), 404);
  }

  const rate50 = teacher.hourly_rate || 0;
  const rate25 = teacher.hourly_rate_25 || 80;
  const totalClasses = stats.total_classes || 0;
  const totalHours = stats.total_hours || 0;
  const count50 = stats.count_50min || 0;
  const count25 = stats.count_25min || 0;
  const totalAmount = count50 * rate50 + count25 * rate25;

  // 检查是否已存在该周期的结算
  const existing = await DB.prepare(`
    SELECT id FROM teacher_payments
    WHERE teacher_id = ? AND period_start = ? AND period_end = ?
  `).bind(teacher_id, period_start, period_end).first();

  if (existing) {
    return c.json(error('CONFLICT', '该周期已有结算记录'), 409);
  }

  // 创建结算记录
  const result = await DB.prepare(`
    INSERT INTO teacher_payments
      (teacher_id, period_start, period_end, total_classes, total_hours, hourly_rate, total_amount, notes, count_50min, count_25min, rate_50min, rate_25min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(teacher_id, period_start, period_end, totalClasses, totalHours, rate50, totalAmount, notes || null, count50, count25, rate50, rate25).run();

  // 获取结算明细列表
  const details = await DB.prepare(`
    SELECT id, date, start_time, end_time, subject, hours, status, student_id
    FROM classes
    WHERE teacher_id = ?
      AND date >= ?
      AND date <= ?
      AND status = 'completed'
    ORDER BY date ASC, start_time ASC
  `).bind(teacher_id, period_start, period_end).all();

  // 获取学生姓名
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

  return c.json(success({
    id: result.meta.last_row_id,
    teacher_id,
    period_start,
    period_end,
    total_classes: totalClasses,
    total_hours: totalHours,
    hourly_rate: rate50,
    total_amount: totalAmount,
    count_50min: count50,
    count_25min: count25,
    rate_50min: rate50,
    rate_25min: rate25,
    status: 'pending',
    details: detailList
  }), 201);
});

// 获取结算明细
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

  return c.json(success({
    payment: {
      id: payment.id,
      teacher_id: payment.teacher_id,
      period_start: payment.period_start,
      period_end: payment.period_end,
      total_classes: payment.total_classes,
      total_hours: payment.total_hours,
      total_amount: payment.total_amount,
      count_50min: payment.count_50min,
      count_25min: payment.count_25min,
      rate_50min: payment.rate_50min,
      rate_25min: payment.rate_25min,
      status: payment.status,
      notes: payment.notes
    },
    details: detailList
  }));
});

// 标记为已支付
teacherPayments.patch('/:id/pay', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { payment_method, paid_at } = body;

  const payment = await DB.prepare(`
    SELECT id FROM teacher_payments WHERE id = ?
  `).bind(id).first();

  if (!payment) {
    return c.json(error('NOT_FOUND', '结算记录不存在'), 404);
  }

  const paidAtValue = paid_at 
    ? paid_at + ' ' + new Date().toTimeString().slice(0, 8)
    : new Date().toISOString().slice(0, 19).replace('T', ' ');

  await DB.prepare(`
    UPDATE teacher_payments 
    SET status = 'paid', paid_at = ?, payment_method = ?, updated_at = datetime('now') 
    WHERE id = ? 
  `).bind(paidAtValue, payment_method || null, id).run();

  return c.json(success({ id, status: 'paid', payment_method }));
});
teacherPayments.patch('/:id/cancel', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  const payment = await DB.prepare(`
    SELECT id FROM teacher_payments WHERE id = ?
  `).bind(id).first();

  if (!payment) {
    return c.json(error('NOT_FOUND', '结算记录不存在'), 404);
  }

  await DB.prepare(`
    UPDATE teacher_payments
    SET status = 'cancelled', updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  return c.json(success({ id, status: 'cancelled' }));
});

// 删除结算记录
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
    return c.json(error('BAD_REQUEST', '已支付的记录不能删除'), 400);
  }

  await DB.prepare(`
    DELETE FROM teacher_payments WHERE id = ?
  `).bind(id).run();

  return c.body(null, 204);
});

export default teacherPayments;

