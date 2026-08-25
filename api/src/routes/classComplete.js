/**
 * Class Completion 路由
 * P0: 上课完成自动扣课时 + 账单生成 + 消息推送
 * 受 FEATURE_AUTO_DEDUCT 环境变量控制
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { validate, validateParams, idParamSchema } from '../utils/validation.js';
import { success, error } from '../utils/response.js';

const classComplete = new Hono();

// 幂等键 Schema
const completeSchema = z.object({
  idempotency_key: z.string().min(1, '幂等键不能为空').max(64),
  feedback: z.object({
    pronunciation_corrections: z.array(z.object({
      wrong: z.string(),
      right: z.string()
    })).optional().default([]),
    grammar_corrections: z.array(z.object({
      wrong: z.string(),
      right: z.string()
    })).optional().default([]),
    homework: z.string().optional().nullable().transform(v => v || null),
    teacher_comment: z.string().optional().nullable().transform(v => v || null),
    textbook_pages: z.array(z.number().int().positive()).optional().default([]),
    vocab_count: z.number().int().min(0).optional().default(0),
    // 兼容旧字段
    fb_pronunciation_errors: z.string().optional().nullable().transform(v => v || null),
    fb_grammar_errors: z.string().optional().nullable().transform(v => v || null),
    fb_teacher_message: z.string().optional().nullable().transform(v => v || null),
    fb_homework: z.string().optional().nullable().transform(v => v || null),
    fb_next_preview: z.string().optional().nullable().transform(v => v || null),
    fb_unit: z.string().optional().nullable().transform(v => v || null),
    fb_lesson: z.string().optional().nullable().transform(v => v || null),
    fb_lesson_level: z.string().optional().nullable().transform(v => v || null),
  })
});

const rollbackSchema = z.object({
  reason: z.string().min(1, '撤销原因不能为空').max(500),
  operator_id: z.number().int().positive().optional(), // 运营/超管 ID
});

const startSchema = z.object({
  actual_start_at: z.string().optional(), // ISO8601，默认服务器时间
});

/**
 * 解析课时系数（复用现有逻辑）
 */
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

async function resolveClassHours(DB, data, orgId) {
  if (data.duration) {
    const dur = parseInt(data.duration);
    if (dur === 50 || dur === 60) return 1.0;
    if (dur === 25) return await resolveCoefficient(DB, orgId);
    return 1.0;
  }
  return data.hours || 1;
}

/**
 * 发送通知（异步，不阻塞主流程）
 */
async function enqueueNotification(DB, { student_id, type, channel, payload }) {
  await DB.prepare(`
    INSERT INTO notifications (student_id, type, channel, status, payload, created_at)
    VALUES (?, ?, ?, 'pending', ?, datetime('now'))
  `).bind(student_id, type, channel, JSON.stringify(payload)).run();
}

/**
 * 创建运营任务
 */
async function createOpsTask(DB, { student_id, type, priority = 1, due_at, meta }) {
  await DB.prepare(`
    INSERT INTO ops_tasks (student_id, type, priority, status, due_at, meta, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'))
  `).bind(student_id, type, priority, due_at, JSON.stringify(meta || {})).run();
}

/**
 * POST /api/v1/classes/:id/start
 * 标记课程开始上课
 */
classComplete.post('/:id/start', validateParams(idParamSchema), validate(startSchema), async (c) => {
  // Feature Flag 检查
  if (c.env.FEATURE_AUTO_DEDUCT !== 'true') {
    return c.json(error('FEATURE_DISABLED', '自动扣课时功能未开启'), 403);
  }

  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { actual_start_at } = c.req.validated;

  const existing = await DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

  if (existing.status !== 'scheduled') {
    return c.json(error('INVALID_STATUS', `只能开始 scheduled 状态的课程，当前状态: ${existing.status}`), 400);
  }

  const startAt = actual_start_at || new Date().toISOString();

  await DB.prepare(`
    UPDATE classes SET status = 'in_progress', actual_start_at = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(startAt, id).run();

  return c.json(success({
    id: parseInt(id),
    status: 'in_progress',
    actual_start_at: startAt
  }));
});

/**
 * POST /api/v1/classes/:id/complete
 * 核心接口：完成上课 -> 扣课时 + 写账单 + 发通知 + 生成任务
 * 幂等：通过 idempotency_key 防重复扣款
 */
classComplete.post('/:id/complete', validateParams(idParamSchema), validate(completeSchema), async (c) => {
  // Feature Flag 检查
  if (c.env.FEATURE_AUTO_DEDUCT !== 'true') {
    return c.json(error('FEATURE_DISABLED', '自动扣课时功能未开启'), 403);
  }

  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { idempotency_key, feedback } = c.req.validated;

  // 1. 幂等检查：用 idempotency_key 作为唯一键
  // 这里用 bill_records 的 note 字段存幂等键，或建独立表；简化版用 note like '%idem:%'
  const existingBill = await DB.prepare(`
    SELECT id, student_id, balance_after FROM bill_records 
    WHERE note LIKE '%idem:' || ? || '%' AND type = 'class_consume'
  `).bind(idempotency_key).first();

  if (existingBill) {
    // 返回原结果（幂等重复调用）
    const student = await DB.prepare('SELECT id, name, total_hours, used_hours FROM students WHERE id = ?').bind(existingBill.student_id).first();
    return c.json(success({
      id: parseInt(id),
      status: 'completed',
      hours_consumed: 0.66,
      student: {
        id: student.id,
        name: student.name,
        total_hours: student.total_hours,
        used_hours: student.used_hours,
        remaining_hours: Math.round((student.total_hours - student.used_hours) * 100) / 100
      },
      bill: {
        id: existingBill.id,
        hours: -0.66,
        balance_after: existingBill.balance_after
      },
      idempotent_replay: true
    }));
  }

  // 2. 校验课程状态
  const existing = await DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

  if (!['scheduled', 'in_progress'].includes(existing.status)) {
    return c.json(error('INVALID_STATUS', `只能完成 scheduled/in_progress 状态的课程，当前状态: ${existing.status}`), 400);
  }

  // 3. 必填校验
  if (!feedback.textbook_pages || feedback.textbook_pages.length === 0) {
    return c.json(error('VALIDATION_ERROR', '教材页码必填'), 400);
  }

  const isTrial = existing.is_trial === 1;
  const classHours = isTrial ? 0 : (existing.hours || 0.66); // 体验课 0 课时
  const studentId = existing.student_id;
  const orgId = existing.organization_id;

  // 4. 开始事务（D1 不支持显式 BEGIN，用批量执行模拟原子性）
  // 实际生产建议用 D1 批量语句或队列保证最终一致性
  try {
    // 4.1 锁定学生行（乐观锁：读取版本）
    const student = await DB.prepare('SELECT id, name, total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
    if (!student) {
      return c.json(error('NOT_FOUND', '学生不存在'), 404);
    }

    // 4.2 余额校验（非体验课）
    if (!isTrial) {
      const remaining = Math.round((student.total_hours - student.used_hours) * 100) / 100;
      if (remaining < classHours - 0.01) { // 允许浮点误差
        return c.json(error('INSUFFICIENT_HOURS', `课时不足：剩余 ${remaining}，需要 ${classHours}`), 400);
      }
    }

    const now = new Date().toISOString();
    const endAt = now;
    const newUsedHours = isTrial ? student.used_hours : Math.round((student.used_hours + classHours) * 100) / 100;
    const newRemaining = Math.round((student.total_hours - newUsedHours) * 100) / 100;

    // 4.3 批量执行所有写操作
    const statements = [];

    // 更新课程状态
    statements.push(DB.prepare(`
      UPDATE classes SET 
        status = 'completed',
        actual_end_at = ?,
        hours = ?,
        fb_pronunciation_errors = ?,
        fb_grammar_errors = ?,
        fb_teacher_message = ?,
        fb_homework = ?,
        fb_next_preview = ?,
        fb_unit = ?,
        fb_lesson = ?,
        fb_lesson_level = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      endAt,
      classHours,
      JSON.stringify(feedback.pronunciation_corrections || []),
      JSON.stringify(feedback.grammar_corrections || []),
      feedback.teacher_comment,
      feedback.homework,
      feedback.fb_next_preview,
      feedback.fb_unit,
      feedback.fb_lesson,
      feedback.fb_lesson_level,
      id
    ));

    // 更新学生 used_hours + last_class_at
    if (!isTrial) {
      statements.push(DB.prepare(`
        UPDATE students SET used_hours = ?, last_class_at = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(newUsedHours, endAt, studentId));
    } else {
      statements.push(DB.prepare(`
        UPDATE students SET last_class_at = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(endAt, studentId));
    }

    // 写 hour_changes（课时流水）
    if (!isTrial) {
      statements.push(DB.prepare(`
        INSERT INTO hour_changes (student_id, type, amount, related_type, related_id, description, created_at)
        VALUES (?, 'class', ?, 'class', ?, ?, datetime('now'))
      `).bind(studentId, -classHours, id, `正课消耗 ${classHours}节`));
    } else {
      statements.push(DB.prepare(`
        INSERT INTO hour_changes (student_id, type, amount, related_type, related_id, description, created_at)
        VALUES (?, 'class', 0, 'class', ?, ?, datetime('now'))
      `).bind(studentId, id, '体验课不扣课时'));
    }

    // 写 bill_records（账单）
    const billNote = isTrial 
      ? `体验课 (idem:${idempotency_key})` 
      : `正课消耗 ${classHours}节 (idem:${idempotency_key})`;
    statements.push(DB.prepare(`
      INSERT INTO bill_records (student_id, class_id, type, hours, amount, balance_after, note, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'))
    `).bind(studentId, id, isTrial ? 'trial' : 'class_consume', isTrial ? 0 : -classHours, newRemaining, billNote));

    // 同步机构课时包（非体验课、有机构）
    if (!isTrial && orgId) {
      statements.push(DB.prepare(`
        UPDATE org_packages SET used_hours = used_hours + ?, updated_at = datetime('now')
        WHERE org_id = ? AND status IN ('pending', 'partial_paid')
        ORDER BY created_at DESC LIMIT 1
      `).bind(classHours, orgId));

      statements.push(DB.prepare(`
        INSERT INTO org_hour_allocations (org_id, package_id, student_id, hours, notes, created_by, created_at)
        SELECT ?, id, ?, ?, ?, 'system', datetime('now')
        FROM org_packages WHERE org_id = ? AND status IN ('pending', 'partial_paid') ORDER BY created_at DESC LIMIT 1
      `).bind(orgId, studentId, -classHours, `课程消耗 -${classHours}节 (class ${id})`, orgId));
    }

    // 执行所有语句
    await DB.batch(statements);

    // 4.4 异步发通知（不阻塞响应）
    // 微信模板消息
    await enqueueNotification(DB, {
      student_id: studentId,
      type: 'bill',
      channel: 'wechat',
      payload: {
        student_name: student.name,
        class_date: existing.date,
        lesson_no: await getCompletedCount(DB, studentId),
        remaining_hours: newRemaining,
        class_id: id
      }
    });

    // 站内信
    await enqueueNotification(DB, {
      student_id: studentId,
      type: 'bill',
      channel: 'in_app',
      payload: {
        student_name: student.name,
        class_date: existing.date,
        hours_consumed: classHours,
        remaining_hours: newRemaining,
        bill_type: isTrial ? 'trial' : 'class_consume'
      }
    });

    // 4.5 低余额任务
    if (!isTrial && newRemaining <= 3 && newRemaining > 0) {
      await createOpsTask(DB, {
        student_id: studentId,
        type: 'low_balance',
        priority: 1,
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h 内跟进
        meta: { remaining_hours: newRemaining, last_class_at: endAt }
      });
    }

    // 4.6 返回结果
    return c.json(success({
      id: parseInt(id),
      status: 'completed',
      hours_consumed: classHours,
      student: {
        id: student.id,
        name: student.name,
        total_hours: student.total_hours,
        used_hours: newUsedHours,
        remaining_hours: newRemaining
      },
      bill: {
        hours: isTrial ? 0 : -classHours,
        balance_after: newRemaining
      }
    }));

  } catch (err) {
    console.error('Complete class error:', err);
    return c.json(error('INTERNAL_ERROR', '完成上课失败，请重试'), 500);
  }
});

/**
 * 获取已完成正课数
 */
async function getCompletedCount(DB, studentId) {
  const res = await DB.prepare(`
    SELECT COUNT(*) as cnt FROM classes 
    WHERE student_id = ? AND status = 'completed' AND is_trial = 0
  `).bind(studentId).first();
  return res?.cnt || 0;
}

/**
 * POST /api/v1/classes/:id/rollback
 * 仅运营/超管：撤销完成态，回滚课时、作废账单、补发通知
 */
classComplete.post('/:id/rollback', validateParams(idParamSchema), validate(rollbackSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const { reason, operator_id } = c.req.validated;

  // 权限检查（简化：检查 header）
  const userRole = c.req.header('X-User-Role') || 'org_admin';
  if (userRole !== 'super_admin' && userRole !== 'ops') {
    return c.json(error('FORBIDDEN', '仅超管/运营可撤销上课'), 403);
  }

  const existing = await DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json(error('NOT_FOUND', '上课记录不存在'), 404);
  }

  if (existing.status !== 'completed') {
    return c.json(error('INVALID_STATUS', '只能撤销已完成的课程'), 400);
  }

  const isTrial = existing.is_trial === 1;
  const classHours = existing.hours || 0.66;
  const studentId = existing.student_id;
  const orgId = existing.organization_id;

  try {
    const student = await DB.prepare('SELECT id, name, total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
    if (!student) {
      return c.json(error('NOT_FOUND', '学生不存在'), 404);
    }

    const newUsedHours = isTrial ? student.used_hours : Math.max(0, Math.round((student.used_hours - classHours) * 100) / 100);
    const newRemaining = Math.round((student.total_hours - newUsedHours) * 100) / 100;
    const now = new Date().toISOString();

    const statements = [];

    // 恢复课程状态
    statements.push(DB.prepare(`
      UPDATE classes SET status = 'scheduled', actual_end_at = NULL, updated_at = datetime('now') WHERE id = ?
    `).bind(id));

    // 恢复学生 used_hours
    if (!isTrial) {
      statements.push(DB.prepare(`
        UPDATE students SET used_hours = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(newUsedHours, studentId));
    }

    // 写回滚流水
    if (!isTrial) {
      statements.push(DB.prepare(`
        INSERT INTO hour_changes (student_id, type, amount, related_type, related_id, description, created_at)
        VALUES (?, 'adjust', ?, 'class', ?, ?, datetime('now'))
      `).bind(studentId, classHours, id, `撤销上课回滚 +${classHours}节：${reason}`));

      statements.push(DB.prepare(`
        INSERT INTO bill_records (student_id, class_id, type, hours, amount, balance_after, note, created_at)
        VALUES (?, ?, 'adjustment', ?, 0, ?, ?, datetime('now'))
      `).bind(studentId, id, classHours, newRemaining, `撤销上课回滚：${reason}`));
    }

    // 作废原账单
    statements.push(DB.prepare(`
      UPDATE bill_records SET note = note || ' [VOIDED: ' || ? || ']' WHERE class_id = ? AND type = 'class_consume'
    `).bind(reason, id));

    // 回退机构课时包
    if (!isTrial && orgId) {
      statements.push(DB.prepare(`
        UPDATE org_packages SET used_hours = MAX(0, used_hours - ?), updated_at = datetime('now')
        WHERE org_id = ? AND status IN ('pending', 'partial_paid')
        ORDER BY created_at DESC LIMIT 1
      `).bind(classHours, orgId));

      statements.push(DB.prepare(`
        INSERT INTO org_hour_allocations (org_id, package_id, student_id, hours, notes, created_by, created_at)
        SELECT ?, id, ?, ?, ?, 'system', datetime('now')
        FROM org_packages WHERE org_id = ? AND status IN ('pending', 'partial_paid') ORDER BY created_at DESC LIMIT 1
      `).bind(orgId, studentId, classHours, `撤销上课回滚 +${classHours}节：${reason}`, orgId));
    }

    await DB.batch(statements);

    // 发送撤销通知
    await enqueueNotification(DB, {
      student_id: studentId,
      type: 'bill',
      channel: 'in_app',
      payload: {
        student_name: student.name,
        action: 'rollback',
        class_date: existing.date,
        hours_rolled_back: classHours,
        remaining_hours: newRemaining,
        reason
      }
    });

    return c.json(success({
      id: parseInt(id),
      status: 'scheduled',
      hours_rolled_back: classHours,
      student: {
        id: student.id,
        name: student.name,
        total_hours: student.total_hours,
        used_hours: newUsedHours,
        remaining_hours: newRemaining
      }
    }));

  } catch (err) {
    console.error('Rollback class error:', err);
    return c.json(error('INTERNAL_ERROR', '撤销失败，请重试'), 500);
  }
});

export default classComplete;