-- 确保每节课程最多只能有一份体验课评估报告，防止并发/双击重复创建
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_unique_class_id ON assessments (class_id);
