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
    const userId = String(body.userId || body.user_id || '').trim();
    const bonusAmount = Math.max(0, Number(body.bonusAmount ?? body.bonus ?? 0) || 0);
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId.' }), { status: 400, headers: CORS });
    }
    const target: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    if (!target) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404, headers: CORS });
    }
    if (Number(target.employer_approved) === 1) {
      return new Response(JSON.stringify({ success: false, error: 'Employer is already approved.' }), { status: 409, headers: CORS });
    }

    const nowIso = new Date().toISOString();
    const txId = 'wtx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const txRef = `act_credit_${Date.now()}_${crypto.randomUUID().slice(0, 4)}`;

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users
         SET role = 'employer', requested_role = 'employer', employer_approved = 1,
             employer_status = 'approved', employer_approved_at = ?, employer_rejection_reason = NULL,
             is_activated = 1, activation_paid_at = ?, balance = COALESCE(balance, 0) + ?, updated_at = ?
         WHERE id = ?`
      ).bind(nowIso, nowIso, bonusAmount, nowIso, userId),
      env.DB.prepare(
        `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, admin_id, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'activation_credit', ?, 'Approved', ?, ?)`
      ).bind(
        txId,
        userId,
        txRef,
        bonusAmount,
        bonusAmount,
        bonusAmount > 0 ? `Employer activation approved with ₦${bonusAmount.toLocaleString()} credit` : 'Employer activation approved by Admin',
        admin.user.uid,
        nowIso
      ),
    ]);

    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
