// Cloudflare Pages Function: POST /api/users/sync
import { verifyFirebaseToken } from '../_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization');
    let authUser: any = null;
    if (authHeader) {
      const auth = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
      if (!auth.success || !auth.user) {
        return new Response(JSON.stringify({ success: false, error: auth.error || 'Unauthorized' }), {
          status: 401,
          headers: CORS,
        });
      }
      authUser = auth.user;
    }

    const body: any = await request.json().catch(() => ({}));
    const uid = authUser?.uid || body.id || body.uid;
    if (!uid) {
      return new Response(JSON.stringify({ success: false, error: 'Missing user ID' }), {
        status: 400,
        headers: CORS,
      });
    }

    const email = String(authUser?.email || body.email || '').trim().toLowerCase();
    const incomingName = String(body.name || body.displayName || '').trim();
    const incomingPhone = String(body.phone || '').trim();
    const reqRoleInput =
      body.requested_role === 'employer' || body.role === 'employer'
        ? 'employer'
        : body.requested_role === 'earner' || body.role === 'earner'
        ? 'earner'
        : '';
    const nowIso = new Date().toISOString();

    const existing: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();

    if (existing) {
      const nextName = incomingName && incomingName !== 'Member' ? incomingName : (existing.name || incomingName || 'Member');
      const nextPhone = incomingPhone || existing.phone || '';
      const isPaid = existing.payment_status === 'paid';
      let nextRole = isPaid ? (existing.role === 'employer' ? 'employer' : 'earner') : 'pending';
      let nextRequestedRole = existing.requested_role || '';

      if (!isPaid && reqRoleInput) {
        nextRequestedRole = reqRoleInput;
      } else if (isPaid && body.explicitSwitch === true && (body.role === 'earner' || body.role === 'employer')) {
        if (body.role === 'earner') nextRole = 'earner';
        else if (existing.employer_approved === 1 || existing.requested_role === 'employer') nextRole = 'employer';
      }

      await env.DB.prepare(
        `UPDATE users
         SET name = ?, email = COALESCE(NULLIF(?, ''), email), phone = ?, role = ?, requested_role = ?,
             is_activated = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        nextName,
        email,
        nextPhone,
        nextRole,
        nextRequestedRole,
        isPaid ? 1 : 0,
        isPaid ? 'active' : 'pending',
        nowIso,
        uid
      ).run();

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
      return new Response(JSON.stringify({ success: true, user: updated, created: false }), { headers: CORS });
    }

    await env.DB.prepare(
      `INSERT INTO users (
        id, name, email, phone, role, requested_role, payment_status, status, employer_approved, employer_status,
        avatar_url, balance, total_deposited, total_withdrawn, total_earned, total_fees_paid,
        is_activated, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, 'none', ?, 0, 0, 0, 0, 0, 0, ?, ?)`
    ).bind(
      uid,
      incomingName || 'Member',
      email || `${uid}@user.cdsure`,
      incomingPhone,
      reqRoleInput,
      body.avatar_url || null,
      nowIso,
      nowIso
    ).run();

    const created = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
    return new Response(JSON.stringify({ success: true, user: created, created: true }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: CORS,
    });
  }
};
