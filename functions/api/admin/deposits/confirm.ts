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
    const depositId = String(body.depositId || body.id || '').trim();
    const dep: any = await env.DB.prepare('SELECT * FROM deposits WHERE id = ?').bind(depositId).first();
    if (!dep) {
      return new Response(JSON.stringify({ success: false, error: 'Deposit not found.' }), { status: 404, headers: CORS });
    }
    if (dep.status !== 'Pending') {
      return new Response(JSON.stringify({ success: false, error: `Deposit already ${dep.status}.` }), { status: 409, headers: CORS });
    }
    const nowIso = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE deposits SET status = 'Approved', admin_id = ?, reviewed_at = ? WHERE id = ?`).bind(admin.user.uid, nowIso, depositId),
      env.DB.prepare(`UPDATE wallet_transactions SET status = 'Approved', admin_id = ? WHERE reference = ?`).bind(admin.user.uid, dep.reference),
      env.DB.prepare(`UPDATE users SET balance = COALESCE(balance, 0) + ?, total_deposited = COALESCE(total_deposited, 0) + ?, updated_at = ? WHERE id = ?`).bind(dep.amount, dep.amount, nowIso, dep.user_id),
    ]);
    return new Response(JSON.stringify({ success: true, message: 'Deposit confirmed and balance credited.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
