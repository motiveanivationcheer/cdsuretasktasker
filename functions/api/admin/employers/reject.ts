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
    const reason = String(body.reason || 'Activation payment proof could not be verified.').trim();
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId.' }), { status: 400, headers: CORS });
    }
    await env.DB.prepare(
      `UPDATE users SET role = 'earner', employer_approved = 0, employer_status = 'rejected', employer_rejection_reason = ?, updated_at = ? WHERE id = ?`
    ).bind(reason, new Date().toISOString(), userId).run();

    return new Response(JSON.stringify({ success: true, message: 'Employer request rejected.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
