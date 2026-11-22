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
    const proofUrl = String(body.proof_url || '').trim();
    if (!proofUrl || !proofUrl.startsWith('http')) {
      return new Response(JSON.stringify({ success: false, error: 'Valid Cloudinary proof URL required.' }), { status: 400, headers: CORS });
    }
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE users
       SET activation_proof_url = ?,
           requested_role = 'employer',
           employer_status = CASE WHEN employer_approved = 1 THEN 'approved' ELSE 'pending' END,
           employer_rejection_reason = NULL,
           updated_at = ?
       WHERE id = ?`
    ).bind(proofUrl, nowIso, auth.user.uid).run();

    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
