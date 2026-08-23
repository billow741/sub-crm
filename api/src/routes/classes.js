/**
 * Classes 路由
 * P1: 上课记录 CRUD
 */
import { Hono } from 'hono';
import { classSchema, classUpdateSchema, validate, validateParams, idParamSchema, paginationSchema, validateQuery } from '../utils/validation.js';
import { success, error, calculatePagination } from '../utils/response.js';

const classes = new Hono();

// ── 课时系数辅助 ──
// 优先使用 organization.short_class_coefficient，否则用 settings 中的全局值
async function resolveCoefficient(DB, orgId) {
  if (orgId) {
    const org = await DB.prepare('SELECT short_class_coefficient FROM organizations WHERE id = ?').bind(orgId).first();
    if (org && org.short_class_coefficient !== null) {
      return parseFloat(org.short_class_coefficient);
    }
  }
  const setting = await DB.prepare("SELECT value FROM settings WHERE key = 'short_class_coefficient'").first();
  return setting ? parseFloat(setting.value) : 0.66;
}

// 根据 data.duration 或 data.hours 计算实际课时数
async function resolveClassHours(DB, data, orgId) {
  // 如果有 duration（分钟），按系数计算
  if (data.duration) {
    const dur = parseInt(data.duration);
    if (dur === 50 || dur === 60) return 1.0;
    if (dur === 25) return await resolveCoefficient(DB, orgId);
    return 1.0; // 其他时长默认按1课时
  }
  // 兼容：前端直接传 hours 的情况
  return data.hours || 1;
}

// ── 老师时间冲突检查 ──
// 同一老师、同一日期、时间区间重叠（排除 cancelled 状态）
// 返回冲突记录数组（空=无冲突）
async function checkTeacherConflict(DB, { teacherId, date, startTime, endTime, excludeId = null }) {
  if (!teacherId || !date || !startTime || !endTime) return [];
  const conflicts = await DB.prepare(`
    SELECT id, student_id, date, start_time, end_time, status
    FROM classes
    WHERE teacher_id = ?
      AND date = ?
      AND status != 'cancelled'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND start_time < ?
      AND end_time > ?
      ${excludeId ? 'AND id != ?' : ''}
  `).bind(teacherId, date, endTime, startTime, ...(excludeId ? [excludeId] : [])).all();
  return conflicts.results || [];
}

// 获取所有上课记录（支持过滤）
classes.get('/', async (c) => {
  const DB = c.env.DB;
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '20';
  const studentId = c.req.query('student_id');
  const teacherId = c.req.query('teacher_id');
  const status = c.req.query('status');

  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const params = [];

  // 数据隔离：根据用户角色过滤组织数据
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  const userOrgId = c.req.header('X-Organization-Id');

  if (userRole !== 'super_admin' && userOrgId) {
    whereClause += ' AND c.organization_id = ?';
    params.push(parseInt(userOrgId));
  } else if (c.req.query('org_id')) {
    whereClause += ' AND c.organization_id = ?';
    params.push(parseInt(c.req.query('org_id')));
  }

  if (studentId) {
    whereClause += ' AND c.student_id = ?';
    params.push(parseInt(studentId));
  }
  if (teacherId) {
    whereClause += ' AND c.teacher_id = ?';
    params.push(parseInt(teacherId));
  }
  if (status) {
    whereClause += ' AND c.status = ?';
    params.push(status);
  }

  // 查总数
  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM classes c ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;

  // 分页查询
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const data = await DB.prepare(`
    SELECT c.*, s.name as student_name, s.grade as student_grade, p.name as package_name, t.name as teacher_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN teachers t ON c.teacher_id = t.id
    ${whereClause}
    ORDER BY c.date DESC, c.start_time DESC
    LIMIT ? OFFSET ?
  `).bind(...params, parseInt(pageSize), offset).all();

  // 计算分页信息
  const pagination = calculatePagination(parseInt(page), parseInt(pageSize), total);

  return c.json(success({ data: data.results || [], pagination }));
});

// 获取单个上课记录
classes.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const cls = await DB.prepare(`
    SELECT c.*, s.name as student_name, s.grade as student_grade, p.name as package_name, t.name as teacher_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `).bind(id).first();

  if (!cls) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

return c.json(success({
  id: cls.id,
  student_id: cls.student_id,
  student_name: cls.student_name,
  student_grade: cls.student_grade,
  package_id: cls.package_id,
  package_name: cls.package_name,
  teacher: cls.teacher,
  teacher_id: cls.teacher_id,
  teacher_name: cls.teacher_name,
  subject: cls.subject,
  hours: cls.hours,
  date: cls.date,
  start_time: cls.start_time,
  end_time: cls.end_time,
  content: cls.content,
  homework: cls.homework,
  notes: cls.notes,
  class_link: cls.class_link,
  is_trial: cls.is_trial || 0,
  status: cls.status,
  organization_id: cls.organization_id,
  created_at: cls.created_at,
  updated_at: cls.updated_at,
  fb_lesson_level: cls.fb_lesson_level,
  fb_unit: cls.fb_unit,
  fb_lesson: cls.fb_lesson,
  fb_vocab: cls.fb_vocab,
  fb_patterns: cls.fb_patterns,
  fb_grammar: cls.fb_grammar,
  fb_pronunciation_errors: cls.fb_pronunciation_errors,
  fb_grammar_errors: cls.fb_grammar_errors,
  fb_teacher_message: cls.fb_teacher_message,
  fb_homework: cls.fb_homework,
  fb_next_preview: cls.fb_next_preview,
  duration: cls.duration,
}));
});

// 创建上课记录（指定学生）
classes.post('/student/:student_id', validate(classSchema), async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.param('student_id');
  const data = c.req.validated;

  // ── 自动计算 end_time（如果传了 duration 但没传 end_time）──
  if (data.duration && data.start_time && !data.end_time) {
    const [hh, mm] = data.start_time.split(':').map(Number);
    const totalMinutes = hh * 60 + mm + parseInt(data.duration);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    data.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // 检查学生是否存在
  const student = await DB.prepare('SELECT id, name FROM students WHERE id = ?').bind(studentId).first();
  if (!student) {
    return c.json(error('NOT_FOUND', '学生不存在'), 404);
  }

  // 如果指定了课时包，检查是否属于该学生
  if (data.package_id) {
    const pkg = await DB.prepare('SELECT id, student_id FROM packages WHERE id = ?').bind(data.package_id).first();
    if (!pkg || pkg.student_id !== parseInt(studentId)) {
      return c.json(error('INVALID_PACKAGE', '课时包不存在或不属于该学生'), 400);
    }
  }

  // ── 老师时间冲突检查 ──
  if (data.teacher_id && data.date && data.start_time && data.end_time) {
    const conflicts = await checkTeacherConflict(DB, {
      teacherId: data.teacher_id,
      date: data.date,
      startTime: data.start_time,
      endTime: data.end_time
    });
    if (conflicts.length > 0) {
      // 查冲突记录的学生名做提示
      const conflictStudentIds = conflicts.map(c => c.student_id);
      const studentNames = await DB.prepare(
        `SELECT id, name FROM students WHERE id IN (${conflictStudentIds.map(() => '?').join(',')})`
      ).bind(...conflictStudentIds).all();
      const names = (studentNames.results || []).map(s => s.name).join('、');
      return c.json(error('TEACHER_CONFLICT',
        `教师时间冲突！该教师 ${data.date} ${data.start_time}-${data.end_time} 已有课程（${names}）`
      ), 409);
    }
  }

  // 数据隔离：获取所属机构
  // 优先使用前端传入的 organization_id，否则从 header 取
  let organizationId;
  if (data.organization_id !== undefined && data.organization_id !== null) {
    organizationId = parseInt(data.organization_id);
  } else {
    const userRole = c.req.header('X-User-Role') || 'org_admin';
    const userOrgId = c.req.header('X-Organization-Id');
    organizationId = (userRole !== 'super_admin' && userOrgId) ? parseInt(userOrgId) : 1;
  }

  const result = await DB.prepare(`
    INSERT INTO classes (student_id, package_id, teacher, teacher_id, subject, hours, date, start_time, end_time, duration, content, homework, notes, status, organization_id, is_trial,
                        textbook_code, unit_number, page_from, page_to,
                        fb_unit, fb_lesson, fb_lesson_level, fb_vocab, fb_patterns, fb_grammar,
                        fb_pronunciation_errors, fb_grammar_errors, fb_teacher_message, fb_homework, fb_next_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    studentId,
    data.package_id || null,
    data.teacher || null,
    data.teacher_id || null,
    data.subject || null,
    data.is_trial ? 0 : await resolveClassHours(DB, data, organizationId),
    data.date || new Date().toISOString().split('T')[0],
    data.start_time || null,
    data.end_time || null,
    data.duration || null,
    data.content || null,
    data.homework || null,
    data.notes || null,
    data.status || 'completed',
    organizationId,
    data.is_trial || 0,
    data.textbook_code || null,
    data.unit_number || null,
    data.page_from || null,
    data.page_to || null,
    data.fb_unit || null,
    data.fb_lesson || null,
    data.fb_lesson_level || null,
    data.fb_vocab || null,
    data.fb_patterns || null,
    data.fb_grammar || null,
    data.fb_pronunciation_errors || null,
    data.fb_grammar_errors || null,
    data.fb_teacher_message || null,
    data.fb_homework || null,
    data.fb_next_preview || null
  ).run();

  const classId = result.meta.last_row_id;
  const classHours = await resolveClassHours(DB, data, organizationId);
  const classStatus = data.status || 'completed';
  const isTrial = data.is_trial || 0;

  // 体验课免费，不扣课时（机构课时包 + 学生课时都不扣）
  if (!isTrial) {
  // ── 同步机构课时包 ──
  if (organizationId && classStatus === 'completed') {
    // 找该机构最新 pending/partial_paid 包，增加 used_hours
    const targetPkg = await DB.prepare(
      `SELECT id FROM org_packages
       WHERE org_id = ? AND status IN ('pending', 'partial_paid')
       ORDER BY created_at DESC LIMIT 1`
    ).bind(organizationId).first();

    if (targetPkg) {
      await DB.prepare(
        `UPDATE org_packages SET used_hours = used_hours + ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(classHours, targetPkg.id).run();

      await DB.prepare(
        `INSERT INTO hour_changes (org_package_id, student_id, class_id, change_type, hours_change, note, created_by)
         VALUES (?, ?, ?, 'deduct', ?, ?, 'system')`
      ).bind(targetPkg.id, studentId, classId, classHours, `上课扣除 ${classHours} 课时 (class ${classId})`).run();
    }
  }

  // ── 同步学生课时 ──
  const studentHours = await DB.prepare('SELECT total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
  if (studentHours && classStatus === 'completed') {
    await DB.prepare(
      `UPDATE students SET used_hours = used_hours + ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(classHours, studentId).run();

    await DB.prepare(
      `INSERT INTO hour_changes (student_id, class_id, change_type, hours_change, note, created_by)
       VALUES (?, ?, 'deduct', ?, ?, 'system')`
    ).bind(studentId, classId, classHours, `上课扣除 ${classHours} 课时 (class ${classId})`).run();
  }
  }

  const newClass = await DB.prepare(`
    SELECT c.*, s.name as student_name, s.grade as student_grade, p.name as package_name, t.name as teacher_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `).bind(classId).first();

  return c.json(success({
    id: newClass.id,
    student_id: newClass.student_id,
    student_name: newClass.student_name,
    student_grade: newClass.student_grade,
    package_id: newClass.package_id,
    package_name: newClass.package_name,
    teacher: newClass.teacher,
    teacher_id: newClass.teacher_id,
    teacher_name: newClass.teacher_name,
    subject: newClass.subject,
    hours: newClass.hours,
    date: newClass.date,
    start_time: newClass.start_time,
    end_time: newClass.end_time,
    content: newClass.content,
    homework: newClass.homework,
    notes: newClass.notes,
    class_link: newClass.class_link,
    is_trial: newClass.is_trial || 0,
    status: newClass.status,
    organization_id: newClass.organization_id,
    created_at: newClass.created_at,
    updated_at: newClass.updated_at,
    fb_lesson_level: newClass.fb_lesson_level,
    fb_unit: newClass.fb_unit,
    fb_lesson: newClass.fb_lesson,
    fb_vocab: newClass.fb_vocab,
    fb_patterns: newClass.fb_patterns,
    fb_grammar: newClass.fb_grammar,
    fb_pronunciation_errors: newClass.fb_pronunciation_errors,
    fb_grammar_errors: newClass.fb_grammar_errors,
    fb_teacher_message: newClass.fb_teacher_message,
    fb_homework: newClass.fb_homework,
    fb_next_preview: newClass.fb_next_preview,
    duration: newClass.duration,
  }), 201);
});

// 更新上课记录
classes.patch('/:id', validateParams(idParamSchema), validate(classUpdateSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const data = c.req.validated;

  // ── 自动计算 end_time（如果传了 duration 但没传 end_time）──
  if (data.duration && data.start_time && !data.end_time) {
    const [hh, mm] = data.start_time.split(':').map(Number);
    const totalMinutes = hh * 60 + mm + parseInt(data.duration);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    data.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // 检查记录是否存在
  const existing = await DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

  // 如果指定了课时包，检查是否属于该学生
  if (data.package_id) {
    const pkg = await DB.prepare('SELECT id, student_id FROM packages WHERE id = ?').bind(data.package_id).first();
    if (!pkg || pkg.student_id !== existing.student_id) {
      return c.json(error('INVALID_PACKAGE', '课时包不存在或不属于该学生'), 400);
    }
  }

  // ── 老师时间冲突检查 ──
  const checkTeacherId = data.teacher_id ?? existing.teacher_id;
  const checkDate = data.date ?? existing.date;
  const checkStart = data.start_time ?? existing.start_time;
  const checkEnd = data.end_time ?? existing.end_time;

  if (checkTeacherId && checkDate && checkStart && checkEnd) {
    const conflicts = await checkTeacherConflict(DB, {
      teacherId: checkTeacherId,
      date: checkDate,
      startTime: checkStart,
      endTime: checkEnd,
      excludeId: parseInt(id)
    });
    if (conflicts.length > 0) {
      const conflictStudentIds = conflicts.map(c => c.student_id);
      const studentNames = await DB.prepare(
        `SELECT id, name FROM students WHERE id IN (${conflictStudentIds.map(() => '?').join(',')})`
      ).bind(...conflictStudentIds).all();
      const names = (studentNames.results || []).map(s => s.name).join('、');
      return c.json(error('TEACHER_CONFLICT',
        `教师时间冲突！该教师 ${checkDate} ${checkStart}-${checkEnd} 已有课程（${names}）`
      ), 409);
    }
  }

  // 更新字段
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());

  values.push(id);

  await DB.prepare(`UPDATE classes SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  // ── 同步学生等级：如果反馈中 Level 有变化，更新学生档案的 grade ──
  if (data.fb_lesson_level && existing.student_id) {
    const currentStudent = await DB.prepare('SELECT grade FROM students WHERE id = ?').bind(existing.student_id).first();
    if (currentStudent && currentStudent.grade !== data.fb_lesson_level) {
      await DB.prepare('UPDATE students SET grade = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(data.fb_lesson_level, existing.student_id).run();
    }
  }

  // ── 同步机构课时包 ──
  // 当 status 在 completed ↔ 其他 之间切换时，调整 org_packages.used_hours
  const oldStatus = existing.status;
  const newStatus = data.status ?? oldStatus;
  const clsHours = data.hours ?? existing.hours;
  const clsOrgId = existing.organization_id;
  const isTrialUpdate = existing.is_trial || data.is_trial || 0;

  // 体验课免费，不扣课时
  if (!isTrialUpdate) {
  if (clsOrgId && oldStatus !== newStatus) {
    let delta = 0;
    let note = '';
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      // 非完成 → 完成：增加消耗
      delta = clsHours;
      note = `课程标记完成 +${clsHours}节 (class ${id})`;
    } else if (oldStatus === 'completed' && newStatus !== 'completed') {
      // 完成 → 非完成：回退消耗
      delta = -clsHours;
      note = `课程取消完成 -${clsHours}节 (class ${id})`;
    }

    if (delta !== 0) {
      const targetPkg = await DB.prepare(
        `SELECT id FROM org_packages
         WHERE org_id = ? AND status IN ('pending', 'partial_paid')
         ORDER BY created_at DESC LIMIT 1`
      ).bind(clsOrgId).first();

      if (targetPkg) {
        await DB.prepare(
          `UPDATE org_packages SET used_hours = used_hours + ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(delta, targetPkg.id).run();

        await DB.prepare(
          `INSERT INTO hour_changes (org_package_id, student_id, class_id, change_type, hours_change, note, created_by)
           VALUES (?, ?, ?, 'adjust', ?, ?, 'system')`
        ).bind(targetPkg.id, existing.student_id, id, delta, note).run();
      }
    }
  }

  // ── 同步学生课时 ──
  if (oldStatus !== newStatus) {
    let delta = 0;
    let note = '';
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      delta = clsHours;
      note = `课程标记完成 +${clsHours}节 (class ${id})`;
    } else if (oldStatus === 'completed' && newStatus !== 'completed') {
      delta = -clsHours;
      note = `课程取消完成 -${clsHours}节 (class ${id})`;
    }

    if (delta !== 0) {
      await DB.prepare(
        `UPDATE students SET used_hours = used_hours + ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(delta, existing.student_id).run();

      await DB.prepare(
        `INSERT INTO hour_changes (student_id, class_id, change_type, hours_change, note, created_by)
         VALUES (?, ?, 'adjust', ?, ?, 'system')`
      ).bind(existing.student_id, id, delta, note).run();
    }
  }
  }

  // ── 里程碑自动检测 ──
  // 仅当非体验课、状态变为 completed 时触发
  let milestone = null;
  if (!isTrialUpdate && newStatus === 'completed' && oldStatus !== 'completed') {
    // 查该学生已完成非体验课数量
    const completedCount = await DB.prepare(
      'SELECT COUNT(*) as cnt FROM classes WHERE student_id = ? AND status = ? AND is_trial = 0'
    ).bind(existing.student_id, 'completed').first();

    const milestones = [10, 30, 60];
    for (const m of milestones) {
      if (completedCount.cnt === m) {
        milestone = { type: 'milestone', completedCount: m, reportType: `milestone_${m}` };
        break;
      }
    }

    if (milestone) {
      const reportType = milestone.reportType || milestone.levelUp?.reportType;
      if (reportType) {
        const existingReport = await DB.prepare(
          'SELECT id FROM progress_reports WHERE student_id = ? AND report_type = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(existing.student_id, reportType).first();
        if (existingReport) {
          milestone.alreadyExists = true;
        } else {
          milestone.alreadyExists = false;
        }
      }
    }
  }

  // 重新查询更新后的记录
  const updated = await DB.prepare(`
    SELECT c.*, s.name as student_name, s.grade as student_grade, p.name as package_name, t.name as teacher_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `).bind(id).first();

return c.json(success({
  id: updated.id,
  student_id: updated.student_id,
  student_name: updated.student_name,
  student_grade: updated.student_grade,
  package_id: updated.package_id,
  package_name: updated.package_name,
  teacher: updated.teacher,
  teacher_id: updated.teacher_id,
  teacher_name: updated.teacher_name,
  subject: updated.subject,
  hours: updated.hours,
  date: updated.date,
  start_time: updated.start_time,
  end_time: updated.end_time,
  content: updated.content,
  homework: updated.homework,
  notes: updated.notes,
  class_link: updated.class_link,
  is_trial: updated.is_trial || 0,
  status: updated.status,
  organization_id: updated.organization_id,
  created_at: updated.created_at,
  updated_at: updated.updated_at,
  fb_lesson_level: updated.fb_lesson_level,
  fb_unit: updated.fb_unit,
  fb_lesson: updated.fb_lesson,
  fb_vocab: updated.fb_vocab,
  fb_patterns: updated.fb_patterns,
  fb_grammar: updated.fb_grammar,
  fb_pronunciation_errors: updated.fb_pronunciation_errors,
  fb_grammar_errors: updated.fb_grammar_errors,
  fb_teacher_message: updated.fb_teacher_message,
  fb_homework: updated.fb_homework,
  fb_next_preview: updated.fb_next_preview,
  duration: updated.duration,
  milestone: milestone
}));
});

// 删除上课记录
classes.delete('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  // 检查上课记录是否存在
  const cls = await DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first();
  if (!cls) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

  // 如果是已完成状态，恢复课时
  if (cls.status === 'completed') {
    // 1. 恢复学生 used_hours
    const student = await DB.prepare('SELECT total_hours, used_hours FROM students WHERE id = ?').bind(cls.student_id).first();
    if (student) {
      await DB.prepare('UPDATE students SET used_hours = used_hours - ?, updated_at = datetime(\'now\') WHERE id = ?').bind(cls.hours, cls.student_id).run();
    }

    // 2. 恢复机构课时包
    if (cls.organization_id) {
      const targetPkg = await DB.prepare(
        `SELECT id FROM org_packages
         WHERE org_id = ? AND status IN ('pending', 'partial_paid')
         ORDER BY created_at DESC LIMIT 1`
      ).bind(cls.organization_id).first();

      if (targetPkg) {
        await DB.prepare('UPDATE org_packages SET used_hours = used_hours - ?, updated_at = datetime(\'now\') WHERE id = ?').bind(cls.hours, targetPkg.id).run();
      }
    }

    // 3. 记录 hour_changes（恢复）
    await DB.prepare(
      `INSERT INTO hour_changes (org_package_id, student_id, class_id, change_type, hours_change, note, created_by)
       VALUES (?, ?, ?, 'restore', ?, ?, 'system')`
    ).bind(targetPkg?.id || null, cls.student_id, id, -cls.hours, `删除课程恢复 ${cls.hours} 课时`).run();
  }

  // 删除记录
  await DB.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();

  return c.json(success({ message: '删除成功' }));
});

export default classes;