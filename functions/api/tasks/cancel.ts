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
    const taskId = String(body.taskId || body.task_id || '').trim();
    const task: any = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
    if (!task || task.employer_id !== auth.user.uid) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: CORS });
    }
    await env.DB.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = ?").bind(taskId).run();
    return new Response(JSON.stringify({ success: true, message: 'Task cancelled.' }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
