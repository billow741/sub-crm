/**
 * Teachers 路由 - 支持多机构
 */
import { Hono } from 'hono';

const teachers = new Hono();

// 解析 organization_ids (可能是 JSON 字符串或数组)
function parseOrgIds(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    // 兼容旧格式：单个数字
    return [parseInt(val)];
  }
}

// 获取教师列表
teachers.get('/', async (c) => {
  const DB = c.env.DB;

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];

    // 数据隔离：根据用户角色过滤组织数据
    const userRole = c.req.header('X-User-Role') || 'org_admin';
    const userOrgId = c.req.header('X-Organization-Id');

    if (userRole !== 'super_admin' && userOrgId) {
      // 非超管：返回 organization_ids 中包含该机构的教师
      whereClause += ' AND organization_ids LIKE ?';
      params.push(`%${parseInt(userOrgId)}%`);
    } else if (c.req.query('org_id')) {
      const orgId = parseInt(c.req.query('org_id'));
      // 超管筛选：返回包含该机构ID的教师
      whereClause += ' AND (organization_ids LIKE ? OR organization_id = ?)';
      params.push(`%${orgId}%`, orgId);
    }

    const results = await DB.prepare(`SELECT * FROM teachers ${whereClause} ORDER BY name ASC`).bind(...params).all();

    const data = results.results?.map(teacher => ({
      id: teacher.id,
      name: teacher.name,
      phone: teacher.phone,
      email: teacher.email,
      subjects: teacher.subjects ? JSON.parse(teacher.subjects) : [],
      hourly_rate: teacher.hourly_rate,
      hourly_rate_25: teacher.hourly_rate_25,
      status: teacher.status,
      notes: teacher.notes,
      organization_id: teacher.organization_id, // 保留旧字段兼容
      organization_ids: parseOrgIds(teacher.organization_ids),
      created_at: teacher.created_at,
      updated_at: teacher.updated_at
    })) || [];

    return c.json({
      data: {
        data,
        pagination: {
          page: 1,
          page_size: 100,
          total: data.length,
          pages: 1,
          has_next: false,
          has_prev: false
        }
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    return c.json({
      error: { code: 'DATABASE_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    }, 500);
  }
});

// 获取单个教师
teachers.get('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  try {
    const teacher = await DB.prepare('SELECT * FROM teachers WHERE id = ?').bind(id).first();

    if (!teacher) {
      return c.json({
        error: { code: 'NOT_FOUND', message: '教师不存在' },
        meta: { timestamp: new Date().toISOString() }
      }, 404);
    }

    return c.json({
      data: {
        id: teacher.id,
        name: teacher.name,
        phone: teacher.phone,
        email: teacher.email,
        subjects: teacher.subjects ? JSON.parse(teacher.subjects) : [],
        hourly_rate: teacher.hourly_rate,
        hourly_rate_25: teacher.hourly_rate_25,
        status: teacher.status,
        notes: teacher.notes,
        organization_ids: parseOrgIds(teacher.organization_ids),
        created_at: teacher.created_at,
        updated_at: teacher.updated_at
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    return c.json({
      error: { code: 'DATABASE_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    }, 500);
  }
});

// 创建教师
teachers.post('/', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();

  if (!body.name || body.name.trim() === '') {
    return c.json({
      error: { code: 'VALIDATION_ERROR', message: '教师姓名不能为空' },
      meta: { timestamp: new Date().toISOString() }
    }, 400);
  }

  try {
    const subjectsJson = body.subjects ? JSON.stringify(body.subjects) : null;

    // 处理 organization_ids：前端传数组，存为 JSON 字符串
    let orgIds = body.organization_ids;
    if (!orgIds && body.organization_id) {
      orgIds = [parseInt(body.organization_id)];
    }
    if (!orgIds) {
      // 默认归属总部
      orgIds = [1];
    }
    const orgIdsJson = JSON.stringify(orgIds);
    // 兼容旧字段：取第一个作为 organization_id
    const orgIdLegacy = orgIds[0] || 1;

    const result = await DB.prepare(`
      INSERT INTO teachers (name, phone, email, subjects, hourly_rate, status, notes, organization_id, organization_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name,
      body.phone || null,
      body.email || null,
      subjectsJson,
      body.hourly_rate || null,
      body.status || 'active',
      body.notes || null,
      orgIdLegacy,
      orgIdsJson
    ).run();

    return c.json({
      data: {
        id: result.meta.last_row_id,
        name: body.name,
        status: body.status || 'active',
        organization_ids: orgIds,
        created_at: new Date().toISOString()
      },
      meta: { timestamp: new Date().toISOString() }
    }, 201);
  } catch (err) {
    return c.json({
      error: { code: 'DATABASE_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    }, 500);
  }
});

// 更新教师
teachers.patch('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const existing = await DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({
        error: { code: 'NOT_FOUND', message: '教师不存在' },
        meta: { timestamp: new Date().toISOString() }
      }, 404);
    }

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(body)) {
      if (key === 'subjects' && value) {
        fields.push('subjects = ?');
        values.push(JSON.stringify(value));
      } else if (key === 'organization_ids' && value) {
        // 存 JSON 数组字符串
        fields.push('organization_ids = ?');
        values.push(JSON.stringify(value));
        // 同步更新旧的 organization_id 字段（取第一个）
        fields.push('organization_id = ?');
        values.push(Array.isArray(value) ? (value[0] || 1) : 1);
      } else if (key === 'organization_id') {
        // 忽略旧字段单独更新，以 organization_ids 为准
        continue;
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    // 自动更新 updated_at (changed fields)
    if (fields.length > 0) {
      fields.push('updated_at = datetime(\'now\')');
      await DB.prepare(`UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    }

    const teacher = await DB.prepare('SELECT * FROM teachers WHERE id = ?').bind(id).first();

    return c.json({
      data: {
        id: teacher.id,
        name: teacher.name,
        phone: teacher.phone,
        email: teacher.email,
        subjects: teacher.subjects ? JSON.parse(teacher.subjects) : [],
        hourly_rate: teacher.hourly_rate,
        hourly_rate_25: teacher.hourly_rate_25,
        status: teacher.status,
        notes: teacher.notes,
        organization_ids: parseOrgIds(teacher.organization_ids),
        created_at: teacher.created_at,
        updated_at: teacher.updated_at
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    return c.json({
      error: { code: 'DATABASE_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    }, 500);
  }
});

// 删除教师
teachers.delete('/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  try {
    const existing = await DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({
        error: { code: 'NOT_FOUND', message: '教师不存在' },
        meta: { timestamp: new Date().toISOString() }
      }, 404);
    }

    await DB.prepare('DELETE FROM teachers WHERE id = ?').bind(id).run();
    return c.body(null, 204);
  } catch (err) {
    return c.json({
      error: { code: 'DATABASE_ERROR', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    }, 500);
  }
});

export default teachers;
