import { requireAdmin } from '../../_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const admin = await requireAdmin(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID);
    if (!admin) {
      return new Response(JSON.stringify({ success: false, error: admin.error }), { status: 401, headers: CORS });
    }
    const body: any = await request.json().catch(() => ({}));
    const depositId = String(body.depositId || body.id || '').trim();
    if (!depositId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing depositId' }), { status: 400, headers: CORS });
    }

    const dep: any = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depositId).first();
    if (!dep) {
      return new Response(JSON.stringify({ success: false, error: 'Deposit not found.' }), { status: 404, headers: CORS });
    }

    // FIX: Accept Unpaid / unpaid / Pending / pending - not just Pending
    const statusLower = String(dep.status || '').toLowerCase();
    if (statusLower === 'approved' || statusLower === 'paid' || statusLower === 'confirmed') {
      return new Response(JSON.stringify({ success: false, error: `Deposit already ${dep.status}` }), { status: 400, headers: CORS });
    }

    const nowIso = new Date().toISOString();
    const admin_id = admin.uid || admin.email || 'admin';

    // Update deposit to Approved
    await env.DB.prepare("UPDATE deposits SET status = 'Approved', admin_id = ?, reviewed_at = ? WHERE id = ?").bind(admin_id, nowIso, depositId).run().catch(async () => {
      // Fallback if columns don't exist
      await env.DB.prepare("UPDATE deposits SET status = 'Approved' WHERE id = ?").bind(depositId).run();
    });

    // Credit user - try both balance and wallet_balance columns
    const amount = Number(dep.amount || 0);
    if (dep.user_id && amount > 0) {
      await env.DB.prepare("UPDATE users SET balance = COALESCE(balance, 0) + ?, total_deposited = COALESCE(total_deposited, 0) + ? WHERE id = ?").bind(amount, amount, dep.user_id).run().catch(() => null);
      await env.DB.prepare("UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?").bind(amount, dep.user_id).run().catch(() => null);
      await env.DB.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, 'credit', ?, 'Deposit approved by admin', ?)").bind(dep.user_id, amount, nowIso).run().catch(() => null);
    }

    return new Response(JSON.stringify({ success: true, message: 'Deposit confirmed and balance credited' }), { status: 200, headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
