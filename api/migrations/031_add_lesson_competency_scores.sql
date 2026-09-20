-- 031: 添加每节课五维核心能力快速评分字段 (1-5星级)
-- 用于支撑里程碑阶段评估雷达图的真实数据计算

ALTER TABLE classes ADD COLUMN fb_score_phonics INTEGER;
ALTER TABLE classes ADD COLUMN fb_score_vocab INTEGER;
ALTER TABLE classes ADD COLUMN fb_score_speaking INTEGER;
ALTER TABLE classes ADD COLUMN fb_score_listening INTEGER;
ALTER TABLE classes ADD COLUMN fb_score_engagement INTEGER;
