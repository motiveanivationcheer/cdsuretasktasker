// Vite Dev Server Plugin: Real SQLite-persisted backend API for CDSure Tasks (mirrors Cloudflare D1/Workers)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { verifyFirebaseToken, requireAdmin, isAdminEmail } from './auth';
import { getLocalDb, getActivationFeeSettings } from './localDb';
import {
  nairaToKobo,
  koboToNaira,
  generatePaystackReference,
  getPaystackSecretKey,
  getPaystackWebhookSecret,
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from './paystack';
import { MARKETPLACE_CATALOG, getCatalogProductById } from './marketplaceCatalog';
import {
  getCloudinaryConfig,
  resolveCloudinaryFolder,
  validateCloudinaryImageInput,
  signCloudinaryParams,
  destroyCloudinaryAssetOnCloud,
} from './cloudinary';

// Load keys cleanly from .env if missing or placeholder in host process.env
try {
  const envPath = path.resolve('./.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    for (const key of [
      'PAYSTACK_SECRET_KEY',
      'PAYSTACK_WEBHOOK_SECRET',
      'PAYSTACK_PUBLIC_KEY',
      'PUBLIC_PAYSTACK_PUBLIC_KEY',
      'PUBLIC_CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      const cur = (process.env[key] || '').trim();
      const fromEnv = (parsed[key] || '').trim();
      const isInvalidOrTest =
        !cur ||
        cur.includes('placeholder') ||
        cur.includes('REPLACE_WITH') ||
        cur.startsWith('sk_test_') ||
        cur.startsWith('pk_test_');
      if (isInvalidOrTest && fromEnv && !fromEnv.includes('REPLACE_WITH') && !fromEnv.includes('placeholder') && !fromEnv.startsWith('sk_test_') && !fromEnv.startsWith('pk_test_')) {
        process.env[key] = fromEnv;
      }
    }
  }
} catch {}

function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function devApiPlugin(): Plugin {
  return {
    name: 'vite-dev-cloudflare-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const urlStr = req.url || '';
        const parsedUrl = new URL(urlStr, 'http://localhost:3000');
        const pathname = parsedUrl.pathname;
        const method = (req.method || 'GET').toUpperCase();

        if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.end();
          return;
        }

        if (!pathname.startsWith('/api/')) {
          return next();
        }

        const db = getLocalDb();
        const authHeader = (req.headers.authorization || req.headers.Authorization || null) as string | null;

        try {
          // =====================================================================
          // 1. PUBLIC SETTINGS, USER SYNC & ROLE SELECTION ROUTES
          // =====================================================================
          if (pathname === '/api/settings/activation-fees' && method === 'GET') {
            const fees = getActivationFeeSettings(db);
            return sendJson(res, 200, { success: true, ...fees });
          }

          if (pathname === '/api/users/sync' && method === 'POST') {
            const body = await parseJsonBody(req);
            const authRes = authHeader
              ? await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true })
              : null;
            if (authHeader && authRes && !authRes.success) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Unauthorized' });
            }

            const uid = authRes?.user?.uid || body.id || body.uid;
            if (!uid) {
              return sendJson(res, 400, { success: false, error: 'Missing user ID' });
            }

            const email = String(authRes?.user?.email || body.email || '').trim().toLowerCase();
            const incomingName = String(body.name || body.displayName || '').trim();
            const incomingPhone = String(body.phone || '').trim();
            const reqRoleInput =
              body.requested_role === 'employer' || body.role === 'employer'
                ? 'employer'
                : body.requested_role === 'earner' || body.role === 'earner'
                ? 'earner'
                : '';
            const nowIso = new Date().toISOString();

            const existing: any = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);

            if (existing) {
              const nextName =
                incomingName && incomingName !== 'Member' ? incomingName : existing.name || incomingName || 'Member';
              const nextPhone = incomingPhone || existing.phone || '';
              const isPaid = existing.payment_status === 'paid';
              let nextRole = isPaid ? (existing.role === 'employer' ? 'employer' : 'earner') : 'pending';
              let nextRequestedRole = existing.requested_role || '';

              if (!isPaid && reqRoleInput) {
                nextRequestedRole = reqRoleInput;
              } else if (isPaid && body.explicitSwitch === true && (body.role === 'earner' || body.role === 'employer')) {
                if (body.role === 'earner') nextRole = 'earner';
                else if (Number(existing.employer_approved) === 1 || existing.requested_role === 'employer') {
                  nextRole = 'employer';
                }
              }

              db.prepare(
                `UPDATE users
                 SET name = ?, email = COALESCE(NULLIF(?, ''), email), phone = ?, role = ?, requested_role = ?,
                     is_activated = ?, status = ?, updated_at = ?
                 WHERE id = ?`
              ).run(nextName, email, nextPhone, nextRole, nextRequestedRole, isPaid ? 1 : 0, isPaid ? 'active' : 'pending', nowIso, uid);

              const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
              return sendJson(res, 200, { success: true, user: updated, created: false });
            }

            db.prepare(
              `INSERT INTO users (
                id, name, email, phone, role, requested_role, payment_status, status, employer_approved, employer_status,
                avatar_url, balance, total_deposited, total_withdrawn, total_earned, total_fees_paid,
                is_activated, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, 'none', ?, 0, 0, 0, 0, 0, 0, ?, ?)`
            ).run(
              uid,
              incomingName || 'Member',
              email || `${uid}@user.cdsure`,
              incomingPhone,
              reqRoleInput,
              body.avatar_url || null,
              nowIso,
              nowIso
            );

            const created = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
            return sendJson(res, 200, { success: true, user: created, created: true });
          }

          if (pathname === '/api/users/requested-role' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const requestedRole =
              body.requested_role === 'employer' ? 'employer' : body.requested_role === 'earner' ? 'earner' : '';
            if (!requestedRole) {
              return sendJson(res, 400, { success: false, error: 'Choose earner or employer role.' });
            }

            const nowIso = new Date().toISOString();
            const existing: any = db.prepare('SELECT * FROM users WHERE id = ?').get(authRes.user.uid);
            if (!existing) {
              db.prepare(
                `INSERT INTO users (id, name, email, role, requested_role, payment_status, status, is_activated, created_at, updated_at)
                 VALUES (?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, ?, ?)`
              ).run(
                authRes.user.uid,
                authRes.user.email?.split('@')[0] || 'Member',
                authRes.user.email,
                requestedRole,
                nowIso,
                nowIso
              );
            } else if (existing.payment_status !== 'paid') {
              db.prepare(
                `UPDATE users SET requested_role = ?, role = 'pending', status = 'pending', is_activated = 0, updated_at = ? WHERE id = ?`
              ).run(requestedRole, nowIso, authRes.user.uid);
            }

            const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(authRes.user.uid);
            return sendJson(res, 200, { success: true, user: updated });
          }

          // Save Profile Avatar (Cloudinary secure_url in profiles folder)
          if (pathname === '/api/users/avatar' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const avatarUrl = String(body.avatar_url || '').trim();
            if (!avatarUrl || !avatarUrl.startsWith('http')) {
              return sendJson(res, 400, { success: false, error: 'Valid profile photo URL required.' });
            }
            db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(
              avatarUrl,
              new Date().toISOString(),
              authRes.user.uid
            );
            const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(authRes.user.uid);
            return sendJson(res, 200, { success: true, user: updated });
          }

          // =====================================================================
          // 2. ADMIN PORTAL ROUTES (STRICTLY bunnysusanfabio@gmail.com ONLY)
          // =====================================================================
          if (pathname.startsWith('/api/admin/')) {
            const adminCheck = await requireAdmin(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!adminCheck.success || !adminCheck.user) {
              return sendJson(res, adminCheck.status, { success: false, error: adminCheck.error });
            }
            const adminUser = adminCheck.user;

            // GET /api/admin/overview
            if (pathname === '/api/admin/overview' && method === 'GET') {
              const fees = getActivationFeeSettings(db);
              const users: any[] = db.prepare(
                `SELECT id, name, email, phone, role, requested_role, payment_status, activation_reference,
                        activation_amount, activation_paid_at, status, balance, created_at
                 FROM users
                 ORDER BY created_at DESC`
              ).all();

              const userList = users.map((u: any) => ({
                ...u,
                expected_fee: u.requested_role === 'employer' ? fees.employer_fee : fees.earner_fee,
              }));

              const deposits = db.prepare(
                `SELECT d.*, u.phone as user_phone
                 FROM deposits d
                 LEFT JOIN users u ON d.user_id = u.id
                 ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END, d.created_at DESC`
              ).all();

              const withdrawals = db.prepare(
                `SELECT w.*, u.balance as current_user_balance, u.phone as user_phone
                 FROM withdrawals w
                 LEFT JOIN users u ON w.user_id = u.id
                 ORDER BY CASE WHEN w.status = 'Pending' THEN 0 ELSE 1 END, w.created_at DESC`
              ).all();

              return sendJson(res, 200, {
                success: true,
                adminEmail: adminUser.email,
                fees,
                users: userList,
                deposits,
                withdrawals,
                counts: {
                  paidUsers: userList.filter((u: any) => u.payment_status === 'paid').length,
                  unpaidUsers: userList.filter((u: any) => u.payment_status !== 'paid').length,
                  pendingDeposits: deposits.filter((d: any) => d.status === 'Pending').length,
                  pendingWithdrawals: withdrawals.filter((w: any) => w.status === 'Pending').length,
                },
              });
            }

            // POST /api/admin/settings/fees
            if (pathname === '/api/admin/settings/fees' && method === 'POST') {
              const body = await parseJsonBody(req);
              const earnerFee = Math.max(100, Number(body.earner_fee ?? body.earnerFee ?? 2000) || 2000);
              const employerFee = Math.max(100, Number(body.employer_fee ?? body.employerFee ?? 5000) || 5000);
              const bonusEarner = Math.max(0, Number(body.activation_bonus_earner ?? 0) || 0);
              const bonusEmployer = Math.max(0, Number(body.activation_bonus_employer ?? 0) || 0);
              const nowIso = new Date().toISOString();

              const upsert = db.prepare(
                `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
              );
              upsert.run('earner_activation_fee', String(earnerFee), nowIso);
              upsert.run('employer_activation_fee', String(employerFee), nowIso);
              upsert.run('activation_bonus_earner', String(bonusEarner), nowIso);
              upsert.run('activation_bonus_employer', String(bonusEmployer), nowIso);

              const fees = getActivationFeeSettings(db);
              return sendJson(res, 200, { success: true, message: 'Activation fee settings saved.', fees });
            }

            // POST /api/admin/activation/mark-paid
            if (pathname === '/api/admin/activation/mark-paid' && method === 'POST') {
              const body = await parseJsonBody(req);
              const targetUserId = String(body.userId || body.user_id || '').trim();
              if (!targetUserId) {
                return sendJson(res, 400, { success: false, error: 'Missing userId.' });
              }
              const target: any = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
              if (!target) {
                return sendJson(res, 404, { success: false, error: 'User not found.' });
              }

              const fees = getActivationFeeSettings(db);
              const targetRole = target.requested_role === 'employer' ? 'employer' : 'earner';
              const feeAmount = targetRole === 'employer' ? fees.employer_fee : fees.earner_fee;
              const bonus = targetRole === 'employer' ? fees.activation_bonus_employer : fees.activation_bonus_earner;
              const nowIso = new Date().toISOString();
              const reference = target.activation_reference || `MANUAL-${targetUserId.slice(0, 8)}-${Date.now()}`;

              db.exec('BEGIN');
              try {
                db.prepare(
                  `UPDATE users
                   SET payment_status = 'paid',
                       activation_reference = ?,
                       activation_amount = ?,
                       activation_paid_at = ?,
                       role = ?,
                       requested_role = ?,
                       status = 'active',
                       is_activated = 1,
                       employer_approved = ?,
                       employer_status = ?,
                       balance = COALESCE(balance, 0) + ?,
                       updated_at = ?
                   WHERE id = ?`
                ).run(
                  reference,
                  feeAmount,
                  nowIso,
                  targetRole,
                  targetRole,
                  targetRole === 'employer' ? 1 : 0,
                  targetRole === 'employer' ? 'approved' : 'none',
                  target.payment_status === 'paid' ? 0 : bonus,
                  nowIso,
                  targetUserId
                );

                db.prepare(
                  `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, admin_id, created_at)
                   VALUES (?, ?, ?, ?, 0, ?, 'activation_payment', ?, 'Approved', ?, ?)`
                ).run(
                  makeId('wtx'),
                  targetUserId,
                  `${reference}_manual`,
                  feeAmount,
                  bonus,
                  `Manual Activation Confirmed by Admin (${targetRole.toUpperCase()})`,
                  adminUser.uid,
                  nowIso
                );
                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }

              const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
              return sendJson(res, 200, {
                success: true,
                message: `${updatedUser.name || updatedUser.email} marked as Paid & Activated (${targetRole.toUpperCase()}).`,
                user: updatedUser,
              });
            }

            // POST /api/admin/activation/refund
            if (pathname === '/api/admin/activation/refund' && method === 'POST') {
              const body = await parseJsonBody(req);
              const targetUserId = String(body.userId || body.user_id || '').trim();
              if (!targetUserId) {
                return sendJson(res, 400, { success: false, error: 'Missing userId.' });
              }
              const nowIso = new Date().toISOString();
              db.prepare(
                `UPDATE users
                 SET payment_status = 'unpaid',
                     role = 'pending',
                     status = 'pending',
                     is_activated = 0,
                     employer_approved = 0,
                     updated_at = ?
                 WHERE id = ?`
              ).run(nowIso, targetUserId);

              const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
              return sendJson(res, 200, {
                success: true,
                message: 'Activation revoked. User returned to Unpaid status.',
                user: updatedUser,
              });
            }

            // POST /api/admin/deposits/confirm
            if (pathname === '/api/admin/deposits/confirm' && method === 'POST') {
              const body = await parseJsonBody(req);
              const depositId = String(body.depositId || body.id || '').trim();
              if (!depositId) {
                return sendJson(res, 400, { success: false, error: 'Missing depositId.' });
              }
              const dep: any = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
              if (!dep) {
                return sendJson(res, 404, { success: false, error: 'Deposit record not found.' });
              }
              if (dep.status !== 'Pending') {
                return sendJson(res, 409, { success: false, error: `Deposit already ${dep.status}.` });
              }

              const nowIso = new Date().toISOString();
              db.exec('BEGIN');
              try {
                db.prepare(
                  `UPDATE deposits SET status = 'Approved', admin_id = ?, reviewed_at = ? WHERE id = ?`
                ).run(adminUser.uid, nowIso, depositId);

                db.prepare(
                  `UPDATE wallet_transactions SET status = 'Approved', admin_id = ? WHERE reference = ?`
                ).run(adminUser.uid, dep.reference);

                db.prepare(
                  `UPDATE users
                   SET balance = COALESCE(balance, 0) + ?,
                       total_deposited = COALESCE(total_deposited, 0) + ?,
                       updated_at = ?
                   WHERE id = ?`
                ).run(dep.amount, dep.amount, nowIso, dep.user_id);

                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }

              return sendJson(res, 200, {
                success: true,
                message: `Deposit of ₦${Number(dep.amount).toLocaleString()} confirmed and credited.`,
              });
            }

            // POST /api/admin/deposits/reject
            if (pathname === '/api/admin/deposits/reject' && method === 'POST') {
              const body = await parseJsonBody(req);
              const depositId = String(body.depositId || body.id || '').trim();
              const reason = String(body.reason || 'Deposit proof rejected by admin.').trim();
              if (!depositId) {
                return sendJson(res, 400, { success: false, error: 'Missing depositId.' });
              }
              const dep: any = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
              if (!dep) {
                return sendJson(res, 404, { success: false, error: 'Deposit record not found.' });
              }
              if (dep.status !== 'Pending') {
                return sendJson(res, 409, { success: false, error: `Deposit already ${dep.status}.` });
              }
              const nowIso = new Date().toISOString();
              db.exec('BEGIN');
              try {
                db.prepare(
                  `UPDATE deposits SET status = 'Rejected', admin_id = ?, admin_note = ?, reviewed_at = ? WHERE id = ?`
                ).run(adminUser.uid, reason, nowIso, depositId);
                db.prepare(
                  `UPDATE wallet_transactions SET status = 'Rejected', admin_id = ? WHERE reference = ?`
                ).run(adminUser.uid, dep.reference);
                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }

              return sendJson(res, 200, { success: true, message: 'Deposit rejected.' });
            }

            // POST /api/admin/withdrawals/approve
            if (pathname === '/api/admin/withdrawals/approve' && method === 'POST') {
              const body = await parseJsonBody(req);
              const withdrawalId = String(body.withdrawalId || body.id || '').trim();
              if (!withdrawalId) {
                return sendJson(res, 400, { success: false, error: 'Missing withdrawalId.' });
              }
              const w: any = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);
              if (!w) {
                return sendJson(res, 404, { success: false, error: 'Withdrawal request not found.' });
              }
              if (w.status !== 'Pending') {
                return sendJson(res, 409, { success: false, error: `Withdrawal already ${w.status}.` });
              }

              const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(w.user_id);
              if (!user || Number(user.balance || 0) < Number(w.amount)) {
                return sendJson(res, 400, { success: false, error: 'Insufficient balance for this user.' });
              }

              const nowIso = new Date().toISOString();
              db.exec('BEGIN');
              try {
                db.prepare(
                  `UPDATE users
                   SET balance = COALESCE(balance, 0) - ?,
                       total_withdrawn = COALESCE(total_withdrawn, 0) + ?,
                       updated_at = ?
                   WHERE id = ?`
                ).run(w.amount, w.amount, nowIso, w.user_id);

                db.prepare(
                  `UPDATE withdrawals SET status = 'Paid', admin_id = ?, reviewed_at = ? WHERE id = ?`
                ).run(adminUser.uid, nowIso, withdrawalId);

                db.prepare(
                  `UPDATE wallet_transactions SET status = 'Paid', admin_id = ? WHERE reference = ?`
                ).run(adminUser.uid, w.id);

                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }

              return sendJson(res, 200, {
                success: true,
                message: `Withdrawal of ₦${Number(w.amount).toLocaleString()} marked Paid and deducted from user balance.`,
              });
            }

            // POST /api/admin/withdrawals/reject
            if (pathname === '/api/admin/withdrawals/reject' && method === 'POST') {
              const body = await parseJsonBody(req);
              const withdrawalId = String(body.withdrawalId || body.id || '').trim();
              const reason = String(body.reason || 'Withdrawal request rejected by admin.').trim();
              if (!withdrawalId) {
                return sendJson(res, 400, { success: false, error: 'Missing withdrawalId.' });
              }
              const w: any = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);
              if (!w) {
                return sendJson(res, 404, { success: false, error: 'Withdrawal request not found.' });
              }
              if (w.status !== 'Pending') {
                return sendJson(res, 409, { success: false, error: `Withdrawal already ${w.status}.` });
              }
              const nowIso = new Date().toISOString();
              db.exec('BEGIN');
              try {
                db.prepare(
                  `UPDATE withdrawals SET status = 'Rejected', admin_id = ?, admin_note = ?, reviewed_at = ? WHERE id = ?`
                ).run(adminUser.uid, reason, nowIso, withdrawalId);
                db.prepare(
                  `UPDATE wallet_transactions SET status = 'Rejected', admin_id = ? WHERE reference = ?`
                ).run(adminUser.uid, w.id);
                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }
              return sendJson(res, 200, { success: true, message: 'Withdrawal rejected.' });
            }

            // Legacy /api/admin/activations GET (for backwards compatibility)
            if (pathname === '/api/admin/activations' && method === 'GET') {
              const txs = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
              return sendJson(res, 200, { success: true, activations: txs, transactions: txs });
            }

            if (pathname === '/api/admin/platform-earnings' && method === 'GET') {
              const txs: any[] = db.prepare('SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC').all('success');
              const totalFee = txs.reduce((acc, t) => acc + Number(t.fee_amount || 0), 0);
              return sendJson(res, 200, {
                success: true,
                totalCombined: totalFee,
                totalEmployer: totalFee,
                totalEarner: 0,
                recentEarnings: txs,
              });
            }
          }

          // =====================================================================
          // 3. WALLET, DEPOSIT & WITHDRAWAL ROUTES
          // =====================================================================
          if (pathname.startsWith('/api/wallet/') && method === 'GET') {
            const targetUserId = decodeURIComponent(pathname.replace('/api/wallet/', ''));
            if (!targetUserId) {
              return sendJson(res, 400, { success: false, error: 'Missing userId.' });
            }
            const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
            if (!user) {
              return sendJson(res, 200, {
                success: true,
                wallet: {
                  user_id: targetUserId,
                  balance: 0,
                  total_deposited: 0,
                  total_withdrawn: 0,
                  total_earned: 0,
                  total_fees_paid: 0,
                },
                transactions: [],
                deposits: [],
                withdrawals: [],
              });
            }

            const wtx = db.prepare(
              `SELECT id, user_id, reference, amount, fee_amount, net_amount, type, description, status, admin_id, created_at
               FROM wallet_transactions
               WHERE user_id = ?
               ORDER BY created_at DESC`
            ).all(targetUserId);

            const deposits = db.prepare(
              `SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC`
            ).all(targetUserId);

            const withdrawals = db.prepare(
              `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`
            ).all(targetUserId);

            return sendJson(res, 200, {
              success: true,
              wallet: {
                user_id: user.id,
                balance: Number(user.balance || 0),
                total_deposited: Number(user.total_deposited || 0),
                total_withdrawn: Number(user.total_withdrawn || 0),
                total_earned: Number(user.total_earned || 0),
                total_fees_paid: Number(user.total_fees_paid || 0),
              },
              transactions: wtx,
              deposits,
              withdrawals,
            });
          }

          if (pathname === '/api/wallet/deposit' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const userId = authRes.user.uid;
            const amount = Number(body.amount);
            const proofUrl = String(body.proof_url || body.proofUrl || '').trim();
            const paymentMethod = String(body.payment_method || 'bank_transfer').trim();

            if (!amount || isNaN(amount) || amount <= 0) {
              return sendJson(res, 400, { success: false, error: 'Please enter a valid deposit amount greater than 0.' });
            }
            if (!proofUrl || !proofUrl.startsWith('http')) {
              return sendJson(res, 400, { success: false, error: 'Please upload your payment proof screenshot first.' });
            }

            const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (!user) {
              return sendJson(res, 404, { success: false, error: 'User account not found.' });
            }

            const depositId = makeId('dep');
            const ref = body.reference ? String(body.reference).trim() : `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const nowIso = new Date().toISOString();

            db.exec('BEGIN');
            try {
              db.prepare(
                `INSERT INTO deposits (id, user_id, user_email, user_name, amount, proof_url, reference, payment_method, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
              ).run(depositId, userId, user.email, user.name || 'Member', amount, proofUrl, ref, paymentMethod, nowIso);

              db.prepare(
                `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
                 VALUES (?, ?, ?, ?, 0, ?, 'deposit', ?, 'Pending', ?)`
              ).run(makeId('wtx'), userId, ref, amount, amount, `Deposit via ${paymentMethod} (Pending Admin Confirmation)`, nowIso);

              db.exec('COMMIT');
            } catch (e) {
              db.exec('ROLLBACK');
              throw e;
            }

            const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
            return sendJson(res, 200, {
              success: true,
              message: 'Deposit submitted and is Pending Admin confirmation.',
              deposit,
              balance: Number(user.balance || 0),
            });
          }

          if (pathname === '/api/wallet/withdraw' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const userId = authRes.user.uid;
            const amount = Number(body.amount);
            const bankName = String(body.bank_name || body.bankName || '').trim();
            const accountNumber = String(body.account_number || body.accountNumber || '').trim();
            const accountName = String(body.account_name || body.accountName || '').trim();

            if (!amount || isNaN(amount) || amount <= 0) {
              return sendJson(res, 400, { success: false, error: 'Please enter a valid withdrawal amount.' });
            }
            if (!bankName || !accountNumber || !accountName) {
              return sendJson(res, 400, { success: false, error: 'Bank name, account number, and account name are required.' });
            }

            const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (!user) {
              return sendJson(res, 404, { success: false, error: 'User account not found.' });
            }

            const balance = Number(user.balance || 0);
            if (amount > balance) {
              return sendJson(res, 400, { success: false, error: 'Insufficient balance' });
            }

            const pendingSumRow: any = db.prepare(
              `SELECT COALESCE(SUM(amount), 0) as total_pending FROM withdrawals WHERE user_id = ? AND status = 'Pending'`
            ).get(userId);
            const totalPending = Number(pendingSumRow?.total_pending || 0);
            if (totalPending + amount > balance) {
              return sendJson(res, 400, { success: false, error: 'Insufficient balance' });
            }

            const withdrawalId = makeId('wdr');
            const nowIso = new Date().toISOString();

            db.exec('BEGIN');
            try {
              db.prepare(
                `INSERT INTO withdrawals (id, user_id, user_email, user_name, amount, bank_name, account_number, account_name, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
              ).run(withdrawalId, userId, user.email, user.name || 'Member', amount, bankName, accountNumber, accountName, nowIso);

              db.prepare(
                `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
                 VALUES (?, ?, ?, ?, 0, ?, 'withdrawal', ?, 'Pending', ?)`
              ).run(makeId('wtx'), userId, withdrawalId, amount, amount, `Withdrawal to ${bankName} (${accountNumber})`, nowIso);

              db.exec('COMMIT');
            } catch (e) {
              db.exec('ROLLBACK');
              throw e;
            }

            const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);
            return sendJson(res, 200, {
              success: true,
              message: 'Withdrawal request submitted and is Pending Admin approval.',
              withdrawal,
              balance,
            });
          }

          // =====================================================================
          // 4. TASKS & WORKER SUBMISSIONS ROUTES (REAL DB)
          // =====================================================================
          if (pathname === '/api/tasks' && method === 'GET') {
            const employerId = parsedUrl.searchParams.get('employer_id');
            const earnerId = parsedUrl.searchParams.get('earner_id');

            let tasks: any[];
            if (employerId) {
              tasks = db.prepare('SELECT * FROM tasks WHERE employer_id = ? ORDER BY created_at DESC').all(employerId);
            } else {
              tasks = db.prepare("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC").all();
            }

            let applications: any[] = [];
            if (earnerId) {
              applications = db.prepare(
                `SELECT a.*, t.title, t.category, t.reward, t.employer_name, t.deadline, t.description, t.proof_required,
                        s.id as submission_id, s.proof_url, s.proof_link, s.proof_text, s.status as submission_status, s.created_at as submitted_at
                 FROM task_applications a
                 JOIN tasks t ON a.task_id = t.id
                 LEFT JOIN task_submissions s ON s.task_id = a.task_id AND s.earner_id = a.earner_id
                 WHERE a.earner_id = ?
                 ORDER BY a.created_at DESC`
              ).all(earnerId);
            }

            return sendJson(res, 200, { success: true, tasks, applications });
          }

          if (pathname === '/api/tasks' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(authRes.user.uid);
            if (!user || user.payment_status !== 'paid' || user.role !== 'employer') {
              return sendJson(res, 403, {
                success: false,
                error: 'Activation payment is required before you can post tasks.',
              });
            }

            const body = await parseJsonBody(req);
            const title = String(body.title || '').trim();
            const description = String(body.description || body.instructions || '').trim();
            const category = String(body.category || 'Social Media').trim();
            const reward = Number(body.reward || body.price || 0);
            const workersNeeded = Math.max(1, parseInt(body.workersNeeded || body.workers_needed || '10', 10) || 10);
            const deadline = String(body.deadline || '3 days').trim();
            const proofRequired = String(body.proofRequired || body.proof_required || 'Screenshot proof required').trim();
            const campaignImageUrl = String(body.campaign_image_url || body.campaignImageUrl || '').trim() || null;

            if (!title) {
              return sendJson(res, 400, { success: false, error: 'Task title is required.' });
            }
            if (!reward || isNaN(reward) || reward <= 0) {
              return sendJson(res, 400, { success: false, error: 'Valid reward amount is required.' });
            }

            const taskId = makeId('tsk');
            const nowIso = new Date().toISOString();
            db.prepare(
              `INSERT INTO tasks (id, employer_id, employer_name, title, description, category, reward, workers_needed, workers_completed, deadline, proof_required, campaign_image_url, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?)`
            ).run(taskId, user.id, user.name || 'Verified Employer', title, description, category, reward, workersNeeded, deadline, proofRequired, campaignImageUrl, nowIso);

            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            return sendJson(res, 200, { success: true, task });
          }

          if (pathname === '/api/tasks/apply' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const u: any = db.prepare('SELECT * FROM users WHERE id = ?').get(authRes.user.uid);
            if (!u || u.payment_status !== 'paid') {
              return sendJson(res, 403, { success: false, error: 'Activation payment required before accepting tasks.' });
            }
            const body = await parseJsonBody(req);
            const taskId = String(body.task_id || body.taskId || '').trim();
            const earnerId = authRes.user.uid;
            if (!taskId) {
              return sendJson(res, 400, { success: false, error: 'Missing task_id.' });
            }
            const task: any = db.prepare("SELECT * FROM tasks WHERE id = ? AND status = 'open'").get(taskId);
            if (!task) {
              return sendJson(res, 404, { success: false, error: 'Task not found or no longer open.' });
            }
            const appId = makeId('app');
            db.prepare(
              `INSERT OR IGNORE INTO task_applications (id, task_id, earner_id, status, created_at)
               VALUES (?, ?, ?, 'accepted', ?)`
            ).run(appId, taskId, earnerId, new Date().toISOString());

            return sendJson(res, 200, { success: true, message: 'Task accepted.' });
          }

          if (pathname === '/api/tasks/cancel' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const taskId = String(body.taskId || body.task_id || '').trim();
            const task: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            if (!task || task.employer_id !== authRes.user.uid) {
              return sendJson(res, 403, { success: false, error: 'Not authorized to cancel this task.' });
            }
            db.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = ?").run(taskId);
            return sendJson(res, 200, { success: true, message: 'Task cancelled.' });
          }

          if (pathname === '/api/submissions' && method === 'GET') {
            const employerId = parsedUrl.searchParams.get('employer_id');
            const earnerId = parsedUrl.searchParams.get('earner_id');
            const taskId = parsedUrl.searchParams.get('task_id');

            let rows: any[];
            if (employerId) {
              rows = db.prepare(
                `SELECT s.*, COALESCE(s.task_title, t.title) as task_title, COALESCE(s.reward, t.reward) as reward
                 FROM task_submissions s
                 LEFT JOIN tasks t ON s.task_id = t.id
                 WHERE s.employer_id = ? OR t.employer_id = ?
                 ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.created_at DESC`
              ).all(employerId, employerId);
            } else if (earnerId) {
              rows = db.prepare(
                `SELECT s.*, COALESCE(s.task_title, t.title) as task_title, COALESCE(s.reward, t.reward) as reward
                 FROM task_submissions s
                 LEFT JOIN tasks t ON s.task_id = t.id
                 WHERE s.earner_id = ?
                 ORDER BY s.created_at DESC`
              ).all(earnerId);
            } else if (taskId) {
              rows = db.prepare('SELECT * FROM task_submissions WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
            } else {
              rows = db.prepare('SELECT * FROM task_submissions ORDER BY created_at DESC').all();
            }
            return sendJson(res, 200, { success: true, submissions: rows });
          }

          if (pathname === '/api/submissions' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const earnerId = authRes.user.uid;
            const worker: any = db.prepare('SELECT * FROM users WHERE id = ?').get(earnerId);
            if (!worker || worker.payment_status !== 'paid') {
              return sendJson(res, 403, { success: false, error: 'Activation payment required before submitting task proof.' });
            }

            const body = await parseJsonBody(req);
            const taskId = String(body.task_id || body.taskId || '').trim();
            const proofUrl = String(body.proof_url || body.proofUrl || '').trim();
            const proofLink = String(body.proof_link || body.proofLink || '').trim();
            const proofText = String(body.proof_text || body.proofText || '').trim();

            if (!taskId) {
              return sendJson(res, 400, { success: false, error: 'Missing task_id.' });
            }
            if (!proofUrl && !proofLink) {
              return sendJson(res, 400, { success: false, error: 'Please upload a proof screenshot or provide a proof link.' });
            }

            const task: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            if (!task) {
              return sendJson(res, 404, { success: false, error: 'Task not found.' });
            }

            const subId = makeId('sub');
            const nowIso = new Date().toISOString();

            db.exec('BEGIN');
            try {
              db.prepare(
                `INSERT OR IGNORE INTO task_applications (id, task_id, earner_id, status, created_at)
                 VALUES (?, ?, ?, 'submitted', ?)`
              ).run(makeId('app'), taskId, earnerId, nowIso);

              db.prepare(
                `UPDATE task_applications SET status = 'submitted' WHERE task_id = ? AND earner_id = ?`
              ).run(taskId, earnerId);

              db.prepare(
                `INSERT INTO task_submissions (id, task_id, task_title, employer_id, earner_id, earner_name, earner_email, proof_url, proof_link, proof_text, reward, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
              ).run(
                subId,
                taskId,
                task.title,
                task.employer_id,
                earnerId,
                worker?.name || 'Worker',
                worker?.email || authRes.user.email || '',
                proofUrl || null,
                proofLink || null,
                proofText || '',
                Number(task.reward || 0),
                nowIso
              );
              db.exec('COMMIT');
            } catch (e) {
              db.exec('ROLLBACK');
              throw e;
            }

            const submission = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(subId);
            return sendJson(res, 200, { success: true, submission });
          }

          if (pathname === '/api/submissions/approve' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const submissionId = String(body.submissionId || body.id || '').trim();
            const sub: any = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(submissionId);
            if (!sub) {
              return sendJson(res, 404, { success: false, error: 'Submission not found.' });
            }
            if (sub.employer_id && sub.employer_id !== authRes.user.uid && !isAdminEmail(authRes.user.email)) {
              return sendJson(res, 403, { success: false, error: 'Only the task employer can approve this submission.' });
            }
            if (sub.status !== 'pending') {
              return sendJson(res, 409, { success: false, error: `Submission already ${sub.status}.` });
            }

            const reward = Number(sub.reward || 0);
            const nowIso = new Date().toISOString();

            db.exec('BEGIN');
            try {
              db.prepare(
                `UPDATE task_submissions SET status = 'approved', reviewed_at = ? WHERE id = ?`
              ).run(nowIso, submissionId);

              db.prepare(
                `UPDATE task_applications SET status = 'approved' WHERE task_id = ? AND earner_id = ?`
              ).run(sub.task_id, sub.earner_id);

              db.prepare(
                `UPDATE tasks SET workers_completed = COALESCE(workers_completed, 0) + 1 WHERE id = ?`
              ).run(sub.task_id);

              db.prepare(
                `UPDATE users
                 SET balance = COALESCE(balance, 0) + ?,
                     total_earned = COALESCE(total_earned, 0) + ?,
                     updated_at = ?
                 WHERE id = ?`
              ).run(reward, reward, nowIso, sub.earner_id);

              db.prepare(
                `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
                 VALUES (?, ?, ?, ?, 0, ?, 'task_earning', ?, 'Approved', ?)`
              ).run(
                makeId('wtx'),
                sub.earner_id,
                `task_${sub.id}`,
                reward,
                reward,
                `Task approved: ${sub.task_title || sub.task_id}`,
                nowIso
              );

              db.exec('COMMIT');
            } catch (e) {
              db.exec('ROLLBACK');
              throw e;
            }

            return sendJson(res, 200, {
              success: true,
              message: `Submission approved and ₦${reward.toLocaleString()} credited to worker wallet.`,
            });
          }

          if (pathname === '/api/submissions/reject' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const submissionId = String(body.submissionId || body.id || '').trim();
            const sub: any = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(submissionId);
            if (!sub) {
              return sendJson(res, 404, { success: false, error: 'Submission not found.' });
            }
            if (sub.employer_id && sub.employer_id !== authRes.user.uid && !isAdminEmail(authRes.user.email)) {
              return sendJson(res, 403, { success: false, error: 'Only the task employer can reject this submission.' });
            }
            const nowIso = new Date().toISOString();
            db.prepare("UPDATE task_submissions SET status = 'rejected', reviewed_at = ? WHERE id = ?").run(nowIso, submissionId);
            db.prepare("UPDATE task_applications SET status = 'rejected' WHERE task_id = ? AND earner_id = ?").run(sub.task_id, sub.earner_id);
            return sendJson(res, 200, { success: true, message: 'Submission rejected.' });
          }

          // =====================================================================
          // 5. MARKETPLACE & PAYSTACK ROUTES (PERSISTED IN SQLITE)
          // =====================================================================
          if (pathname === '/api/marketplace/products' && method === 'GET') {
            let authUid: string | null = null;
            if (authHeader) {
              const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
              if (authRes.success && authRes.user) {
                authUid = authRes.user.uid;
              }
            }
            const userOrders = authUid
              ? db.prepare('SELECT * FROM marketplace_orders WHERE user_id = ? ORDER BY created_at DESC').all(authUid)
              : [];
            return sendJson(res, 200, { success: true, products: MARKETPLACE_CATALOG, orders: userOrders });
          }

          if (pathname === '/api/marketplace/deliver' && method === 'GET') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: 'Authentication required.' });
            }
            const reference = parsedUrl.searchParams.get('reference');
            const productId = parsedUrl.searchParams.get('productId');

            let order: any = null;
            if (reference) {
              order = db.prepare(
                'SELECT * FROM marketplace_orders WHERE reference = ? AND user_id = ? AND delivery_unlocked = 1'
              ).get(reference, authRes.user.uid);
            } else if (productId) {
              order = db.prepare(
                'SELECT * FROM marketplace_orders WHERE product_id = ? AND user_id = ? AND delivery_unlocked = 1 ORDER BY verified_at DESC LIMIT 1'
              ).get(productId, authRes.user.uid);
            }
            if (!order) {
              return sendJson(res, 403, { success: false, error: 'Access Denied: Product delivery is locked until Paystack verification succeeds.' });
            }
            const product = getCatalogProductById(order.product_id);
            return sendJson(res, 200, {
              success: true,
              delivered: true,
              reference: order.reference,
              product: {
                id: order.product_id,
                title: order.product_title,
                category: order.category,
                delivery_type: product?.delivery_type || 'download',
                r2_file_key: product?.r2_file_key || null,
                vendor_name: product?.vendor_name || 'CDSure Official',
              },
              accessPayload: {
                licenseKey: `CDSURE-${String(order.reference).toUpperCase()}`,
                unlockedAt: order.verified_at,
                instructions: 'Your digital package has been verified via Paystack and unlocked.',
              },
            });
          }

          if ((pathname === '/api/payments/initialize' || pathname === '/api/paystack/initialize') && method === 'GET') {
            return sendJson(res, 405, {
              success: false,
              endpoint: pathname,
              method: 'GET',
              error: `Method GET not allowed. Send POST ${pathname} with JSON payload and Authorization Bearer token.`,
            });
          }

          if ((pathname === '/api/payments/initialize' || pathname === '/api/paystack/initialize') && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Unauthorized.' });
            }
            const userId = authRes.user.uid;
            const body = await parseJsonBody(req);
            const userEmail = authRes.user.email || body.email;
            if (!userEmail || !String(userEmail).includes('@')) {
              return sendJson(res, 400, { success: false, error: 'Valid email is required for Paystack payment.' });
            }

            const requestedRole: 'earner' | 'employer' =
              body.requested_role === 'employer' || body.role === 'employer' ? 'employer' : 'earner';
            const productId = body.productId ? String(body.productId).trim() : null;
            let purpose = String(body.purpose || (productId ? 'marketplace_purchase' : 'activation'));
            let amount = parseFloat(body.amount);
            const resolvedProduct = productId ? getCatalogProductById(productId) : undefined;
            const fees = getActivationFeeSettings(db);

            if (productId) {
              if (!resolvedProduct) {
                return sendJson(res, 404, { success: false, error: 'Selected marketplace product not found.' });
              }
              amount = resolvedProduct.price_ngn;
              purpose = resolvedProduct.category === 'subscription' ? 'subscription' : 'marketplace_purchase';
            } else if (purpose === 'activation') {
              amount = requestedRole === 'employer' ? fees.employer_fee : fees.earner_fee;
            } else if (purpose === 'subscription') {
              amount = isNaN(amount) || amount < 3500 ? 3500 : amount;
            } else {
              if (!isNaN(Number(body.amountNaira)) && Number(body.amountNaira) >= 100) {
                amount = Number(body.amountNaira);
              } else if (body.unit === 'kobo' && !isNaN(amount)) {
                amount = koboToNaira(amount);
              }
              if (isNaN(amount) || amount < 100) {
                return sendJson(res, 400, { success: false, error: 'Minimum payment amount is ₦100.' });
              }
            }

            const reference = body.reference
              ? String(body.reference).trim()
              : generatePaystackReference(purpose, userId);
            const existingTx = db.prepare('SELECT id FROM transactions WHERE reference = ?').get(reference);
            if (existingTx) {
              return sendJson(res, 409, { success: false, error: 'Duplicate order reference.' });
            }

            const amountInKobo = nairaToKobo(amount);
            const nowIso = new Date().toISOString();

            db.prepare(
              `INSERT OR IGNORE INTO users (id, name, email, role, requested_role, payment_status, status, balance, is_activated)
               VALUES (?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, 0)`
            ).run(userId, userEmail.split('@')[0] || 'Member', userEmail, requestedRole);

            db.prepare(
              `INSERT INTO transactions (id, reference, user_id, email, product_id, amount, fee_amount, net_amount, currency, payment_gateway, status, transaction_type, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'NGN', 'paystack', 'pending', ?, ?)`
            ).run(makeId('tx'), reference, userId, userEmail, resolvedProduct?.id || null, amount, amount, purpose, nowIso);

            if (purpose === 'activation') {
              db.prepare(`UPDATE users SET requested_role = ?, activation_reference = ?, updated_at = ? WHERE id = ?`).run(
                requestedRole,
                reference,
                nowIso,
                userId
              );
            }

            if (resolvedProduct) {
              db.prepare(
                `INSERT INTO marketplace_orders (id, reference, user_id, email, product_id, product_title, category, amount, platform_fee, vendor_amount, vendor_id, status, delivery_unlocked, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', 0, ?)`
              ).run(
                makeId('ord'),
                reference,
                userId,
                userEmail,
                resolvedProduct.id,
                resolvedProduct.title,
                resolvedProduct.category,
                amount,
                amount,
                resolvedProduct.vendor_id,
                nowIso
              );
            }

            const secretKey = getPaystackSecretKey();
            if (!secretKey || !secretKey.startsWith('sk_live_')) {
              return sendJson(res, 503, { success: false, error: 'Paystack LIVE secret key (sk_live_...) is not configured on server.' });
            }

            const origin = `http://${req.headers.host || 'localhost:3000'}`;
            const defaultCallback =
              purpose === 'activation'
                ? `${origin}/activate?verify=${encodeURIComponent(reference)}`
                : `${origin}/verify-payment?reference=${encodeURIComponent(reference)}`;
            const callbackUrl = body.callback_url || defaultCallback;

            const paystackRes = await initializePaystackTransaction(secretKey, {
              email: userEmail,
              amountInKobo,
              reference,
              callback_url: callbackUrl,
              metadata: {
                userId,
                email: userEmail,
                purpose,
                role: requestedRole,
                requested_role: requestedRole,
                expectedAmountNaira: amount,
                productId: resolvedProduct?.id,
                productTitle: resolvedProduct?.title,
                category: resolvedProduct?.category,
              },
            });

            if (!paystackRes.status || !paystackRes.data) {
              return sendJson(res, 400, {
                success: false,
                error: paystackRes.message || 'Paystack transaction initialization failed.',
              });
            }

            return sendJson(res, 200, {
              success: true,
              message: 'Paystack checkout initialized.',
              authorization_url: paystackRes.data.authorization_url,
              access_code: paystackRes.data.access_code,
              reference: paystackRes.data.reference,
              amount,
              amountInKobo,
              currency: 'NGN',
              purpose,
              requested_role: requestedRole,
              productId: resolvedProduct?.id || null,
            });
          }

          if ((pathname === '/api/payments/verify' || pathname === '/api/paystack/verify' || pathname === '/api/verify-payment') && (method === 'GET' || method === 'POST')) {
            const secretKey = getPaystackSecretKey();
            if (!secretKey || secretKey.includes('placeholder')) {
              return sendJson(res, 503, { success: false, error: 'Paystack secret key not configured.' });
            }
            let authUid: string | null = null;
            if (authHeader) {
              const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
              if (!authRes.success || !authRes.user) {
                return sendJson(res, 401, { success: false, error: authRes.error || 'Unauthorized.' });
              }
              authUid = authRes.user.uid;
            }
            let reference = parsedUrl.searchParams.get('reference') || parsedUrl.searchParams.get('trxref');
            if (!reference && method === 'POST') {
              const b = await parseJsonBody(req);
              reference = b.reference || b.trxref;
            }
            if (!reference) {
              return sendJson(res, 400, { success: false, error: 'Transaction reference is required.' });
            }
            reference = String(reference).trim();

            const tx: any = db.prepare('SELECT * FROM transactions WHERE reference = ?').get(reference);
            if (authUid && tx && tx.user_id && tx.user_id !== authUid) {
              return sendJson(res, 403, { success: false, error: 'Forbidden: Transaction does not belong to you.' });
            }

            const verifyRes = await verifyPaystackTransaction(secretKey, reference);
            if (!verifyRes.status || !verifyRes.data) {
              return sendJson(res, 400, {
                success: false,
                status: 'failed',
                error: 'Payment not verified. Try again.',
              });
            }

            const pData = verifyRes.data;
            if (pData.domain && String(pData.domain).toLowerCase() !== 'live') {
              return sendJson(res, 400, { success: false, status: 'failed', error: 'Test-mode transactions are rejected in LIVE production.' });
            }
            if (pData.status !== 'success') {
              if (tx && tx.status !== 'success') {
                db.prepare(`UPDATE transactions SET status = ?, gateway_response = ? WHERE reference = ?`).run(
                  pData.status === 'abandoned' ? 'abandoned' : 'failed',
                  pData.gateway_response || pData.status,
                  reference
                );
              }
              return sendJson(res, 400, {
                success: false,
                status: pData.status,
                reference,
                error: 'Payment not verified. Try again.',
              });
            }

            const metadata = pData.metadata || {};
            const targetUserId = tx?.user_id || metadata.userId || authUid;
            const paidNaira = koboToNaira(pData.amount);
            const purpose =
              tx?.transaction_type ||
              metadata.purpose ||
              (reference.startsWith('CDSURE-') && !reference.startsWith('CDSURE-DEP') && !reference.startsWith('CDSURE-MKT')
                ? 'activation'
                : 'wallet_funding');
            const requestedRole: 'earner' | 'employer' =
              metadata.requested_role === 'employer' || metadata.role === 'employer' ? 'employer' : 'earner';

            const fees = getActivationFeeSettings(db);
            let expectedNaira = tx?.amount
              ? Number(tx.amount)
              : metadata.expectedAmountNaira
              ? Number(metadata.expectedAmountNaira)
              : 0;
            if (purpose === 'activation' && expectedNaira <= 0) {
              expectedNaira = requestedRole === 'employer' ? fees.employer_fee : fees.earner_fee;
            }
            if (expectedNaira > 0 && pData.amount < nairaToKobo(expectedNaira)) {
              return sendJson(res, 400, { success: false, error: 'Payment not verified. Try again.' });
            }

            const alreadyVerified = tx?.status === 'success';
            const nowIso = new Date().toISOString();
            const productId = tx?.product_id || metadata.productId || null;

            if (!alreadyVerified && targetUserId) {
              db.exec('BEGIN');
              try {
                if (tx) {
                  db.prepare('UPDATE transactions SET status = ?, verified_at = ?, gateway_response = ? WHERE reference = ?')
                    .run('success', nowIso, pData.gateway_response || 'Successful', reference);
                } else {
                  db.prepare(
                    `INSERT INTO transactions (id, reference, user_id, email, product_id, amount, fee_amount, net_amount, currency, payment_gateway, status, transaction_type, created_at, verified_at)
                     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'NGN', 'paystack', 'success', ?, ?, ?)`
                  ).run(makeId('tx'), reference, targetUserId, pData.customer?.email || '', productId, paidNaira, paidNaira, purpose, nowIso, nowIso);
                }

                if (purpose === 'activation') {
                  const uRow: any = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
                  const targetRole =
                    requestedRole === 'employer' || uRow?.requested_role === 'employer' ? 'employer' : 'earner';
                  const bonus = targetRole === 'employer' ? fees.activation_bonus_employer : fees.activation_bonus_earner;

                  db.prepare(
                    `UPDATE users
                     SET payment_status = 'paid',
                         activation_reference = ?,
                         activation_amount = ?,
                         activation_paid_at = ?,
                         role = ?,
                         requested_role = ?,
                         status = 'active',
                         is_activated = 1,
                         employer_approved = ?,
                         employer_status = ?,
                         balance = COALESCE(balance, 0) + ?,
                         updated_at = ?
                     WHERE id = ?`
                  ).run(
                    reference,
                    paidNaira,
                    nowIso,
                    targetRole,
                    targetRole,
                    targetRole === 'employer' ? 1 : 0,
                    targetRole === 'employer' ? 'approved' : 'none',
                    bonus,
                    nowIso,
                    targetUserId
                  );

                  db.prepare(
                    `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
                     VALUES (?, ?, ?, ?, 0, ?, 'activation_payment', ?, 'Approved', ?)`
                  ).run(
                    makeId('wtx'),
                    targetUserId,
                    `${reference}_act`,
                    paidNaira,
                    bonus,
                    bonus > 0
                      ? `Account Activation via Paystack (+₦${bonus.toLocaleString()} activation bonus)`
                      : `Account Activation (${targetRole.toUpperCase()}) via Paystack`,
                    nowIso
                  );
                } else if (purpose === 'wallet_funding' || purpose === 'deposit') {
                  db.prepare(
                    `UPDATE users SET balance = COALESCE(balance, 0) + ?, total_deposited = COALESCE(total_deposited, 0) + ?, updated_at = ? WHERE id = ?`
                  ).run(paidNaira, paidNaira, nowIso, targetUserId);
                  db.prepare(
                    `INSERT OR IGNORE INTO deposits (id, user_id, user_email, amount, reference, payment_method, status, created_at, reviewed_at)
                     VALUES (?, ?, ?, ?, ?, 'paystack', 'Approved', ?, ?)`
                  ).run(makeId('dep'), targetUserId, pData.customer?.email || '', paidNaira, reference, nowIso, nowIso);
                  db.prepare(
                    `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
                     VALUES (?, ?, ?, ?, 0, ?, 'deposit', 'Wallet Deposit via Paystack', 'Approved', ?)`
                  ).run(makeId('wtx'), targetUserId, reference, paidNaira, paidNaira, nowIso);
                } else if (productId) {
                  db.prepare(
                    `UPDATE marketplace_orders SET status = 'delivered', delivery_unlocked = 1, verified_at = ?, download_url = ? WHERE reference = ?`
                  ).run(nowIso, `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`, reference);
                }

                db.exec('COMMIT');
              } catch (e) {
                db.exec('ROLLBACK');
                throw e;
              }
            }

            const u: any = targetUserId ? db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) : null;
            return sendJson(res, 200, {
              success: true,
              alreadyVerified,
              message: alreadyVerified ? 'Payment already verified.' : 'Payment verified directly with Paystack.',
              reference,
              amount: paidNaira,
              currency: pData.currency,
              status: 'success',
              payment_status: 'paid',
              purpose,
              role: u?.role || requestedRole,
              user: u,
              productId,
              delivered: Boolean(productId),
              delivery_url: productId ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}` : null,
              userId: targetUserId,
              is_activated: u?.is_activated || 0,
              balance: u?.balance || 0,
              verified_at: nowIso,
            });
          }

          if ((pathname === '/api/payments/webhook' || pathname === '/api/paystack/webhook') && method === 'POST') {
            const webhookSecret = getPaystackWebhookSecret();
            if (!webhookSecret || webhookSecret.includes('placeholder')) {
              res.statusCode = 500;
              res.end('Webhook secret not configured');
              return;
            }
            const signature = (req.headers['x-paystack-signature'] || null) as string | null;
            const rawBody = await parseRawBody(req);
            const isValid = await verifyPaystackWebhookSignature(rawBody, signature, webhookSecret);
            if (!isValid) {
              res.statusCode = 401;
              res.end('Invalid webhook signature');
              return;
            }
            const body = JSON.parse(rawBody);
            const reference = body?.data?.reference;
            const eventType = body?.event;
            const nowIso = new Date().toISOString();

            if (reference) {
              const seen = db.prepare('SELECT id FROM payment_events WHERE reference = ?').get(`${eventType}:${reference}`);
              if (seen) {
                return sendJson(res, 200, { status: true, message: 'Already processed' });
              }
              db.prepare('INSERT INTO payment_events (id, event_type, reference, user_id, amount, payload, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(makeId('evt'), eventType, `${eventType}:${reference}`, body?.data?.metadata?.userId || null, koboToNaira(body?.data?.amount || 0), rawBody, nowIso);
            }
            return sendJson(res, 200, { status: true, message: 'Webhook processed' });
          }

          if ((pathname === '/api/payments/status' || pathname === '/api/paystack/status') && method === 'GET') {
            let targetUserId = parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('user_id');
            if (!targetUserId && authHeader) {
              const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
              if (authRes.success && authRes.user) {
                targetUserId = authRes.user.uid;
              }
            }
            const u: any = targetUserId ? db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) : null;
            const isPaid = u?.payment_status === 'paid' || u?.is_activated === 1;
            return sendJson(res, 200, {
              success: true,
              userId: targetUserId || null,
              is_activated: isPaid ? 1 : 0,
              requested_role: u?.requested_role || '',
              status: isPaid ? 'active' : 'pending',
              balance: Number(u?.balance || 0),
              role: isPaid ? (u?.role || 'earner') : 'pending',
              payment_status: isPaid ? 'paid' : 'unpaid',
              activation_reference: u?.activation_reference || null,
              activation_amount: Number(u?.activation_amount || 0),
              activation_paid_at: u?.activation_paid_at || null,
            });
          }

          // =====================================================================
          // 7. CLOUDINARY SIGNED UPLOAD, RECORD, DELETE & ADMIN REVIEW ROUTES
          // =====================================================================
          if (pathname === '/api/cloudinary/sign' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required before uploading.' });
            }
            const body = await parseJsonBody(req);
            const validation = validateCloudinaryImageInput({
              fileName: body.fileName || body.file_name,
              fileType: body.fileType || body.file_type || body.mimeType,
              fileSize: body.fileSize ?? body.file_size,
            });
            if (!validation.valid) {
              return sendJson(res, 400, { success: false, error: validation.error });
            }
            const { category, folder } = resolveCloudinaryFolder(body.category || body.folder);
            const config = getCloudinaryConfig();
            if (!config.apiKey || !config.apiSecret) {
              return sendJson(res, 503, {
                success: false,
                error: 'Cloudinary signed upload credentials (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET) are not configured on the backend.',
              });
            }
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = await signCloudinaryParams({ folder, timestamp }, config.apiSecret);
            return sendJson(res, 200, {
              success: true,
              signed: true,
              cloud_name: config.cloudName,
              api_key: config.apiKey,
              timestamp,
              signature,
              folder,
              category,
              upload_url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
            });
          }

          if (pathname === '/api/cloudinary/record' && method === 'POST') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const publicId = String(body.public_id || body.publicId || '').trim();
            const secureUrl = String(body.secure_url || body.secureUrl || '').trim();
            if (!publicId) {
              return sendJson(res, 400, { success: false, error: 'Cloudinary public_id is required.' });
            }
            if (!secureUrl || secureUrl.startsWith('data:') || !secureUrl.startsWith('https://res.cloudinary.com/')) {
              return sendJson(res, 400, { success: false, error: 'Only HTTPS Cloudinary image URLs are allowed (Base64 is rejected).' });
            }
            const { category, folder } = resolveCloudinaryFolder(body.category || body.folder);
            const defaultStatus =
              category === 'profile-images' || category === 'campaign-images' || category === 'product-images'
                ? 'approved'
                : 'pending';
            const nowIso = new Date().toISOString();
            const id = makeId('img');
            const uRow: any = db.prepare('SELECT name, email FROM users WHERE id = ?').get(authRes.user.uid);

            db.prepare(
              `INSERT INTO cloudinary_images
               (id, user_id, user_email, user_name, category, folder, public_id, secure_url, format, bytes, width, height, status, related_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(public_id) DO UPDATE SET
                 secure_url = excluded.secure_url,
                 category = excluded.category,
                 folder = excluded.folder,
                 related_id = COALESCE(excluded.related_id, cloudinary_images.related_id)`
            ).run(
              id,
              authRes.user.uid,
              authRes.user.email || uRow?.email || '',
              uRow?.name || authRes.user.name || 'Member',
              category,
              folder,
              publicId,
              secureUrl,
              String(body.format || '').toLowerCase(),
              Number(body.bytes || 0),
              Number(body.width || 0),
              Number(body.height || 0),
              defaultStatus,
              body.related_id ? String(body.related_id) : null,
              nowIso
            );

            if (category === 'profile-images') {
              db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(secureUrl, nowIso, authRes.user.uid);
            } else if (category === 'verification') {
              db.prepare('UPDATE users SET activation_proof_url = ?, updated_at = ? WHERE id = ?').run(secureUrl, nowIso, authRes.user.uid);
            }

            return sendJson(res, 200, {
              success: true,
              image: {
                id,
                user_id: authRes.user.uid,
                user_email: authRes.user.email,
                category,
                folder,
                public_id: publicId,
                secure_url: secureUrl,
                status: defaultStatus,
                created_at: nowIso,
              },
            });
          }

          if (pathname === '/api/cloudinary/delete' && (method === 'POST' || method === 'DELETE')) {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const body = await parseJsonBody(req);
            const publicId = String(body.public_id || body.publicId || '').trim();
            if (!publicId) {
              return sendJson(res, 400, { success: false, error: 'public_id is required to delete an image.' });
            }
            const admin = isAdminEmail(authRes.user.email);
            const existing: any = db.prepare('SELECT * FROM cloudinary_images WHERE public_id = ?').get(publicId);
            if (existing && existing.user_id !== authRes.user.uid && !admin) {
              return sendJson(res, 403, { success: false, error: 'Forbidden: You cannot delete another user’s image.' });
            }
            if (!existing && !admin && !publicId.startsWith('cdsure/')) {
              return sendJson(res, 403, { success: false, error: 'Forbidden: Unauthorized image deletion attempt.' });
            }
            const config = getCloudinaryConfig();
            if (!config.apiKey || !config.apiSecret) {
              return sendJson(res, 503, { success: false, error: 'Cloudinary API credentials are not configured on the backend.' });
            }
            const destroyRes = await destroyCloudinaryAssetOnCloud(config, publicId);
            if (!destroyRes.success) {
              return sendJson(res, 400, { success: false, error: destroyRes.error || 'Failed to delete from Cloudinary.' });
            }
            if (existing) {
              db.prepare('DELETE FROM cloudinary_images WHERE public_id = ?').run(publicId);
            }
            return sendJson(res, 200, { success: true, deleted: true, public_id: publicId, result: destroyRes.result });
          }

          if (pathname === '/api/cloudinary/images' && method === 'GET') {
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Authentication required.' });
            }
            const admin = isAdminEmail(authRes.user.email);
            const categoryFilter = parsedUrl.searchParams.get('category');
            const statusFilter = parsedUrl.searchParams.get('status');
            const clauses: string[] = [];
            const params: any[] = [];
            if (!admin) {
              if (categoryFilter === 'product-images') {
                clauses.push("(status = 'approved' OR user_id = ?)");
                params.push(authRes.user.uid);
              } else {
                clauses.push('user_id = ?');
                params.push(authRes.user.uid);
              }
            }
            if (categoryFilter && categoryFilter !== 'all') {
              clauses.push('category = ?');
              params.push(categoryFilter);
            }
            if (statusFilter && statusFilter !== 'all') {
              clauses.push('status = ?');
              params.push(statusFilter);
            }
            const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
            const images = db.prepare(`SELECT * FROM cloudinary_images ${whereSql} ORDER BY created_at DESC LIMIT 200`).all(...params);
            const taskSubmissions = admin
              ? db
                  .prepare(
                    `SELECT id, task_id, task_title, employer_id, earner_id, earner_name, earner_email, proof_url, proof_link, proof_text, reward, status, created_at
                     FROM task_submissions
                     WHERE proof_url IS NOT NULL AND proof_url != ''
                     ORDER BY created_at DESC
                     LIMIT 100`
                  )
                  .all()
              : [];
            return sendJson(res, 200, { success: true, images, task_submissions: taskSubmissions });
          }

          if (pathname === '/api/cloudinary/review' && method === 'POST') {
            const adminCheck = await requireAdmin(authHeader, 'cdsure-c360f', { allowDevSynthetic: true });
            if (!adminCheck.success || !adminCheck.user) {
              return sendJson(res, adminCheck.status, { success: false, error: adminCheck.error });
            }
            const body = await parseJsonBody(req);
            const id = String(body.id || '').trim();
            const publicId = String(body.public_id || body.publicId || '').trim();
            const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : '';
            const reviewNote = String(body.review_note || body.note || '').trim();
            if ((!id && !publicId) || !status) {
              return sendJson(res, 400, { success: false, error: 'Image identifier and valid status are required.' });
            }
            const nowIso = new Date().toISOString();
            if (id) {
              db.prepare('UPDATE cloudinary_images SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?').run(status, reviewNote, nowIso, id);
            } else {
              db.prepare('UPDATE cloudinary_images SET status = ?, review_note = ?, reviewed_at = ? WHERE public_id = ?').run(status, reviewNote, nowIso, publicId);
            }
            return sendJson(res, 200, { success: true, status, review_note: reviewNote, reviewed_at: nowIso });
          }

          return sendJson(res, 404, { success: false, error: `API endpoint not found: ${pathname}` });
        } catch (err: any) {
          console.error('Dev API middleware error:', err);
          return sendJson(res, 500, { success: false, error: err.message || 'Internal server error' });
        }
      });
    },
    transform(code: string, id: string) {
      if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs') && code.includes('ws.send(JSON.stringify(data));')) {
        return {
          code: code.replace(
            'ws.send(JSON.stringify(data));',
            'if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));'
          ),
          map: null,
        };
      }
      return null;
    },
  };
}
