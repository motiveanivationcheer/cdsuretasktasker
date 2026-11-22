import { requireAdmin } from '../../_auth';
import { readD1FeeSettings } from '../../../../src/server/paymentProcessor';

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
    const targetUserId = String(body.userId || body.user_id || '').trim();
    if (!targetUserId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId.' }), { status: 400, headers: CORS });
    }

    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404, headers: CORS });
    }

    const fees = await readD1FeeSettings(env.DB);
    const targetRole = user.requested_role === 'employer' ? 'employer' : 'earner';
    const feeAmount = targetRole === 'employer' ? fees.employer_fee : fees.earner_fee;
    const bonus = targetRole === 'employer' ? fees.activation_bonus_employer : fees.activation_bonus_earner;
    const nowIso = new Date().toISOString();
    const reference = user.activation_reference || `MANUAL-${targetUserId.slice(0, 8)}-${Date.now()}`;

    await env.DB.batch([
      env.DB.prepare(
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
      ).bind(
        reference,
        feeAmount,
        nowIso,
        targetRole,
        targetRole,
        targetRole === 'employer' ? 1 : 0,
        targetRole === 'employer' ? 'approved' : 'none',
        user.payment_status === 'paid' ? 0 : bonus,
        nowIso,
        targetUserId
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, admin_id, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'activation_payment', ?, 'Approved', ?, ?)`
      ).bind(
        'wtx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        targetUserId,
        `${reference}_manual`,
        feeAmount,
        bonus,
        `Manual Activation Confirmed by Admin (${targetRole.toUpperCase()})`,
        admin.user.uid,
        nowIso
      ),
    ]);

    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
