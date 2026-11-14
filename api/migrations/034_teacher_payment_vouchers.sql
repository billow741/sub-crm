-- 034_teacher_payment_vouchers.sql
-- 教师薪资「结算单 + 付款单」双凭证及核销体系

-- 1. 扩充结算单（teacher_payments）核销字段
ALTER TABLE teacher_payments ADD COLUMN paid_amount REAL DEFAULT 0;
ALTER TABLE teacher_payments ADD COLUMN balance_due REAL DEFAULT 0;

-- 2. 新建付款单表（teacher_payment_vouchers）
CREATE TABLE IF NOT EXISTS teacher_payment_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT UNIQUE NOT NULL,
  teacher_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  allocated_amount REAL NOT NULL DEFAULT 0,
  unallocated_amount REAL NOT NULL CHECK (unallocated_amount >= 0),
  voucher_type TEXT NOT NULL CHECK (voucher_type IN ('advance', 'settlement')),
  payment_method TEXT NOT NULL DEFAULT 'gcash',
  transaction_ref TEXT,
  paid_at TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'unallocated' CHECK (status IN ('unallocated', 'partially_allocated', 'fully_allocated', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vouchers_teacher ON teacher_payment_vouchers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON teacher_payment_vouchers (voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON teacher_payment_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_vouchers_paid_at ON teacher_payment_vouchers (paid_at);

-- 3. 新建核销明细表（teacher_settlement_allocations）
CREATE TABLE IF NOT EXISTS teacher_settlement_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL REFERENCES teacher_payments(id) ON DELETE CASCADE,
  voucher_id INTEGER NOT NULL REFERENCES teacher_payment_vouchers(id) ON DELETE CASCADE,
  allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_allocations_settlement ON teacher_settlement_allocations (settlement_id);
CREATE INDEX IF NOT EXISTS idx_allocations_voucher ON teacher_settlement_allocations (voucher_id);

-- 4. 历史结算单数据初始化
UPDATE teacher_payments
SET paid_amount = CASE WHEN status = 'paid' THEN total_amount ELSE 0 END,
    balance_due = CASE WHEN status = 'pending' THEN total_amount ELSE 0 END;

-- 5. 历史已支付结算单生成对应付款单凭证
INSERT OR IGNORE INTO teacher_payment_vouchers (
  voucher_no,
  teacher_id,
  amount,
  allocated_amount,
  unallocated_amount,
  voucher_type,
  payment_method,
  paid_at,
  notes,
  status,
  created_at
)
SELECT
  'PV-HIST-' || printf('%05d', tp.id),
  tp.teacher_id,
  tp.total_amount,
  tp.total_amount,
  0,
  'settlement',
  COALESCE(tp.payment_method, 'gcash'),
  COALESCE(substr(tp.paid_at, 1, 10), substr(tp.created_at, 1, 10)),
  '历史已结账单自动归档: ' || tp.period_start || ' ~ ' || tp.period_end,
  'fully_allocated',
  tp.created_at
FROM teacher_payments tp
WHERE tp.status = 'paid' AND tp.total_amount > 0;

-- 6. 关联历史核销记录
INSERT OR IGNORE INTO teacher_settlement_allocations (
  settlement_id,
  voucher_id,
  allocated_amount,
  created_at
)
SELECT
  tp.id,
  v.id,
  tp.total_amount,
  tp.created_at
FROM teacher_payments tp
JOIN teacher_payment_vouchers v ON v.voucher_no = 'PV-HIST-' || printf('%05d', tp.id)
WHERE tp.status = 'paid' AND tp.total_amount > 0;
