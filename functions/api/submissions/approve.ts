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
    if (sub.status !== 'pending') {
      return new Response(JSON.stringify({ success: false, error: `Submission already ${sub.status}.` }), { status: 409, headers: CORS });
    }

    const reward = Number(sub.reward || 0);
    const nowIso = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(`UPDATE task_submissions SET status = 'approved', reviewed_at = ? WHERE id = ?`).bind(nowIso, submissionId),
      env.DB.prepare(`UPDATE task_applications SET status = 'approved' WHERE task_id = ? AND earner_id = ?`).bind(sub.task_id, sub.earner_id),
      env.DB.prepare(`UPDATE tasks SET workers_completed = COALESCE(workers_completed, 0) + 1 WHERE id = ?`).bind(sub.task_id),
      env.DB.prepare(`UPDATE users SET balance = COALESCE(balance, 0) + ?, total_earned = COALESCE(total_earned, 0) + ?, updated_at = ? WHERE id = ?`).bind(reward, reward, nowIso, sub.earner_id),
      env.DB.prepare(
        `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'task_earning', ?, 'Approved', ?)`
      ).bind('wtx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), sub.earner_id, `task_${sub.id}`, reward, reward, `Task approved: ${sub.task_title || sub.task_id}`, nowIso),
    ]);

    return new Response(JSON.stringify({ success: true, message: 'Submission approved and worker credited.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
