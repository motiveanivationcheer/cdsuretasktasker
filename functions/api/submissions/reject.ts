import { verifyFirebaseToken, isAdminEmail } from '../_auth';

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
    const submissionId = String(body.submissionId || body.id || '').trim();
    const sub: any = await env.DB.prepare('SELECT * FROM task_submissions WHERE id = ?').bind(submissionId).first();
    if (!sub) {
      return new Response(JSON.stringify({ success: false, error: 'Submission not found.' }), { status: 404, headers: CORS });
    }
    if (sub.employer_id && sub.employer_id !== auth.user.uid && !isAdminEmail(auth.user.email)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: CORS });
    }
    const nowIso = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE task_submissions SET status = 'rejected', reviewed_at = ? WHERE id = ?`).bind(nowIso, submissionId),
      env.DB.prepare(`UPDATE task_applications SET status = 'rejected' WHERE task_id = ? AND earner_id = ?`).bind(sub.task_id, sub.earner_id),
    ]);
    return new Response(JSON.stringify({ success: true, message: 'Submission rejected.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
