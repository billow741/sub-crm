-- 033_report_fx_rates.sql
-- 报表专用：PHP→CNY 月度参考汇率。只服务报表折算，不回填、不影响任何业务表。
CREATE TABLE IF NOT EXISTS report_fx_rates (
  month TEXT PRIMARY KEY,          -- 'YYYY-MM'，按教师结算 period_end 所在月取用
  rate REAL NOT NULL CHECK (rate > 0),  -- 1 PHP = rate CNY，如 0.1240
  source TEXT,                     -- 如 'Wise 实际汇款' / '月度平均' / 'XE 参考'
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
