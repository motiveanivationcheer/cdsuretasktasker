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
    const taskId = String(body.task_id || body.taskId || '').trim();
    if (!taskId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing task_id.' }), { status: 400, headers: CORS });
    }
    const u: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!u || u.payment_status !== 'paid') {
      return new Response(JSON.stringify({ success: false, error: 'Activation payment required before accepting tasks.' }), { status: 403, headers: CORS });
    }
    const task: any = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND status = 'open'").bind(taskId).first();
    if (!task) {
      return new Response(JSON.stringify({ success: false, error: 'Task not found.' }), { status: 404, headers: CORS });
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO task_applications (id, task_id, earner_id, status, created_at) VALUES (?, ?, ?, 'accepted', ?)`
    ).bind('app_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), taskId, auth.user.uid, new Date().toISOString()).run();

    return new Response(JSON.stringify({ success: true, message: 'Task accepted.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
