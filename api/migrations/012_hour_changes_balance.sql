-- 012_hour_changes_balance.sql
-- 为 hour_changes 课时流水表补齐 balance_after 变动后余额列
ALTER TABLE hour_changes ADD COLUMN balance_after REAL;
