import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_FILE = path.resolve('./.cdsure-dev.sqlite');

let dbInstance: DatabaseSync | null = null;

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getLocalDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      role TEXT DEFAULT 'pending',
      requested_role TEXT DEFAULT '',
      payment_status TEXT DEFAULT 'unpaid',
      activation_reference TEXT,
      activation_amount REAL DEFAULT 0,
      activation_paid_at TEXT,
      status TEXT DEFAULT 'pending',
      employer_approved INTEGER DEFAULT 0,
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
      is_activated INTEGER DEFAULT 0,
      subscription_tier TEXT DEFAULT 'free',
      subscription_expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      amount REAL NOT NULL,
      proof_url TEXT,
      reference TEXT UNIQUE,
      payment_method TEXT DEFAULT 'bank_transfer',
      status TEXT DEFAULT 'Pending',
      admin_id TEXT,
      admin_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      amount REAL NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      admin_id TEXT,
      admin_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      fee_amount REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'Pending',
      admin_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_applications (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      earner_id TEXT NOT NULL,
      status TEXT DEFAULT 'accepted',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, earner_id)
    );

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

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      user_id TEXT,
      amount REAL NOT NULL,
      payload TEXT,
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'superadmin',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for pre-existing local SQLite databases
  ensureColumn(db, 'users', 'phone', 'TEXT');
  ensureColumn(db, 'users', 'requested_role', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'payment_status', "TEXT DEFAULT 'unpaid'");
  ensureColumn(db, 'users', 'activation_reference', 'TEXT');
  ensureColumn(db, 'users', 'activation_amount', 'REAL DEFAULT 0');
  ensureColumn(db, 'users', 'activation_paid_at', 'TEXT');
  ensureColumn(db, 'users', 'status', "TEXT DEFAULT 'pending'");
  ensureColumn(db, 'users', 'employer_approved', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'users', 'employer_approved_at', 'TEXT');
  ensureColumn(db, 'users', 'employer_status', "TEXT DEFAULT 'none'");
  ensureColumn(db, 'users', 'employer_rejection_reason', 'TEXT');
  ensureColumn(db, 'users', 'activation_proof_url', 'TEXT');
  ensureColumn(db, 'users', 'avatar_url', 'TEXT');
  ensureColumn(db, 'users', 'total_deposited', 'REAL DEFAULT 0');
  ensureColumn(db, 'users', 'total_withdrawn', 'REAL DEFAULT 0');
  ensureColumn(db, 'users', 'total_earned', 'REAL DEFAULT 0');
  ensureColumn(db, 'users', 'total_fees_paid', 'REAL DEFAULT 0');
  ensureColumn(db, 'wallet_transactions', 'admin_id', 'TEXT');
  ensureColumn(db, 'task_submissions', 'proof_url', 'TEXT');
  ensureColumn(db, 'tasks', 'campaign_image_url', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cloudinary_images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      category TEXT NOT NULL,
      folder TEXT NOT NULL,
      public_id TEXT UNIQUE NOT NULL,
      secure_url TEXT NOT NULL,
      format TEXT,
      bytes INTEGER DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      related_id TEXT,
      review_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );
  `);

  // Seed default activation fee settings
  const nowIso = new Date().toISOString();
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`);
  insertSetting.run('earner_activation_fee', '2000', nowIso);
  insertSetting.run('employer_activation_fee', '5000', nowIso);
  insertSetting.run('activation_bonus_earner', '0', nowIso);
  insertSetting.run('activation_bonus_employer', '0', nowIso);

  // Enforce sole admin email
  db.exec(`DELETE FROM admin_users WHERE LOWER(email) != 'bunnysusanfabio@gmail.com'`);
  db.prepare(`INSERT OR IGNORE INTO admin_users (id, email, role) VALUES (?, ?, ?)`).run(
    'admin_primary',
    'bunnysusanfabio@gmail.com',
    'superadmin'
  );

  dbInstance = db;
  return dbInstance;
}

export function getActivationFeeSettings(db: DatabaseSync) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    earner_fee: Math.max(100, Number(map.earner_activation_fee) || 2000),
    employer_fee: Math.max(100, Number(map.employer_activation_fee) || 5000),
    activation_bonus_earner: Math.max(0, Number(map.activation_bonus_earner) || 0),
    activation_bonus_employer: Math.max(0, Number(map.activation_bonus_employer) || 0),
  };
}
