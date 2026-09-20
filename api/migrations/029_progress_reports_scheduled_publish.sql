-- Migration 029: Add scheduled_publish_at column and index for delayed milestone release
ALTER TABLE progress_reports ADD COLUMN scheduled_publish_at TEXT;
CREATE INDEX IF NOT EXISTS idx_progress_reports_scheduled ON progress_reports(status, scheduled_publish_at);
