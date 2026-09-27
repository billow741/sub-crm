-- 创建小程序合规展示内容库（每日磨耳朵有声金句 + 世界文化奇趣漫游）
CREATE TABLE IF NOT EXISTS mini_program_contents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'daily_spark' | 'culture_bite'
  theme TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  content_en TEXT,
  content_zh TEXT,
  tip TEXT,
  audio_url TEXT,
  sound_desc TEXT,
  icon TEXT,
  metadata TEXT, -- 存储结构化扩展字段，例如词汇列表 JSON
  status TEXT DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contents_type_status ON mini_program_contents(type, status);
