import { z } from 'zod';

// 通用验证 Schema
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID必须是数字').transform(Number)
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20)
});

// Students Schema
export const studentSchema = z.object({
  name: z.string().min(1, '姓名不能为空').max(100),
  english_name: z.string().max(100).optional().nullable().transform(v => v || null),
  phone: z.string().max(20).optional().nullable().transform(v => v || null),
  email: z.string().email('邮箱格式不正确').optional().nullable().transform(v => v || null),
  age: z.number().int().min(0).max(120).optional().nullable(),
  grade: z.string().max(50).optional().nullable().transform(v => v || null),
  parent_name: z.string().max(100).optional().nullable().transform(v => v || null),
  notes: z.string().optional().nullable().transform(v => v || null),
  status: z.enum(['active', 'inactive', 'graduated']).optional().default('active'),
  organization_id: z.number().int().optional().nullable()
});

export const studentUpdateSchema = studentSchema.partial();

export const studentQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'graduated']).optional(),
  sort: z.string().optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc')
});

// Packages Schema
export const packageSchema = z.object({
  name: z.string().max(100).optional().or(z.literal('')),
  total: z.number().int().positive('总课时必须大于0'),
  used: z.number().int().min(0).optional(),
  price: z.number().min(0).optional(),
  purchase_date: z.string().optional(),
  expire_date: z.string().optional().or(z.literal('')).transform(v => {
    if (!v) return null;
    // 支持 YYYY/MM/DD 格式转换为 YYYY-MM-DD
    return v.replace(/\//g, '-');
  }),
  notes: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'expired', 'refunded']).optional().default('active')
});

export const packageUpdateSchema = packageSchema.partial();

// Classes Schema
export const classSchema = z.object({
  student_id: z.coerce.number().int().positive().optional().nullable(),
  package_id: z.coerce.number().int().positive().optional().nullable(),
  teacher_id: z.coerce.number().int().positive().optional().nullable(),
  teacher: z.string().max(100).optional().nullable().transform(v => v || null),
  subject: z.string().max(100).optional().nullable().transform(v => v || null),
  hours: z.coerce.number().min(0, '课时数不能为负数').default(1),
  date: z.string().optional(),
  start_time: z.string().optional().nullable().transform(v => v || null),
  end_time: z.string().optional().nullable().transform(v => v || null),
  duration: z.coerce.number().int().positive().optional().nullable(),  // 时长(分钟)，用于自动计算 end_time
  content: z.string().optional().nullable().transform(v => v || null),
  homework: z.string().optional().nullable().transform(v => v || null),
  notes: z.string().optional().nullable().transform(v => v || null),
  class_link: z.string().optional().nullable().transform(v => v || null),
  is_trial: z.coerce.number().int().optional().default(0),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'absent']).default('completed'),
  organization_id: z.coerce.number().int().positive().optional().nullable(),
  // 课后反馈结构化字段 (011 重构: 去星级评分, 加发音/语法纠正)
  fb_lesson_level: z.string().optional().nullable().transform(v => v || null),
  fb_unit: z.string().optional().nullable().transform(v => v || null),
  fb_lesson: z.string().optional().nullable().transform(v => v || null),
  fb_vocab: z.string().optional().nullable().transform(v => v || null),
  fb_patterns: z.string().optional().nullable().transform(v => v || null),
  fb_grammar: z.string().optional().nullable().transform(v => v || null),
  fb_pronunciation_errors: z.string().optional().nullable().transform(v => v || null),  // JSON: [{wrong,right}]
  fb_grammar_errors: z.string().optional().nullable().transform(v => v || null),         // JSON: [{wrong,right}]
  fb_teacher_message: z.string().optional().nullable().transform(v => v || null),        // 问候+亮点+练习建议
  fb_homework: z.string().optional().nullable().transform(v => v || null),               // 课后作业(选填)
  fb_next_preview: z.string().optional().nullable().transform(v => v || null),           // 下节课预告(选填)
  // 教材页码引用 (用于家长端嵌入 PDF 页图, 配合 R2 page-img/<code>/<unit>/<page>)
  textbook_code: z.string().optional().nullable().transform(v => v || null),              // 如 EU-S
  unit_number: z.coerce.number().int().optional().nullable(),                             // 如 1
  page_from: z.coerce.number().int().optional().nullable(),                                // 起始页
  page_to: z.coerce.number().int().optional().nullable(),                                  // 结束页
});

export const classUpdateSchema = classSchema.partial();

// Assessments Schema (体验课评估报告)
export const assessmentSchema = z.object({
  class_id: z.number().int().positive('课程ID不能为空'),
  listening_conversation: z.number().int().min(1).max(5).optional().nullable(),
  listening_key_info: z.number().int().min(1).max(5).optional().nullable(),
  listening_comments: z.string().optional().nullable().transform(v => v || null),
  speaking_pronunciation: z.number().int().min(1).max(5).optional().nullable(),
  speaking_communication: z.number().int().min(1).max(5).optional().nullable(),
  speaking_comments: z.string().optional().nullable().transform(v => v || null),
  reading_vocabulary: z.number().int().min(1).max(5).optional().nullable(),
  reading_comprehension: z.number().int().min(1).max(5).optional().nullable(),
  reading_comments: z.string().optional().nullable().transform(v => v || null),
  writing_spelling: z.number().int().min(1).max(5).optional().nullable(),
  writing_sentences: z.number().int().min(1).max(5).optional().nullable(),
  writing_comments: z.string().optional().nullable().transform(v => v || null),
  classroom_participation: z.number().int().min(1).max(5).optional().nullable(),
  classroom_focus: z.number().int().min(1).max(5).optional().nullable(),
  classroom_interaction: z.number().int().min(1).max(5).optional().nullable(),
  classroom_comments: z.string().optional().nullable().transform(v => v || null),
  strengths: z.string().optional().nullable().transform(v => v || null),
  improvements: z.string().optional().nullable().transform(v => v || null),
  recommended_level: z.string().optional().nullable().transform(v => v || null),
  teacher_message: z.string().optional().nullable().transform(v => v || null),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

export const assessmentUpdateSchema = assessmentSchema.partial().omit({ class_id: true });

// Payments Schema - 允许金额为0（赠送课时）
export const paymentSchema = z.object({
  amount: z.number().min(0, '付款金额不能为负数'), // 允许为0（赠送课时）
  payment_method: z.enum(['cash', 'wechat', 'alipay', 'bank', 'other', 'gift']).optional(), // 新增 gift 类型
  package_id: z.number().int().positive().optional(),
  description: z.string().optional().or(z.literal('')),
  date: z.string().optional(),
  receipt_number: z.string().max(50).optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  hours: z.number().min(0).optional().default(0)
});

// Teachers Schema
export const teacherSchema = z.object({
  name: z.string().min(1, '教师姓名不能为空').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('邮箱格式不正确').optional().or(z.literal('')),
  subjects: z.string().optional().or(z.literal('')), // JSON string
  hourly_rate: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  notes: z.string().optional().or(z.literal('')),
  hourly_rate_25: z.number().min(0).optional(),  // 25分钟课单价
  organization_id: z.number().int().optional().nullable(),
  organization_ids: z.array(z.number().int()).optional(),  // 多机构关联
  hours: z.number().min(0).optional().default(0)
});

export const teacherUpdateSchema = teacherSchema.partial();

export const teacherQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

// Settings Schema
export const settingsSchema = z.record(z.string());

// 课时调整 Schema（管理员使用）
export const packageAdjustSchema = z.object({
  adjustment: z.number().int().refine(v => v !== 0, '调整数量不能为0'),
  reason: z.string().min(1, '调整原因不能为空'),
  notes: z.string().optional()
});

/**
 * 验证请求体
 */
export const validate = (schema) => {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const result = schema.parse(body);
      c.req.validated = result;
      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const details = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求参数验证失败',
            details
          },
          meta: { timestamp: new Date().toISOString() }
        }, 400);
      }
      throw err;
    }
  };
};

/**
 * 验证查询参数
 */
export const validateQuery = (schema) => {
  return async (c, next) => {
    try {
      const query = c.req.query();
      const result = schema.parse(query);
      c.req.validatedQuery = result;
      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '查询参数验证失败',
            details: err.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          },
          meta: { timestamp: new Date().toISOString() }
        }, 400);
      }
      throw err;
    }
  };
};

/**
 * 验证 URL 参数
 */
export const validateParams = (schema) => {
  return async (c, next) => {
    try {
      const params = c.req.param();
      const result = schema.parse(params);
      c.req.validatedParams = result;
      await next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'URL参数验证失败',
            details: err.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          },
          meta: { timestamp: new Date().toISOString() }
        }, 400);
      }
      throw err;
    }
  };
};
