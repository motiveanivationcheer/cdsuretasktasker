-- Cloudflare D1 Database Schema for CDSure Tasks & Premium Marketplace
-- Paystack Infrastructure Migration
-- Run: npx wrangler d1 execute cdsure-db --file=./schema.sql

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- Firebase UID
  name TEXT,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'earner',          -- 'earner' | 'employer' | 'admin'
  balance REAL DEFAULT 0,              -- User current liquid balance in Naira
  is_activated INTEGER DEFAULT 0,      -- 0: Inactive/Locked, 1: Activated
  activation_paid_at TEXT,
  subscription_tier TEXT DEFAULT 'free', -- 'free' | 'pro'
  subscription_expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,            -- Firebase UID
  balance REAL DEFAULT 0,
  total_deposited REAL DEFAULT 0,
  total_earned REAL DEFAULT 0,
  total_fees_paid REAL DEFAULT 0,      -- 30% CDSure platform charge
  total_withdrawn REAL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Transactions Table (Master Ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,      -- Paystack reference e.g. cds_...
  user_id TEXT NOT NULL,               -- Firebase UID
  email TEXT,
  product_id TEXT,                     -- Optional marketplace product ID
  amount REAL NOT NULL,                -- In Naira
  fee_amount REAL DEFAULT 0,           -- 30% platform charge where applicable
  net_amount REAL NOT NULL,            -- Amount credited or vendor payout
  currency TEXT DEFAULT 'NGN',
  payment_gateway TEXT DEFAULT 'paystack',
  status TEXT DEFAULT 'pending',       -- 'pending' | 'success' | 'failed' | 'abandoned'
  transaction_type TEXT NOT NULL,      -- 'activation' | 'wallet_funding' | 'deposit' | 'subscription' | 'marketplace_purchase' | 'withdrawal'
  gateway_response TEXT,               -- Sanitized Paystack verification summary
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 4. Wallet Transactions Table (Wallet Ledger with atomic balance tracking)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,                -- Credit (+) or Debit (-)
  fee_amount REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  type TEXT NOT NULL,                  -- 'deposit' | 'task_earning' | 'withdrawal' | 'fee' | 'vendor_commission'
  description TEXT,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 5. Activation Payments Table
CREATE TABLE IF NOT EXISTS activation_payments (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  amount REAL DEFAULT 1500,
  currency TEXT DEFAULT 'NGN',
  payment_gateway TEXT DEFAULT 'paystack',
  status TEXT DEFAULT 'pending',       -- 'pending' | 'success' | 'failed'
  gateway_response TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 6. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE,
  user_id TEXT NOT NULL,
  plan TEXT DEFAULT 'pro',
  amount REAL NOT NULL,
  status TEXT DEFAULT 'active',        -- 'active' | 'expired' | 'cancelled'
  starts_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 7. Payment Events Table (Webhook Idempotency & Audit Log)
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,                 -- Event ID or Reference
  event_type TEXT NOT NULL,            -- e.g. 'charge.success'
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT,
  amount REAL NOT NULL,
  payload TEXT,                        -- Raw Webhook Payload
  processed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 8. Marketplace Products Table (Digital Products, Tools, Analysis Packages, Screenshots, Subscriptions, Vendor Bundles)
CREATE TABLE IF NOT EXISTS marketplace_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,              -- 'digital_product' | 'premium_tool' | 'football_analysis' | 'casino_education' | 'screenshot_package' | 'subscription' | 'vendor_package'
  price_ngn REAL NOT NULL,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  commission_rate REAL DEFAULT 0.30,   -- 30% platform commission, 70% vendor payout
  r2_file_key TEXT,                    -- Cloudflare R2 object key for file delivery
  delivery_type TEXT DEFAULT 'download', -- 'download' | 'tool_access' | 'subscription'
  badge TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 9. Marketplace Orders Table (Strict Server-Verified Delivery)
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
  status TEXT DEFAULT 'pending',       -- 'pending' | 'paid' | 'delivered' | 'failed'
  delivery_unlocked INTEGER DEFAULT 0, -- Only 1 after Paystack server verification
  download_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES marketplace_products(id)
);

-- 10. Vendor Commissions Table
CREATE TABLE IF NOT EXISTS vendor_commissions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  vendor_id TEXT NOT NULL,
  gross_amount REAL NOT NULL,
  platform_fee REAL NOT NULL,
  vendor_net REAL NOT NULL,
  status TEXT DEFAULT 'credited',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  employer_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Social Media',
  reward REAL DEFAULT 1000,
  workers_needed INTEGER DEFAULT 10,
  workers_completed INTEGER DEFAULT 0,
  deadline TEXT,
  status TEXT DEFAULT 'open',          -- 'open' | 'completed' | 'paused'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 12. Task Submissions Table
CREATE TABLE IF NOT EXISTS task_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  earner_id TEXT NOT NULL,
  earner_name TEXT,
  proof_link TEXT,
  proof_text TEXT,
  r2_object_key TEXT,
  reward REAL,
  status TEXT DEFAULT 'pending',       -- 'pending' | 'approved' | 'rejected'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 13. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,                 -- Firebase UID
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Admin User
INSERT OR IGNORE INTO admin_users (id, email, role) 
VALUES ('admin_primary', 'bunnynurse53@gmail.com', 'superadmin');

-- Seed CDSure Premium Marketplace Catalog
INSERT OR IGNORE INTO marketplace_products (id, title, description, category, price_ngn, vendor_id, vendor_name, commission_rate, r2_file_key, delivery_type, badge) VALUES
('prod_digital_playbook', 'Social Media Growth & Micro-Task Mastery Playbook', 'Complete 80-page digital PDF guide covering high-paying campaign approval tactics, audience growth funnels, and verified proof formatting.', 'digital_product', 2500, 'vendor_cdsure_official', 'CDSure Official', 0.30, 'marketplace/digital-growth-playbook.pdf', 'download', 'Bestseller'),
('prod_tool_verifier', 'Auto-Proof Link & Campaign Checker Pro Tool', 'Desktop and web utility suite for employers and earners to batch-verify social URLs, timestamps, and proof metadata before submission.', 'premium_tool', 4000, 'vendor_tools_lab', 'Apex Dev Tools', 0.30, 'marketplace/proof-verifier-pro-suite.zip', 'tool_access', 'Pro Tool'),
('prod_football_vip', 'Weekend Pro Football Match Analytics & Stats Package', 'Comprehensive statistical breakdown covering xG metrics, team form indices, corner frequencies, and injury reports across top 5 European leagues.', 'football_analysis', 5000, 'vendor_pitch_quant', 'PitchQuant Analytics', 0.30, 'marketplace/football-analytics-weekly-pack.pdf', 'download', 'Weekly Pack'),
('prod_casino_edu', 'Probability, House Edge & Bankroll Educational Package', 'Educational mathematics course explaining RTP variance, Kelly Criterion staking discipline, risk-of-ruin formulas, and bankroll preservation.', 'casino_education', 6000, 'vendor_quant_edu', 'QuantEdu Academy', 0.30, 'marketplace/probability-bankroll-education.pdf', 'download', 'Educational'),
('prod_screenshot_pack', 'Verified Campaign Proof Template & Watermark Bundle', '60+ structured screenshot framing templates, annotation overlays, and timestamp watermark assets stored on Cloudflare R2 for task creators.', 'screenshot_package', 1500, 'vendor_design_hub', 'Naija Creator Studio', 0.30, 'marketplace/screenshot-template-bundle.zip', 'download', 'Instant R2'),
('prod_sub_pro', 'CDSure VIP Pro Membership (30-Day Priority Pass)', 'Unlocks priority access to ₦3,500+ high-reward micro-tasks, instant review queue priority, and 0-wait marketplace drops for 30 days.', 'subscription', 3500, 'vendor_cdsure_official', 'CDSure Official', 0.30, 'marketplace/vip-pro-welcome-kit.pdf', 'subscription', 'VIP 30 Days'),
('prod_vendor_toolkit', 'Affiliate & Freelance Campaign Launch Vendor Kit', 'Curated multi-vendor digital toolkit with ad copy scripts, UTM tracking sheets, and payout reconciliation spreadsheets.', 'vendor_package', 3000, 'vendor_lagos_growth', 'Lagos Digital Guild', 0.30, 'marketplace/vendor-campaign-toolkit.zip', 'download', 'Partner Vendor');
