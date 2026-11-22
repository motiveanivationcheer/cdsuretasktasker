-- Cloudflare D1 Database Schema for CDSure Tasks & Premium Marketplace
-- Run: npx wrangler d1 execute cdsure-db --file=./schema.sql

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- Firebase UID
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'pending',            -- 'pending' until paid -> 'earner' | 'employer'
  requested_role TEXT DEFAULT '',         -- 'earner' | 'employer' | ''
  payment_status TEXT DEFAULT 'unpaid',   -- 'unpaid' | 'paid'
  activation_reference TEXT,
  activation_amount REAL DEFAULT 0,
  activation_paid_at TEXT,
  status TEXT DEFAULT 'pending',          -- 'pending' | 'active'
  employer_approved INTEGER DEFAULT 0,    -- 1 when activated as employer
  employer_approved_at TEXT,
  employer_status TEXT DEFAULT 'none',
  employer_rejection_reason TEXT,
  activation_proof_url TEXT,
  avatar_url TEXT,
  balance REAL DEFAULT 0,
  total_deposited REAL DEFAULT 0,
  total_withdrawn REAL DEFAULT 0,
  total_earned REAL DEFAULT 0,
  total_fees_paid REAL DEFAULT 0,
  is_activated INTEGER DEFAULT 0,         -- 0 until Paystack activation payment verified
  subscription_tier TEXT DEFAULT 'free',
  subscription_expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. App Settings Table (Admin-editable Activation Fees & Bonus)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('earner_activation_fee', '2000'),
  ('employer_activation_fee', '5000'),
  ('activation_bonus_earner', '0'),
  ('activation_bonus_employer', '0');

-- 3. Deposits Table (Paystack & Bank Transfer proof deposits)
CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  amount REAL NOT NULL,
  proof_url TEXT,
  reference TEXT UNIQUE,
  payment_method TEXT DEFAULT 'bank_transfer',
  status TEXT DEFAULT 'Pending',          -- 'Pending' | 'Approved' | 'Rejected'
  admin_id TEXT,
  admin_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Withdrawals Table
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  amount REAL NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT DEFAULT 'Pending',          -- 'Pending' | 'Paid' | 'Rejected'
  admin_id TEXT,
  admin_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Wallet Transactions Table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  fee_amount REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  type TEXT NOT NULL,                     -- 'activation_payment' | 'activation_credit' | 'deposit' | 'withdrawal' | 'task_earning'
  description TEXT,
  status TEXT DEFAULT 'Pending',          -- 'Pending' | 'Approved' | 'Rejected' | 'Paid'
  admin_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Tasks Table (Posted only by Paid Employers)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL,
  employer_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Social Media',
  reward REAL DEFAULT 1000,
  workers_needed INTEGER DEFAULT 10,
  workers_completed INTEGER DEFAULT 0,
  deadline TEXT,
  proof_required TEXT,
  campaign_image_url TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 7. Task Applications Table
CREATE TABLE IF NOT EXISTS task_applications (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  earner_id TEXT NOT NULL,
  status TEXT DEFAULT 'accepted',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, earner_id)
);

-- 8. Task Submissions Table
CREATE TABLE IF NOT EXISTS task_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_title TEXT,
  employer_id TEXT,
  earner_id TEXT NOT NULL,
  earner_name TEXT,
  earner_email TEXT,
  proof_url TEXT,
  proof_link TEXT,
  proof_text TEXT,
  reward REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

-- 9. Paystack Master Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  product_id TEXT,
  amount REAL NOT NULL,
  fee_amount REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  currency TEXT DEFAULT 'NGN',
  payment_gateway TEXT DEFAULT 'paystack',
  status TEXT DEFAULT 'pending',
  transaction_type TEXT NOT NULL,
  gateway_response TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

-- 10. Payment Events Table (Webhook Idempotency)
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT,
  amount REAL NOT NULL,
  payload TEXT,
  processed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 11. Marketplace Products Table
CREATE TABLE IF NOT EXISTS marketplace_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  price_ngn REAL NOT NULL,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  commission_rate REAL DEFAULT 0.30,
  r2_file_key TEXT,
  delivery_type TEXT DEFAULT 'download',
  badge TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 12. Marketplace Orders Table
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  platform_fee REAL DEFAULT 0,
  vendor_amount REAL DEFAULT 0,
  vendor_id TEXT,
  status TEXT DEFAULT 'pending',
  delivery_unlocked INTEGER DEFAULT 0,
  download_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

-- 13. Admin Users Table (Restricted exclusively to bunnysusanfabio@gmail.com)
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'superadmin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

DELETE FROM admin_users WHERE LOWER(email) != 'bunnysusanfabio@gmail.com';
INSERT OR IGNORE INTO admin_users (id, email, role)
VALUES ('admin_primary', 'bunnysusanfabio@gmail.com', 'superadmin');
