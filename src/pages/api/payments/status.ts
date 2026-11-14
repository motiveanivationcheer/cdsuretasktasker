import type { APIRoute } from 'astro';
import { verifyFirebaseToken } from '../../../../functions/api/_auth';

export const prerender = false;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env: any = (locals as any)?.runtime?.env || {};
    const url = new URL(request.url);
    const reference = url.searchParams.get('reference');
    let userId = url.searchParams.get('userId') || url.searchParams.get('user_id');

    if (!userId && !reference) {
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
      const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);
      if (authResult.success && authResult.user) {
        userId = authResult.user.uid;
      }
    }

    if (!userId && !reference) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reference or User ID required.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (env.DB) {
      if (reference) {
        const tx = await env.DB.prepare(
          'SELECT * FROM transactions WHERE reference = ?'
        ).bind(reference).first();

        if (tx) {
          return new Response(
            JSON.stringify({ success: true, transaction: tx, status: tx.status }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (userId) {
        const user = await env.DB.prepare(
          'SELECT id, role, is_activated, balance, activation_paid_at FROM users WHERE id = ?'
        ).bind(userId).first();

        const latestTx = await env.DB.prepare(
          'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(userId).first();

        const latestAct = await env.DB.prepare(
          'SELECT * FROM activation_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(userId).first();

        const isActivated = (user && (user.role === 'employer' || user.is_activated === 1)) || (latestAct && latestAct.status === 'success') || (latestTx && latestTx.transaction_type === 'activation' && latestTx.status === 'success');

        return new Response(
          JSON.stringify({
            success: true,
            userId,
            is_activated: isActivated ? 1 : 0,
            role: user ? user.role : 'earner',
            balance: user ? user.balance : 0,
            payment_status: latestTx ? latestTx.status : (latestAct ? latestAct.status : 'not_submitted'),
            latest_transaction: latestTx,
            latest_activation: latestAct,
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, status: 'unknown' }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error fetching status' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
