-- 020: 增加课堂录播字段
-- 用于教师填反馈时录入录播信息/回放地址，家长端可一键点击回放

ALTER TABLE classes ADD COLUMN fb_recording TEXT;
