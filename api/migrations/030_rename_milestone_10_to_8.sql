-- 030: 将里程碑类型 milestone_10 重命名为 milestone_8
-- SQLite 不支持直接修改 CHECK 约束，采用建新表 → 迁数据 → 删旧表 → 重命名策略

-- 1. 删除旧临时表（若存在）
DROP TABLE IF EXISTS progress_reports_new;

-- 2. 创建新表（与实际表结构完全一致，仅更新 CHECK 约束）
CREATE TABLE progress_reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  class_id INTEGER,
  report_type TEXT NOT NULL,
  teacher_id INTEGER,
  teacher_name TEXT,
  summary TEXT,
  strengths TEXT,
  improvements TEXT,
  recommendation TEXT,
  teacher_message TEXT,
  from_level TEXT,
  to_level TEXT,
  status TEXT DEFAULT 'published',
  organization_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  total_lessons_completed INTEGER DEFAULT 10,
  vocabulary_count INTEGER DEFAULT 0,
  score_listening INTEGER DEFAULT 5,
  score_speaking INTEGER DEFAULT 5,
  score_interaction INTEGER DEFAULT 5,
  score_pronunciation INTEGER DEFAULT 5,
  highlight_recording_url TEXT,
  badge_name TEXT,
  stage_growth_insights TEXT,
  radar_scores TEXT,
  next_phase_strategy TEXT,
  scheduled_publish_at TEXT
);

-- 3. 将旧表数据复制到新表（milestone_10 → milestone_8，其余不变）
INSERT INTO progress_reports_new
SELECT
  id,
  student_id,
  class_id,
  CASE WHEN report_type = 'milestone_10' THEN 'milestone_8' ELSE report_type END,
  teacher_id,
  teacher_name,
  summary,
  strengths,
  improvements,
  recommendation,
  teacher_message,
  from_level,
  to_level,
  status,
  organization_id,
  created_at,
  updated_at,
  total_lessons_completed,
  vocabulary_count,
  score_listening,
  score_speaking,
  score_interaction,
  score_pronunciation,
  highlight_recording_url,
  badge_name,
  stage_growth_insights,
  radar_scores,
  next_phase_strategy,
  scheduled_publish_at
FROM progress_reports;

-- 4. 同步更新 classes 表中的 milestone_type 字段
UPDATE classes SET milestone_type = 'milestone_8' WHERE milestone_type = 'milestone_10';

-- 5. 删除旧表
DROP TABLE progress_reports;

-- 6. 重命名新表
ALTER TABLE progress_reports_new RENAME TO progress_reports;

-- 7. 重建索引
CREATE INDEX IF NOT EXISTS idx_progress_reports_student ON progress_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_reports_type ON progress_reports(report_type);
