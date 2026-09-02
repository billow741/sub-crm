-- Sunnybridge CRM Database Schema for Cloudflare D1
-- SQLite 语法
-- 完整版 Schema（含所有迁移文件中添加的字段）
-- 最后更新：2026-08-25

-- ============================================
-- 1. Students 表（学生信息）
-- ============================================
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  english_name TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  age INTEGER CHECK (age >= 0 AND age <= 120),
  grade TEXT,
  parent_name TEXT,
  notes TEXT,
  hours INTEGER DEFAULT 0,
  total_hours INTEGER NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  used_hours INTEGER NOT NULL DEFAULT 0 CHECK (used_hours >= 0),
  access_token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  organization_id INTEGER DEFAULT 1,
  last_class_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_name ON students (name);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students (phone);
CREATE INDEX IF NOT EXISTS idx_students_status ON students (status);
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students (created_at);
CREATE INDEX IF NOT EXISTS idx_students_organization ON students (organization_id);

-- ============================================
-- 2. Packages 表（课时包）
-- ============================================
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  name TEXT,
  total INTEGER NOT NULL CHECK (total > 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  remaining INTEGER NOT NULL DEFAULT 0,
  price REAL CHECK (price >= 0),
  purchase_date TEXT NOT NULL DEFAULT (date('now')),
  expire_date TEXT,
  notes TEXT,
  hours INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'refunded')),
  organization_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_packages_student_id ON packages (student_id);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages (status);
CREATE INDEX IF NOT EXISTS idx_packages_expire_date ON packages (expire_date);
CREATE INDEX IF NOT EXISTS idx_packages_organization ON packages (organization_id);

-- ============================================
-- 3. Classes 表（上课记录）
-- 注意：011_feedback_revamp.sql 重建了此表
-- ============================================
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  package_id INTEGER,
  teacher TEXT,
  teacher_id INTEGER,
  subject TEXT,
  hours REAL NOT NULL DEFAULT 1 CHECK (hours >= 0),
  date TEXT NOT NULL DEFAULT (date('now')),
  start_time TEXT,
  end_time TEXT,
  duration INTEGER,
  content TEXT,
  homework TEXT,
  notes TEXT,
  class_link TEXT,
  is_trial INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'absent')),
  organization_id INTEGER DEFAULT 1,
  fb_lesson_level TEXT,
  fb_unit TEXT,
  fb_lesson TEXT,
  fb_vocab TEXT,
  fb_patterns TEXT,
  fb_grammar TEXT,
  fb_pronunciation_errors TEXT,
  fb_grammar_errors TEXT,
  fb_teacher_message TEXT,
  fb_homework TEXT,
  fb_next_preview TEXT,
  fb_recording TEXT,
  fb_recording_r2_key TEXT,
  fb_recording_status TEXT DEFAULT 'none',
  fb_recording_duration INTEGER DEFAULT 0,
  fb_recording_size INTEGER DEFAULT 0,
  textbook_code TEXT,
  unit_number INTEGER,
  page_from INTEGER,
  page_to INTEGER,
  actual_end_at TEXT,
  idempotency_key TEXT UNIQUE,
  is_self_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_classes_student_id ON classes (student_id);
CREATE INDEX IF NOT EXISTS idx_classes_package_id ON classes (package_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes (date);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes (status);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes (teacher);
CREATE INDEX IF NOT EXISTS idx_classes_organization_id ON classes (organization_id);

-- ============================================
-- 3b. Assessments 表（体验课评估报告）
-- ============================================
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  teacher_id INTEGER,
  listening_conversation INTEGER,
  listening_key_info INTEGER,
  listening_comments TEXT,
  speaking_pronunciation INTEGER,
  speaking_communication INTEGER,
  speaking_comments TEXT,
  reading_vocabulary INTEGER,
  reading_comprehension INTEGER,
  reading_comments TEXT,
  writing_spelling INTEGER,
  writing_sentences INTEGER,
  writing_comments TEXT,
  classroom_participation INTEGER,
  classroom_focus INTEGER,
  classroom_interaction INTEGER,
  classroom_comments TEXT,
  strengths TEXT,
  improvements TEXT,
  recommended_level TEXT,
  teacher_message TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  organization_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_class_id ON assessments (class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_student_id ON assessments (student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_teacher_id ON assessments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_assessments_org_id ON assessments (organization_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments (status);

-- ============================================
-- 4. Payments 表（付款记录）
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  payment_method TEXT CHECK (payment_method IN ('cash', 'wechat', 'alipay', 'bank', 'other', 'gift')),
  package_id INTEGER,
  description TEXT,
  date TEXT NOT NULL DEFAULT (date('now')),
  receipt_number TEXT,
  notes TEXT,
  hours INTEGER DEFAULT 0,
  organization_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date);
CREATE INDEX IF NOT EXISTS idx_payments_package_id ON payments (package_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization ON payments (organization_id);

-- ============================================
-- 5. Teachers 表（教师信息）
-- ============================================
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  subjects TEXT,
  hourly_rate REAL CHECK (hourly_rate >= 0),
  hourly_rate_25 REAL DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  hours INTEGER DEFAULT 0,
  organization_id INTEGER DEFAULT 1,
  organization_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers (name);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers (status);
CREATE INDEX IF NOT EXISTS idx_teachers_organization ON teachers (organization_id);

-- ============================================
-- 6. Courses 表（课程模板）
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT,
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced', 'all')),
  duration INTEGER DEFAULT 60,
  price REAL CHECK (price >= 0),
  description TEXT,
  teacher_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_name ON courses (name);
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses (subject);
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses (teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses (status);

-- ============================================
-- 7. Settings 表（系统设置）
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('school_name', '阳光桥在线英语');
INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'CNY');
INSERT OR IGNORE INTO settings (key, value) VALUES ('timezone', 'Asia/Shanghai');
INSERT OR IGNORE INTO settings (key, value) VALUES ('short_class_coefficient', '0.66');

-- ============================================
-- 8. Organizations 表（机构/合作方）
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  notes TEXT,
  login_code TEXT UNIQUE,
  password_hash TEXT,
  unit_price_cny REAL DEFAULT 80,
  unit_price_25_cny REAL DEFAULT 50,
  settlement_day TEXT DEFAULT 'monday',
  credit_limit_cny REAL DEFAULT 0,
  short_class_coefficient REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO organizations (id, name, contact_name, notes, status) VALUES (1, 'SunnyBridge', '系统管理员', '默认机构', 'active');

-- ============================================
-- 9. Hour Changes 表（课时变动记录）
-- ============================================
CREATE TABLE IF NOT EXISTS hour_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payment', 'class', 'adjust')),
  amount REAL NOT NULL,
  balance_after REAL,
  related_id INTEGER,
  related_type TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hour_changes_student_id ON hour_changes (student_id);
CREATE INDEX IF NOT EXISTS idx_hour_changes_created_at ON hour_changes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hour_changes_type ON hour_changes (type);

-- ============================================
-- 10. Teacher Payments 表（教师薪资结算）
-- ============================================
CREATE TABLE IF NOT EXISTS teacher_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_classes INTEGER DEFAULT 0,
  total_hours REAL DEFAULT 0,
  hourly_rate REAL,
  total_amount REAL DEFAULT 0,
  count_50min INTEGER DEFAULT 0,
  count_25min INTEGER DEFAULT 0,
  rate_50min REAL,
  rate_25min REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_method TEXT,
  paid_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- ============================================
-- 11. Org Packages 表（机构课时包）
-- ============================================
CREATE TABLE IF NOT EXISTS org_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  total_hours REAL NOT NULL,
  used_hours REAL DEFAULT 0,
  price_per_hour REAL,
  total_amount REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial_paid', 'paid', 'cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ============================================
-- 12. Org Settlements 表（机构结算）
-- ============================================
CREATE TABLE IF NOT EXISTS org_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_classes INTEGER DEFAULT 0,
  total_hours REAL DEFAULT 0,
  unit_price REAL,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'partial_paid', 'paid', 'cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS org_settlement_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  class_id INTEGER,
  student_id INTEGER,
  teacher_id INTEGER,
  date TEXT,
  hours REAL,
  duration_type TEXT,
  unit_price REAL,
  amount REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (settlement_id) REFERENCES org_settlements(id) ON DELETE CASCADE
);

-- ============================================
-- 13. 教材库
-- ============================================
CREATE TABLE IF NOT EXISTS textbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  series TEXT,
  publisher TEXT,
  level TEXT,
  total_units INTEGER DEFAULT 0,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS textbook_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  textbook_code TEXT NOT NULL,
  unit_number INTEGER NOT NULL,
  unit_title TEXT,
  lesson_count INTEGER DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(textbook_code, unit_number)
);

CREATE TABLE IF NOT EXISTS unit_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES textbook_units(id) ON DELETE CASCADE,
  textbook_code TEXT NOT NULL,
  unit_number INTEGER NOT NULL,
  vocab TEXT,
  patterns TEXT,
  grammar TEXT,
  extracted_by TEXT DEFAULT 'manual',
  extracted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(unit_id)
);

-- ============================================
-- 14. Users 表（用户/权限管理）
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'org_admin' CHECK (role IN ('super_admin', 'org_admin', 'teacher', 'viewer')),
  organization_id INTEGER DEFAULT 1,
  teacher_id INTEGER,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organization_id);

-- ============================================
-- 15. Student Textbook Progress 表（学生教材学习进度）
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