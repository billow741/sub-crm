-- Migration 025: Add milestone evaluation and dimensional rating fields to progress_reports
ALTER TABLE progress_reports ADD COLUMN total_lessons_completed INTEGER DEFAULT 10;
ALTER TABLE progress_reports ADD COLUMN vocabulary_count INTEGER DEFAULT 0;
ALTER TABLE progress_reports ADD COLUMN score_listening INTEGER DEFAULT 5;
ALTER TABLE progress_reports ADD COLUMN score_speaking INTEGER DEFAULT 5;
ALTER TABLE progress_reports ADD COLUMN score_interaction INTEGER DEFAULT 5;
ALTER TABLE progress_reports ADD COLUMN score_pronunciation INTEGER DEFAULT 5;
ALTER TABLE progress_reports ADD COLUMN highlight_recording_url TEXT;
ALTER TABLE progress_reports ADD COLUMN badge_name TEXT;
