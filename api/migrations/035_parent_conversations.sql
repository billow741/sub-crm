-- 035_parent_conversations.sql
-- 家校沟通 v4.0：家长留言与双语中继流转系统

CREATE TABLE IF NOT EXISTS parent_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL UNIQUE,
  teacher_id INTEGER,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS parent_conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('parent', 'teacher', 'advisor')),
  sender_name TEXT,
  content_zh TEXT,
  content_en TEXT,
  routing_type TEXT CHECK (routing_type IS NULL OR routing_type IN ('to_teacher', 'direct_advisor')),
  relay_status TEXT NOT NULL DEFAULT 'pending' CHECK (relay_status IN ('pending', 'forwarded_to_teacher', 'replied_by_teacher', 'published')),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'internal')),
  handled_by TEXT,
  forwarded_at TEXT,
  replied_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (content_zh IS NOT NULL OR content_en IS NOT NULL),
  FOREIGN KEY (conversation_id) REFERENCES parent_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parent_conv_messages_conv_created ON parent_conversation_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_parent_conversations_teacher ON parent_conversations (teacher_id);
CREATE INDEX IF NOT EXISTS idx_parent_conv_messages_relay_status ON parent_conversation_messages (relay_status);
