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
    const avatarUrl = String(body.avatar_url || '').trim();
    if (!avatarUrl || !avatarUrl.startsWith('http')) {
      return new Response(JSON.stringify({ success: false, error: 'Valid photo URL required.' }), { status: 400, headers: CORS });
    }
    await env.DB.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
      .bind(avatarUrl, new Date().toISOString(), auth.user.uid)
      .run();
    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
