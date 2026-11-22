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
    const targetUserId = String(body.userId || body.user_id || '').trim();
    if (!targetUserId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId.' }), { status: 400, headers: CORS });
    }

    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE users
       SET payment_status = 'unpaid',
           role = 'pending',
           status = 'pending',
           is_activated = 0,
           employer_approved = 0,
           updated_at = ?
       WHERE id = ?`
    ).bind(nowIso, targetUserId).run();

    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
