import type { APIRoute } from 'astro';
import { verifyFirebaseToken } from '../../../functions/api/_auth';

export const prerender = false;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env: any = (locals as any)?.runtime?.env || {};
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);

    if (!authResult.success || !authResult.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
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
       FROM payment_proofs WHERE user_id = ? ORDER BY created_at DESC`
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
