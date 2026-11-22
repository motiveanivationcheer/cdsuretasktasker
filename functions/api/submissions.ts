import { verifyFirebaseToken } from './_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const employerId = url.searchParams.get('employer_id');
    const earnerId = url.searchParams.get('earner_id');
    const taskId = url.searchParams.get('task_id');

    let res: any;
    if (employerId) {
      res = await env.DB.prepare(
        `SELECT s.*, COALESCE(s.task_title, t.title) as task_title, COALESCE(s.reward, t.reward) as reward
         FROM task_submissions s LEFT JOIN tasks t ON s.task_id = t.id
         WHERE s.employer_id = ? OR t.employer_id = ?
         ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.created_at DESC`
      ).bind(employerId, employerId).all();
    } else if (earnerId) {
      res = await env.DB.prepare(
        `SELECT s.*, COALESCE(s.task_title, t.title) as task_title, COALESCE(s.reward, t.reward) as reward
         FROM task_submissions s LEFT JOIN tasks t ON s.task_id = t.id
         WHERE s.earner_id = ? ORDER BY s.created_at DESC`
      ).bind(earnerId).all();
    } else if (taskId) {
      res = await env.DB.prepare('SELECT * FROM task_submissions WHERE task_id = ? ORDER BY created_at DESC').bind(taskId).all();
    } else {
      res = await env.DB.prepare('SELECT * FROM task_submissions ORDER BY created_at DESC').all();
    }
    return new Response(JSON.stringify({ success: true, submissions: res.results || [] }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const auth = await verifyFirebaseToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 401, headers: CORS });
    }
    const worker: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!worker || worker.payment_status !== 'paid') {
      return new Response(
        JSON.stringify({ success: false, error: 'Activation payment is required before submitting task proof.' }),
        { status: 403, headers: CORS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const taskId = String(body.task_id || body.taskId || '').trim();
    const proofUrl = String(body.proof_url || body.proofUrl || '').trim();
    const proofLink = String(body.proof_link || body.proofLink || '').trim();
    const proofText = String(body.proof_text || body.proofText || '').trim();

    if (!taskId || (!proofUrl && !proofLink)) {
      return new Response(JSON.stringify({ success: false, error: 'Task ID and proof image or link required.' }), { status: 400, headers: CORS });
    }

    const task: any = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
    if (!task) {
      return new Response(JSON.stringify({ success: false, error: 'Task not found.' }), { status: 404, headers: CORS });
    }

    const subId = 'sub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const nowIso = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO task_applications (id, task_id, earner_id, status, created_at) VALUES (?, ?, ?, 'submitted', ?)`)
        .bind('app_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), taskId, auth.user.uid, nowIso),
      env.DB.prepare(`UPDATE task_applications SET status = 'submitted' WHERE task_id = ? AND earner_id = ?`)
        .bind(taskId, auth.user.uid),
      env.DB.prepare(
        `INSERT INTO task_submissions (id, task_id, task_title, employer_id, earner_id, earner_name, earner_email, proof_url, proof_link, proof_text, reward, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(
        subId,
        taskId,
        task.title,
        task.employer_id,
        auth.user.uid,
        worker?.name || 'Worker',
        worker?.email || auth.user.email || '',
        proofUrl || null,
        proofLink || null,
        proofText || '',
        Number(task.reward || 0),
        nowIso
      ),
    ]);

    const submission = await env.DB.prepare('SELECT * FROM task_submissions WHERE id = ?').bind(subId).first();
    return new Response(JSON.stringify({ success: true, submission }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
