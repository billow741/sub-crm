/**
 * Hour Changes 路由
 * 课时变动记录查询
 */
import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';

const hourChanges = new Hono();

// 获取学生的课时变动记录
hourChanges.get('/student/:student_id', async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.param('student_id');
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '50';

  // 检查学生是否存在
  const student = await DB.prepare('SELECT id, name FROM students WHERE id = ?').bind(studentId).first();
  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 查询总数
  const countResult = await DB.prepare('SELECT COUNT(*) as total FROM hour_changes WHERE student_id = ?').bind(studentId).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  // 查询变动记录
  const results = await DB.prepare(`
    SELECT 
      hc.id,
      hc.student_id,
      hc.type,
      hc.amount,
      hc.description,
      hc.related_id,
      hc.balance_after,
      hc.created_at,
      CASE 
        WHEN hc.type = 'payment' THEN p.description
        WHEN hc.type = 'class' THEN cl.date || ' ' || cl.subject
        ELSE hc.description
      END as detail_text
    FROM hour_changes hc
    LEFT JOIN payments p ON hc.related_id = p.id AND hc.type = 'payment'
    LEFT JOIN classes cl ON hc.related_id = cl.id AND hc.type = 'class'
    WHERE hc.student_id = ?
    ORDER BY hc.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(studentId, pagination.page_size, pagination.offset).all();

  // 获取当前余额
  const studentData = await DB.prepare('SELECT total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
  const currentBalance = (studentData?.total_hours || 0) - (studentData?.used_hours || 0);

  const data = results.results?.map(hc => ({
    id: hc.id,
    student_id: hc.student_id,
    type: hc.type,
    amount: hc.amount,
    related_id: hc.related_id,
    description: hc.description,
    detail_text: hc.detail_text,
    balance_after: hc.balance_after,
    created_at: hc.created_at
  })) || [];

  return c.json(success({
    data,
    pagination,
    current_balance: currentBalance,
    student: { id: student.id, name: student.name }
  }));
});

// 获取单个变动记录
hourChanges.get('/:id', async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.param();

  const hc = await DB.prepare(`
    SELECT 
      hc.id,
      hc.student_id,
      hc.type,
      hc.amount,
      hc.description,
      hc.related_id,
      hc.balance_after,
      hc.created_at,
      s.name as student_name
    FROM hour_changes hc
    JOIN students s ON hc.student_id = s.id
    WHERE hc.id = ?
  `).bind(id).first();

  if (!hc) {
    return c.json(error('NOT_FOUND', '变动记录不存在'), 404);
  }

  return c.json(success({
    id: hc.id,
    student_id: hc.student_id,
    student_name: hc.student_name,
    type: hc.type,
    amount: hc.amount,
    related_id: hc.related_id,
    balance_after: hc.balance_after,
    description: hc.description,
    created_at: hc.created_at
  }));
});

export default hourChanges;
