-- 021_add_recording_transfer_fields.sql
-- 为 classes 表增加录播自动转存与私有视频相关字段

ALTER TABLE classes ADD COLUMN fb_recording_r2_key TEXT;
ALTER TABLE classes ADD COLUMN fb_recording_status TEXT DEFAULT 'none';
ALTER TABLE classes ADD COLUMN fb_recording_duration INTEGER DEFAULT 0;
ALTER TABLE classes ADD COLUMN fb_recording_size INTEGER DEFAULT 0;
