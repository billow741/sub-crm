-- ============================================
-- 019_student_textbook_progress.sql
-- 学生教材学习进度跟踪表
-- ============================================

CREATE TABLE IF NOT EXISTS student_textbook_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  textbook_id INTEGER,
  textbook_code TEXT NOT NULL,
  current_unit INTEGER NOT NULL DEFAULT 1,
  current_lesson INTEGER NOT NULL DEFAULT 1,
  total_classes_done INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  started_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  notes TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE SET NULL,
  UNIQUE(student_id, textbook_code)
);

CREATE INDEX IF NOT EXISTS idx_stp_student ON student_textbook_progress (student_id);
CREATE INDEX IF NOT EXISTS idx_stp_textbook ON student_textbook_progress (textbook_code);
