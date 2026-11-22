import { verifyFirebaseToken } from '../_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const auth = await verifyFirebaseToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 401, headers: CORS });
    }
    const body: any = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const bankName = String(body.bank_name || body.bankName || '').trim();
    const accountNumber = String(body.account_number || body.accountNumber || '').trim();
    const accountName = String(body.account_name || body.accountName || '').trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Valid withdrawal amount is required.' }), { status: 400, headers: CORS });
    }
    if (!bankName || !accountNumber || !accountName) {
      return new Response(JSON.stringify({ success: false, error: 'Bank details are required.' }), { status: 400, headers: CORS });
    }

    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404, headers: CORS });
    }
    const balance = Number(user.balance || 0);
    const pendingRow: any = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total_pending FROM withdrawals WHERE user_id = ? AND status = 'Pending'"
    ).bind(user.id).first();

    if (amount > balance || Number(pendingRow?.total_pending || 0) + amount > balance) {
      return new Response(JSON.stringify({ success: false, error: 'Insufficient balance' }), { status: 400, headers: CORS });
    }

    const withdrawalId = 'wdr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO withdrawals (id, user_id, user_email, user_name, amount, bank_name, account_number, account_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
    ).bind(withdrawalId, user.id, user.email, user.name || 'Member', amount, bankName, accountNumber, accountName, nowIso).run();

    await env.DB.prepare(
      `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 'withdrawal', ?, 'Pending', ?)`
    ).bind('wtx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), user.id, withdrawalId, amount, amount, `Withdrawal to ${bankName} (${accountNumber})`, nowIso).run();

    const withdrawal = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(withdrawalId).first();
    return new Response(JSON.stringify({ success: true, withdrawal, balance }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
