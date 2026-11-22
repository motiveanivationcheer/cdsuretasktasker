import { verifyFirebaseToken } from '../_auth';

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

    const { results: tasks } = employerId
      ? await env.DB.prepare('SELECT * FROM tasks WHERE employer_id = ? ORDER BY created_at DESC').bind(employerId).all()
      : await env.DB.prepare("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC").all();

    let applications: any[] = [];
    if (earnerId) {
      const appRes = await env.DB.prepare(
        `SELECT a.*, t.title, t.category, t.reward, t.employer_name, t.deadline, t.description, t.proof_required,
                s.id as submission_id, s.proof_url, s.proof_link, s.proof_text, s.status as submission_status, s.created_at as submitted_at
         FROM task_applications a
         JOIN tasks t ON a.task_id = t.id
         LEFT JOIN task_submissions s ON s.task_id = a.task_id AND s.earner_id = a.earner_id
         WHERE a.earner_id = ?
         ORDER BY a.created_at DESC`
      ).bind(earnerId).all();
      applications = appRes.results || [];
    }

    return new Response(JSON.stringify({ success: true, tasks: tasks || [], applications }), { headers: CORS });
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
    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!user || user.payment_status !== 'paid' || user.role !== 'employer') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Activation payment is required before you can post tasks.',
        }),
        { status: 403, headers: CORS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const title = String(body.title || '').trim();
    const description = String(body.description || body.instructions || '').trim();
    const category = String(body.category || 'Social Media').trim();
    const reward = Number(body.reward || body.price || 0);
    const workersNeeded = Math.max(1, parseInt(body.workersNeeded || body.workers_needed || '10', 10) || 10);
    const deadline = String(body.deadline || '3 days').trim();
    const proofRequired = String(body.proofRequired || body.proof_required || 'Screenshot proof required').trim();
    const campaignImageUrl = String(body.campaign_image_url || body.campaignImageUrl || '').trim() || null;

    if (!title || !reward || isNaN(reward) || reward <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Title and valid reward are required.' }), { status: 400, headers: CORS });
    }

    const taskId = 'tsk_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO tasks (id, employer_id, employer_name, title, description, category, reward, workers_needed, workers_completed, deadline, proof_required, campaign_image_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?)`
    ).bind(taskId, user.id, user.name || 'Verified Employer', title, description, category, reward, workersNeeded, deadline, proofRequired, campaignImageUrl, nowIso).run();

    const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
    return new Response(JSON.stringify({ success: true, task }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
