import { requireAdmin } from '../../_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const admin = await requireAdmin(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!admin.success || !admin.user) {
      return new Response(JSON.stringify({ success: false, error: admin.error }), { status: admin.status, headers: CORS });
    }
    const body: any = await request.json().catch(() => ({}));
    const withdrawalId = String(body.withdrawalId || body.id || '').trim();
    const w: any = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(withdrawalId).first();
    if (!w) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal not found.' }), { status: 404, headers: CORS });
    }
    if (w.status !== 'Pending') {
      return new Response(JSON.stringify({ success: false, error: `Withdrawal already ${w.status}.` }), { status: 409, headers: CORS });
    }
    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(w.user_id).first();
    if (!user || Number(user.balance || 0) < Number(w.amount)) {
      return new Response(JSON.stringify({ success: false, error: 'Insufficient balance for this user.' }), { status: 400, headers: CORS });
    }
    const nowIso = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET balance = COALESCE(balance, 0) - ?, total_withdrawn = COALESCE(total_withdrawn, 0) + ?, updated_at = ? WHERE id = ?`).bind(w.amount, w.amount, nowIso, w.user_id),
      env.DB.prepare(`UPDATE withdrawals SET status = 'Paid', admin_id = ?, reviewed_at = ? WHERE id = ?`).bind(admin.user.uid, nowIso, withdrawalId),
      env.DB.prepare(`UPDATE wallet_transactions SET status = 'Paid', admin_id = ? WHERE reference = ?`).bind(admin.user.uid, w.id),
    ]);
    return new Response(JSON.stringify({ success: true, message: 'Withdrawal approved and marked Paid.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
