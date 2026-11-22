import { verifyFirebaseToken } from '../_auth';

interface Env {
  DB?: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: CORS });
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const auth = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error || 'Authentication required.' }),
        { status: 401, headers: CORS }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const requestedRole =
      body.requested_role === 'employer' ? 'employer' : body.requested_role === 'earner' ? 'earner' : '';
    if (!requestedRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Choose earner or employer role.' }),
        { status: 400, headers: CORS }
      );
    }

    if (!env?.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Cloudflare D1 binding (DB) is missing in Pages Settings > Functions > D1 database bindings.',
        }),
        { status: 503, headers: CORS }
      );
    }

    const nowIso = new Date().toISOString();
    const existing: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO users (id, name, email, role, requested_role, payment_status, status, is_activated, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, ?, ?)`
      )
        .bind(
          auth.user.uid,
          auth.user.name || auth.user.email?.split('@')[0] || 'Member',
          auth.user.email,
          requestedRole,
          nowIso,
          nowIso
        )
        .run();
    } else if (existing.payment_status !== 'paid') {
      await env.DB.prepare(
        `UPDATE users SET requested_role = ?, role = 'pending', status = 'pending', is_activated = 0, updated_at = ? WHERE id = ?`
      )
        .bind(requestedRole, nowIso, auth.user.uid)
        .run();
    }

    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    return new Response(JSON.stringify({ success: true, user: updated }), { headers: CORS });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to update role selection.' }),
      { status: 500, headers: CORS }
    );
  }
};
