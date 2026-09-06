/**
 * Assessments 路由
 * 体验课评估报告 CRUD
 */
import { Hono } from 'hono';
import { assessmentSchema, assessmentUpdateSchema, validate, validateParams, idParamSchema, paginationSchema, validateQuery } from '../utils/validation.js';
import { success, error, calculatePagination } from '../utils/response.js';

const assessments = new Hono();

// 获取评估报告列表（支持过滤）
assessments.get('/', async (c) => {
  const DB = c.env.DB;
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';
  const studentId = c.req.query('student_id');
  const teacherId = c.req.query('teacher_id');
  const classId = c.req.query('class_id');
  const status = c.req.query('status');
  const isTrial = c.req.query('is_trial');

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 数据隔离
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');
  if (userRole !== 'super_admin' && userOrgId) {
    whereClause += ' AND a.organization_id = ?';
    params.push(parseInt(userOrgId));
  }

  if (studentId) { whereClause += ' AND a.student_id = ?'; params.push(studentId); }
  if (teacherId) { whereClause += ' AND a.teacher_id = ?'; params.push(teacherId); }
  if (classId) { whereClause += ' AND a.class_id = ?'; params.push(classId); }
  if (status) { whereClause += ' AND a.status = ?'; params.push(status); }
  if (isTrial === '1') { whereClause += ' AND c.is_trial = 1'; }

  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM assessments a JOIN classes c ON a.class_id = c.id ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  const results = await DB.prepare(`
    SELECT a.*, 
           s.name as student_name, s.english_name as student_english_name,
           t.name as teacher_name,
           c.date as class_date, c.start_time, c.end_time, c.subject, c.is_trial,
           c.fb_recording, c.fb_recording_r2_key, c.fb_recording_status, c.fb_recording_duration, c.fb_recording_size
    FROM assessments a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN teachers t ON a.teacher_id = t.id
    JOIN classes c ON a.class_id = c.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  return c.json(success({ data: results.results || [], pagination }));
});

// 获取单个评估报告
assessments.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const a = await DB.prepare(`
    SELECT a.*, 
           s.name as student_name, s.english_name as student_english_name, s.age, s.grade,
           t.name as teacher_name, t.subjects as teacher_subjects,
           c.date as class_date, c.start_time, c.end_time, c.subject, c.is_trial, c.hours,
           c.fb_recording, c.fb_recording_r2_key, c.fb_recording_status, c.fb_recording_duration, c.fb_recording_size
    FROM assessments a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN teachers t ON a.teacher_id = t.id
    JOIN classes c ON a.class_id = c.id
    WHERE a.id = ?
  `).bind(id).first();

  if (!a) {
    return c.json(error('NOT_FOUND', '评估报告不存在'), 404);
  }

  return c.json(success(a));
});

// 获取某课程的评估报告
assessments.get('/class/:class_id', async (c) => {
  const DB = c.env.DB;
  const classId = c.req.param('class_id');

  const a = await DB.prepare(`
    SELECT a.*, 
           s.name as student_name, s.english_name as student_english_name,
           t.name as teacher_name,
           c.date as class_date, c.start_time, c.end_time, c.subject, c.is_trial,
           c.fb_recording, c.fb_recording_r2_key, c.fb_recording_status, c.fb_recording_duration, c.fb_recording_size
    FROM assessments a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN teachers t ON a.teacher_id = t.id
    JOIN classes c ON a.class_id = c.id
    WHERE a.class_id = ?
  `).bind(classId).first();

  if (!a) {
    return c.json(error('NOT_FOUND', '该课程暂无评估报告'), 404);
  }

  return c.json(success(a));
});

// 创建评估报告
assessments.post('/', validate(assessmentSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.validated;

  try {
  // 检查课程是否存在
  const cls = await DB.prepare('SELECT id, student_id, teacher_id, organization_id, is_trial FROM classes WHERE id = ?').bind(data.class_id).first();
  if (!cls) {
    return c.json(error('NOT_FOUND', '课程不存在'), 404);
  }

  // 检查是否已有评估报告（同一课程只能有一个）
  const existing = await DB.prepare('SELECT id FROM assessments WHERE class_id = ?').bind(data.class_id).first();
  if (existing) {
    return c.json(error('DUPLICATE', '该课程已有评估报告，请直接编辑'), 409);
  }

  // 获取 organization_id
  let orgId = cls.organization_id;
  if (!orgId) {
    const userRole = c.req.header('X-User-Role') || 'org_admin';
    const userOrgId = c.req.header('X-Organization-Id');
    orgId = (userRole !== 'super_admin' && userOrgId) ? parseInt(userOrgId) : 1;
  }

  const result = await DB.prepare(`
    INSERT INTO assessments (
      class_id, student_id, teacher_id,
      listening_conversation, listening_key_info, listening_comments,
      speaking_pronunciation, speaking_communication, speaking_comments,
      reading_vocabulary, reading_comprehension, reading_comments,
      writing_spelling, writing_sentences, writing_comments,
      classroom_participation, classroom_focus, classroom_interaction, classroom_comments,
      strengths, improvements, recommended_level, teacher_message,
      status, organization_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.class_id,
    cls.student_id,
    cls.teacher_id || null,
    data.listening_conversation || null,
    data.listening_key_info || null,
    data.listening_comments || null,
    data.speaking_pronunciation || null,
    data.speaking_communication || null,
    data.speaking_comments || null,
    data.reading_vocabulary || null,
    data.reading_comprehension || null,
    data.reading_comments || null,
    data.writing_spelling || null,
    data.writing_sentences || null,
    data.writing_comments || null,
    data.classroom_participation || null,
    data.classroom_focus || null,
    data.classroom_interaction || null,
    data.classroom_comments || null,
    data.strengths || null,
    data.improvements || null,
    data.recommended_level || null,
    data.teacher_message || null,
    data.status || 'draft',
    orgId
  ).run();

  const assessmentId = result.meta.last_row_id;

  if (data.fb_recording !== undefined) {
    try {
      await DB.prepare('UPDATE classes SET fb_recording = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(data.fb_recording, data.class_id).run();
    } catch (recErr) {
      console.warn('Sync fb_recording to class failed:', recErr.message);
    }
  }

  return c.json(success({
    id: assessmentId,
    class_id: data.class_id,
    student_id: cls.student_id,
    teacher_id: cls.teacher_id,
    status: data.status || 'draft',
    fb_recording: data.fb_recording || null,
    created_at: new Date().toISOString()
  }), 201);
  } catch(dbErr) {
    console.error('Assessment INSERT error:', dbErr);
    return c.json(error('INTERNAL_ERROR', '创建评估报告失败: ' + dbErr.message), 500);
  }
});

// 更新评估报告
assessments.patch('/:id', validateParams(idParamSchema), validate(assessmentUpdateSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const data = c.req.validated;

  const existing = await DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '评估报告不存在'), 404);
  }

  if (data.fb_recording !== undefined) {
    try {
      await DB.prepare('UPDATE classes SET fb_recording = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(data.fb_recording, existing.class_id).run();
    } catch (recErr) {
      console.warn('Sync fb_recording to class failed:', recErr.message);
    }
    delete data.fb_recording;
  }

  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  if (fields.length > 1) {
    await DB.prepare(`UPDATE assessments SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await DB.prepare(`
    SELECT a.*, 
           s.name as student_name, s.english_name as student_english_name, s.age, s.grade,
           t.name as teacher_name, t.subjects as teacher_subjects,
           c.date as class_date, c.start_time, c.end_time, c.subject, c.is_trial, c.hours,
           c.fb_recording, c.fb_recording_r2_key, c.fb_recording_status, c.fb_recording_duration, c.fb_recording_size
    FROM assessments a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN teachers t ON a.teacher_id = t.id
    JOIN classes c ON a.class_id = c.id
    WHERE a.id = ?
  `).bind(id).first();
  return c.json(success(updated));
});

// 删除评估报告
assessments.delete('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const existing = await DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '评估报告不存在'), 404);
  }

  await DB.prepare('DELETE FROM assessments WHERE id = ?').bind(id).run();
  return c.json(success({ id: parseInt(id) }));
});

export default assessments;
