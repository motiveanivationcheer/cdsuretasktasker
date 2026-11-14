// Cloudflare Pages Function: GET /api/my-proofs
// Lists all payment proofs uploaded by the authenticated user

import { verifyFirebaseToken } from './_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;

    // Verify user identity
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);

    if (!authResult.success || !authResult.user) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error || 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: true, proofs: [] }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { results } = await env.DB.prepare(
      `SELECT id, reference, amount, file_url, file_type, file_size, sender_name, sender_number, status, admin_note, created_at
       FROM payment_proofs
       WHERE user_id = ?
       ORDER BY created_at DESC`
    ).bind(authResult.user.uid).all();

    return new Response(
      JSON.stringify({ success: true, proofs: results || [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Failed to fetch proofs' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
