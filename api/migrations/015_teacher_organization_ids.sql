-- 015: 教师多机构关联字段
-- teachers.organization_ids 存储多机构ID的JSON数组，如 [1, 2, 3]
-- 该字段在代码中大量使用，但之前缺少 migration 文件
-- 注意：单一 organization_id 字段保留，用于向后兼容

ALTER TABLE teachers ADD COLUMN organization_ids TEXT DEFAULT '[]';

-- 将现有的 organization_id 数据迁移到 organization_ids（JSON 数组格式）
UPDATE teachers
SET organization_ids = '[' || COALESCE(organization_id, 1) || ']'
WHERE organization_ids IS NULL OR organization_ids = '[]' OR organization_ids = '';
