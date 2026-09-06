import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';
import { validate, validateParams, idParamSchema } from '../utils/validation.js';
import { z } from 'zod';

const progressReports = new Hono();

// 获取学生里程碑统计数据（辅助生成报告）
progressReports.get('/stats/:student_id', async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.param('student_id');

  const student = await DB.prepare('SELECT id, name, english_name, grade, total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
  if (!student) return c.json(error('NOT_FOUND', '学员不存在'), 404);

  // 统计已完成的正式课程
  const completedClasses = await DB.prepare(`
    SELECT id, date, start_time, textbook_code, unit_number, fb_unit, fb_lesson, fb_vocab, fb_pronunciation_errors, fb_teacher_message
    FROM classes
    WHERE student_id = ? AND status = 'completed' AND is_trial = 0
    ORDER BY date ASC, start_time ASC
  `).bind(studentId).all();

  const classList = completedClasses.results || [];
  const completedCount = classList.length;

  // 统计词汇量（从各节课的 fb_vocab 提取不重复单词数）
  const wordSet = new Set();
  classList.forEach(cls => {
    if (cls.fb_vocab) {
      const words = cls.fb_vocab.split(/[\n,，、;；/]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 1 && !/^[0-9]+$/.test(w));
      words.forEach(w => wordSet.add(w));
    }
  });

  // 统计已生成的里程碑报告
  const existingReports = await DB.prepare(`
    SELECT id, report_type, created_at FROM progress_reports WHERE student_id = ?
  `).bind(studentId).all();

  const reportsMap = {};
  (existingReports.results || []).forEach(r => {
    reportsMap[r.report_type] = r;
  });

  return c.json(success({
    student,
    completed_count: completedCount,
    vocabulary_count: wordSet.size,
    sample_words: Array.from(wordSet).slice(0, 30),
    reports_map: reportsMap
  }));
});

// 获取学生的阶段报告
progressReports.get('/', async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.query('student_id');
  const teacherId = c.req.query('teacher_id');
  const classId = c.req.query('class_id');
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '50';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (studentId) {
    whereClause += ' AND pr.student_id = ?';
    params.push(parseInt(studentId));
  }
  if (teacherId) {
    whereClause += ' AND pr.teacher_id = ?';
    params.push(parseInt(teacherId));
  }
  if (classId) {
    whereClause += ' AND pr.class_id = ?';
    params.push(parseInt(classId));
  }

  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM progress_reports pr ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  const results = await DB.prepare(`
    SELECT pr.*, s.name as student_name, t.name as teacher_name
    FROM progress_reports pr
    LEFT JOIN students s ON pr.student_id = s.id
    LEFT JOIN teachers t ON pr.teacher_id = t.id
    ${whereClause}
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  const data = results.results?.map(r => ({
    id: r.id,
    student_id: r.student_id,
    student_name: r.student_name,
    class_id: r.class_id,
    report_type: r.report_type,
    teacher_id: r.teacher_id,
    teacher_name: r.teacher_name || r.teacher_name,
    summary: r.summary,
    strengths: r.strengths,
    improvements: r.improvements,
    recommendation: r.recommendation,
    teacher_message: r.teacher_message,
    from_level: r.from_level,
    to_level: r.to_level,
    total_lessons_completed: r.total_lessons_completed || 0,
    vocabulary_count: r.vocabulary_count || 0,
    score_listening: r.score_listening || 5,
    score_speaking: r.score_speaking || 5,
    score_interaction: r.score_interaction || 5,
    score_pronunciation: r.score_pronunciation || 5,
    highlight_recording_url: r.highlight_recording_url,
    badge_name: r.badge_name,
    status: r.status,
    organization_id: r.organization_id,
    created_at: r.created_at,
    updated_at: r.updated_at
  })) || [];

  return c.json(success({ data, pagination }));
});

// 获取单个报告
progressReports.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const r = await DB.prepare(`
    SELECT pr.*, s.name as student_name, t.name as teacher_name
    FROM progress_reports pr
    LEFT JOIN students s ON pr.student_id = s.id
    LEFT JOIN teachers t ON pr.teacher_id = t.id
    WHERE pr.id = ?
  `).bind(id).first();

  if (!r) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  return c.json(success({
    id: r.id,
    student_id: r.student_id,
    student_name: r.student_name,
    class_id: r.class_id,
    report_type: r.report_type,
    teacher_id: r.teacher_id,
    teacher_name: r.teacher_name || r.teacher_name,
    summary: r.summary,
    strengths: r.strengths,
    improvements: r.improvements,
    recommendation: r.recommendation,
    teacher_message: r.teacher_message,
    from_level: r.from_level,
    to_level: r.to_level,
    total_lessons_completed: r.total_lessons_completed || 0,
    vocabulary_count: r.vocabulary_count || 0,
    score_listening: r.score_listening || 5,
    score_speaking: r.score_speaking || 5,
    score_interaction: r.score_interaction || 5,
    score_pronunciation: r.score_pronunciation || 5,
    highlight_recording_url: r.highlight_recording_url,
    badge_name: r.badge_name,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
});

// 创建阶段报告
const reportSchema = z.object({
  student_id: z.number().int().positive(),
  class_id: z.number().int().positive().optional().nullable(),
  report_type: z.enum(['milestone_10', 'milestone_30', 'milestone_60', 'milestone_100', 'level_up']),
  teacher_id: z.number().int().positive().optional().nullable(),
  teacher_name: z.string().max(100).optional().nullable().transform(v => v || null),
  summary: z.string().optional().nullable().transform(v => v || null),
  strengths: z.string().optional().nullable().transform(v => v || null),
  improvements: z.string().optional().nullable().transform(v => v || null),
  recommendation: z.string().optional().nullable().transform(v => v || null),
  teacher_message: z.string().optional().nullable().transform(v => v || null),
  from_level: z.string().optional().nullable().transform(v => v || null),
  to_level: z.string().optional().nullable().transform(v => v || null),
  total_lessons_completed: z.number().int().min(0).optional().nullable(),
  vocabulary_count: z.number().int().min(0).optional().nullable(),
  score_listening: z.number().int().min(1).max(5).optional().nullable(),
  score_speaking: z.number().int().min(1).max(5).optional().nullable(),
  score_interaction: z.number().int().min(1).max(5).optional().nullable(),
  score_pronunciation: z.number().int().min(1).max(5).optional().nullable(),
  highlight_recording_url: z.string().optional().nullable().transform(v => v || null),
  badge_name: z.string().max(100).optional().nullable().transform(v => v || null),
  organization_id: z.number().int().positive().optional().nullable()
});

progressReports.post('/', validate(reportSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.validated;

  const result = await DB.prepare(`
    INSERT INTO progress_reports (
      student_id, class_id, report_type, teacher_id, teacher_name,
      summary, strengths, improvements, recommendation, teacher_message,
      from_level, to_level,
      total_lessons_completed, vocabulary_count,
      score_listening, score_speaking, score_interaction, score_pronunciation,
      highlight_recording_url, badge_name,
      status, organization_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
  `).bind(
    data.student_id,
    data.class_id || null,
    data.report_type,
    data.teacher_id || null,
    data.teacher_name || null,
    data.summary || null,
    data.strengths || null,
    data.improvements || null,
    data.recommendation || null,
    data.teacher_message || null,
    data.from_level || null,
    data.to_level || null,
    data.total_lessons_completed || 0,
    data.vocabulary_count || 0,
    data.score_listening || 5,
    data.score_speaking || 5,
    data.score_interaction || 5,
    data.score_pronunciation || 5,
    data.highlight_recording_url || null,
    data.badge_name || null,
    data.organization_id || null
  ).run();

  return c.json(success({ id: result.meta.last_row_id }), 201);
});

// 更新报告
progressReports.patch('/:id', validateParams(idParamSchema), validate(reportSchema.partial()), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const data = c.req.validated;

  const existing = await DB.prepare('SELECT * FROM progress_reports WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  fields.push('updated_at = datetime(\'now\')');
  values.push(id);

  await DB.prepare(`UPDATE progress_reports SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json(success({ id: parseInt(id) }));
});

// 删除报告
progressReports.delete('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const existing = await DB.prepare('SELECT id FROM progress_reports WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  await DB.prepare('DELETE FROM progress_reports WHERE id = ?').bind(id).run();
  return c.json(success({ id: parseInt(id) }));
});

export default progressReports;
