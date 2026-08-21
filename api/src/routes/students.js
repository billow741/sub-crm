/**
 * Students 路由
 * P0: 核心  * CRUD 功能
 */
import { Hono } from 'hono';
import { studentSchema, studentUpdateSchema, studentQuerySchema, validate, validateQuery, validateParams, idParamSchema } from '../utils/validation.js';
import { success, paginated, error, calculatePagination } from '../utils/response.js';

const students = new Hono();

// 四舍五入到两位小数，消除浮点误差
const r2 = (n) => Math.round((n || 0) * 100) / 100;

// 获取学生列表
students.get('/list', validateQuery(studentQuerySchema), async (c) => {
  const DB = c.env.DB;
  const { page, page_size, search, status, sort, order } = c.req.validatedQuery;

  const pagination = calculatePagination(page, page_size, 0);

  // 构建查询
  let whereClause = 'WHERE 1=1';
  const params = [];

  // 数据隔离：根据用户角色过滤组织数据
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');

  if (userRole !== 'super_admin' && userOrgId) {
    whereClause += ' AND organization_id = ?';
    params.push(parseInt(userOrgId));
  } else if (c.req.query('org_id')) {
    whereClause += ' AND organization_id = ?';
    params.push(parseInt(c.req.query('org_id')));
  }

  if (search) {
    whereClause += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  // 排序
  const sortField = sort || 'created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  const validSortFields = ['id', 'name', 'created_at', 'updated_at', 'status'];
  const safeSortField = validSortFields.includes(sortField) ? sortField : 'created_at';

  // 查询总数
  const countSql = `SELECT COUNT(*) as total FROM students ${whereClause}`;
  const countResult = await DB.prepare(countSql).bind(...params).first();
  const total = countResult?.total || 0;

  // 重新计算分页
  const finalPagination = calculatePagination(page, page_size, total);

  // 查询列表
  const sql = `
    SELECT id, name, english_name, phone, email, age, grade, parent_name, notes, status, total_hours, used_hours, organization_id, created_at, updated_at FROM students 
    ${whereClause}
    
    ORDER BY ${safeSortField} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const results = await DB.prepare(sql).bind(...params, finalPagination.page_size, finalPagination.offset).all();

  const data = results.results?.map(student => ({
    id: student.id,
    name: student.name,
    english_name: student.english_name,
    phone: student.phone,
    email: student.email,
    age: student.age,
    grade: student.grade,
    parent_name: student.parent_name,
    notes: student.notes,
    status: student.status,
    total_hours: r2(student.total_hours),
    used_hours: r2(student.used_hours),
    remaining_hours: r2((student.total_hours || 0) - (student.used_hours || 0)),
    organization_id: student.organization_id,
    created_at: student.created_at,
    updated_at: student.updated_at,
    _links: {
      self: `/api/v1/students/${student.id}`,
      packages: `/api/v1/students/${student.id}/packages`,
      classes: `/api/v1/students/${student.id}/classes`,
      payments: `/api/v1/students/${student.id}/payments`
    }
  })) || [];

  return c.json(success(paginated(data, finalPagination, '/api/v1/students/list')));
});

// 获取单个学生
students.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  // 查询学生信息
  const student = await DB.prepare(`
    SELECT id, name, english_name, phone, email, age, grade, parent_name, notes, status, total_hours, used_hours, created_at, updated_at FROM students 
    WHERE id = ?
    
  `).bind(id).first();

  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 查询课时包
  const packages = await DB.prepare(`
    SELECT * FROM packages
    WHERE student_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).bind(id).all();

  // 查询上课统计
  const classStats = await DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) as this_month
    FROM classes
    WHERE student_id = ? AND status = 'completed'
  `).bind(id).first();

  // 查询付款统计
  const paymentStats = await DB.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now') THEN amount ELSE 0 END), 0) as this_month
    FROM payments
    WHERE student_id = ?
  `).bind(id).first();

  return c.json(success({
    id: student.id,
    name: student.name,
    english_name: student.english_name,
    phone: student.phone,
    email: student.email,
    age: student.age,
    grade: student.grade,
    parent_name: student.parent_name,
    notes: student.notes,
    status: student.status,
    total_hours: r2(student.total_hours),
    used_hours: r2(student.used_hours),
    remaining_hours: r2((student.total_hours || 0) - (student.used_hours || 0)),
    class_stats: {
      total: classStats?.total || 0,
      this_month: classStats?.this_month || 0
    },
    payment_stats: {
      total: paymentStats?.total || 0,
      this_month: paymentStats?.this_month || 0
    },
    created_at: student.created_at,
    updated_at: student.updated_at,
    _links: {
      self: `/api/v1/students/${student.id}`,
      packages: `/api/v1/students/${student.id}/packages`,
      classes: `/api/v1/students/${student.id}/classes`,
      payments: `/api/v1/students/${student.id}/payments`
    }
  }));
});

// 创建学生
students.post('/', validate(studentSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.validated;

  // 数据隔离：自动获取所属机构
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');
  const organizationId = (userRole !== 'super_admin' && userOrgId)
    ? parseInt(userOrgId)
    : (data.organization_id || 1);

  const result = await DB.prepare(`
    INSERT INTO students (name, english_name, phone, email, age, grade, parent_name, notes, status, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.name,
    data.english_name || null,
    data.phone || null,
    data.email || null,
    data.age || null,
    data.grade || null,
    data.parent_name || null,
    data.notes || null,
    data.status || 'active',
    organizationId
  ).run();

  return c.json(success({
    id: result.meta.last_row_id,
    name: data.name,
    english_name: data.english_name || null,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
    _links: {
      self: `/api/v1/students/${result.meta.last_row_id}`
    }
  }), 201);
});

// 更新学生
students.patch('/:id', validateParams(idParamSchema), validate(studentUpdateSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const data = c.req.validated;

  // 检查学生是否存在
  const existing = await DB.prepare('SELECT id FROM students WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 构建更新语句
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length > 0) {
    await DB.prepare(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
  }

  // 返回更新后的学生
  const student = await DB.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();

  return c.json(success({
    id: student.id,
    name: student.name,
    status: student.status,
    updated_at: student.updated_at,
    _links: {
      self: `/api/v1/students/${student.id}`
    }
  }));
});

// 删除学生
students.delete('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  // 检查学生是否存在
  const existing = await DB.prepare('SELECT id FROM students WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 删除（级联删除会自动处理关联的 packages, classes, payments）
  await DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();

  return c.body(null, 204);
});

// 兼容路由：GET /students 等同于 GET /students/list
students.get('/', async (c) => {
  const DB = c.env.DB;

  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';
  const search = c.req.query('search');
  const status = c.req.query('status');

  const pagination = calculatePagination(page, pageSize, 0);

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 数据隔离：根据用户角色过滤组织数据
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');

  if (userRole !== 'super_admin' && userOrgId) {
    whereClause += ' AND organization_id = ?';
    params.push(parseInt(userOrgId));
  } else if (c.req.query('org_id')) {
    whereClause += ' AND organization_id = ?';
    params.push(parseInt(c.req.query('org_id')));
  }

  if (search) {
    whereClause += ' AND (name LIKE ? OR english_name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countSql = `SELECT COUNT(*) as total FROM students ${whereClause}`;
  const countResult = await DB.prepare(countSql).bind(...params).first();
  const total = countResult?.total || 0;

  const finalPagination = calculatePagination(page, pageSize, total);

  const sql = `
    SELECT id, name, english_name, phone, email, age, grade, parent_name, notes, status, total_hours, used_hours, organization_id, created_at, updated_at FROM students 
    ${whereClause}
    
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const results = await DB.prepare(sql).bind(...params, finalPagination.page_size, finalPagination.offset).all();

  const data = results.results?.map(student => ({
    id: student.id,
    name: student.name,
    english_name: student.english_name,
    phone: student.phone,
    email: student.email,
    age: student.age,
    grade: student.grade,
    parent_name: student.parent_name,
    notes: student.notes,
    status: student.status,
    total_hours: r2(student.total_hours),
    used_hours: r2(student.used_hours),
    remaining_hours: r2((student.total_hours || 0) - (student.used_hours || 0)),
    organization_id: student.organization_id,
    created_at: student.created_at,
    updated_at: student.updated_at,
    _links: {
      self: `/api/v1/students/${student.id}`,
      packages: `/api/v1/students/${student.id}/packages`,
      classes: `/api/v1/students/${student.id}/classes`,
      payments: `/api/v1/students/${student.id}/payments`
    }
  })) || [];

  return c.json(success(paginated(data, finalPagination, '/api/v1/students')));
});


// 增加学生课时（直接更新 total_hours）
students.patch('/:id/add-hours', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const body = await c.req.json();
  const hours = parseInt(body.hours) || 0;

  if (hours <= 0) {
    return c.json(error('BAD_REQUEST', '课时数必须大于0'), 400);
  }

  // 检查学生是否存在
  const student = await DB.prepare('SELECT id, total_hours, used_hours FROM students WHERE id = ?').bind(id).first();
  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 更新课时
  const newTotal = (student.total_hours || 0) + hours;
  await DB.prepare('UPDATE students SET total_hours = ?, updated_at = ? WHERE id = ?')
    .bind(newTotal, new Date().toISOString(), id)
    .run();

  return c.json(success({
    id,
    added_hours: hours,
    total_hours: r2(newTotal),
    used_hours: r2(student.used_hours),
    remaining_hours: r2(newTotal - (student.used_hours || 0))
  }));
});

// 调整学生课时（可增可减）
students.patch('/:id/adjust-hours', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { adjustment, reason } = await c.req.json();

  if (!adjustment || adjustment === 0) {
    return c.json(error('VALIDATION_ERROR', '调整数量不能为0'), 400);
  }

  const student = await DB.prepare('SELECT id, name, total_hours, used_hours FROM students WHERE id = ?').bind(id).first();
  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  const newTotal = Math.max(0, (student.total_hours || 0) + adjustment);
  const newRemaining = newTotal - (student.used_hours || 0);

  await DB.prepare('UPDATE students SET total_hours = ?, updated_at = ? WHERE id = ?')
    .bind(newTotal, new Date().toISOString(), id)
    .run();

  // 记录课时变动
  await DB.prepare(`
    INSERT INTO hour_changes (student_id, type, amount, description)
    VALUES (?, 'adjust', ?, ?)
  `).bind(id, adjustment, reason || '手动调整').run();
  return c.json(success({
    id: student.id,
    name: student.name,
    previous_total: r2(student.total_hours || 0),
    adjustment: r2(adjustment),
    new_total: r2(newTotal),
    remaining_hours: r2(newTotal - (student.used_hours || 0)),
    reason: reason || '手动调整'
  }));
});


export default students;
