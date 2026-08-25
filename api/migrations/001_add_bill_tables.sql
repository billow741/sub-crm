-- ============================================
-- SunnyBridge CRM: 自动扣课时 + 账单推送
-- Migration 001: 只加表/列，不改不删，向后兼容
-- 执行: wrangler d1 execute sunnybridge-crm --remote --file=api/migrations/001_add_bill_tables.sql
-- 注意: SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS，需分步执行或忽略报错
-- ============================================

-- 1. 账单记录表（核心：每笔课时变动的一条流水）
CREATE TABLE IF NOT EXISTS bill_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER,                      -- 关联课程，试听/调课/充值可为空
  type TEXT NOT NULL,                    -- 'class_consume' | 'trial' | 'adjustment' | 'payment'
  hours REAL NOT NULL,                   -- 正=增加(充值/调增)，负=消耗(上课/调减)
  amount INTEGER DEFAULT 0,              -- 金额(分)，消耗类通常为 0
  balance_after REAL NOT NULL,           -- 变动后剩余课时
  note TEXT,                             -- 备注：正课消耗/体验课/人工调整/充值10课时
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bill_student ON bill_records(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_class ON bill_records(class_id);

-- 2. 通知发送记录表（可重试、可审计）
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  type TEXT NOT NULL,                    -- 'bill' | 'low_balance' | 'class_reminder' | 'system'
  channel TEXT NOT NULL,                 -- 'wechat' | 'sms' | 'in_app' | 'email'
  status TEXT DEFAULT 'pending',         -- 'pending' | 'sent' | 'failed' | 'cancelled'
  payload TEXT,                          -- JSON 模板参数
  error_msg TEXT,                        -- 失败原因
  retry_count INTEGER DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_student ON notifications(student_id, created_at DESC);
-- SQLite 不支持部分索引 WHERE 子句，改为普通索引
CREATE INDEX IF NOT EXISTS idx_notif_retry ON notifications(status, retry_count);

-- 3. 运营跟进任务表（低余额、长期未排课、即将过期等）
CREATE TABLE IF NOT EXISTS ops_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  type TEXT NOT NULL,                    -- 'low_balance' | 'no_class_2weeks' | 'expire_soon' | 'trial_followup'
  priority INTEGER DEFAULT 1,            -- 1=高 2=中 3=低
  status TEXT DEFAULT 'open',            -- 'open' | 'doing' | 'done' | 'cancelled'
  assignee_id INTEGER,                   -- 运营/主管 ID
  due_at TEXT,                           -- 截止时间
  meta TEXT,                             -- JSON 扩展：{remaining_hours, last_class_at, package_expire_at}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ops_status ON ops_tasks(status, priority, due_at);
CREATE INDEX IF NOT EXISTS idx_ops_student ON ops_tasks(student_id, type);

-- 4. 课程表：新增实际开始/结束时间（用于计费审计、时长统计）
-- SQLite 不支持 ADD COLUMN IF NOT EXISTS，若列已存在会报错但可忽略
ALTER TABLE classes ADD COLUMN actual_start_at TEXT;   -- ISO8601
ALTER TABLE classes ADD COLUMN actual_end_at TEXT;     -- ISO8601

-- 5. 课时流水表：新增关联字段（方便对账、回溯）
ALTER TABLE hour_changes ADD COLUMN ref_type TEXT;     -- 'class' | 'package' | 'manual' | 'trial'
ALTER TABLE hour_changes ADD COLUMN ref_id INTEGER;    -- 关联 class_id / package_id / null

-- 6. 学生表：新增最后上课时间（用于流失预警）
ALTER TABLE students ADD COLUMN last_class_at TEXT;    -- ISO8601

-- 7. 视图：学生账单汇总（前端直接查，避免复杂 JOIN）
CREATE VIEW IF NOT EXISTS v_student_bill_summary AS
SELECT
  s.id AS student_id,
  s.name,
  s.total_hours,
  s.used_hours,
  ROUND(s.total_hours - s.used_hours, 2) AS remaining_hours,
  COALESCE(SUM(CASE WHEN b.type='payment' THEN b.hours ELSE 0 END), 0) AS total_paid_hours,
  COALESCE(SUM(CASE WHEN b.type='class_consume' THEN b.hours ELSE 0 END), 0) AS total_consumed_hours,
  COALESCE(SUM(CASE WHEN b.type='adjustment' THEN b.hours ELSE 0 END), 0) AS total_adjusted_hours,
  MAX(b.created_at) AS last_bill_at
FROM students s
LEFT JOIN bill_records b ON b.student_id = s.id
GROUP BY s.id, s.name, s.total_hours, s.used_hours;