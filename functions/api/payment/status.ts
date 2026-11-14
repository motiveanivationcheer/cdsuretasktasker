// Cloudflare Pages Function: GET /api/payment/status
// Retrieves the payment and activation status for the authenticated user or query param userId
import { verifyFirebaseToken } from '../_auth';

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
    const url = new URL(request.url);
    let targetUserId = url.searchParams.get('userId') || url.searchParams.get('user_id');

    // If no userId query param, attempt to decode token from auth header
    if (!targetUserId) {
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
      const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);
      if (authResult.success && authResult.user) {
        targetUserId = authResult.user.uid;
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User ID or authorization token required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: true, is_activated: 0, payment_status: 'not_submitted' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const user: any = await env.DB.prepare(
      'SELECT id, role, is_activated, activation_paid_at, balance FROM users WHERE id = ?'
    ).bind(targetUserId).first();

    const payment: any = await env.DB.prepare(
      'SELECT id, amount, proof_image, status, admin_note, reference, created_at FROM activation_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(targetUserId).first();

    const proof: any = await env.DB.prepare(
      'SELECT id, amount, file_url, status, admin_note, reference, created_at FROM payment_proofs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(targetUserId).first();

    const isActivated = (user && (user.role === 'employer' || user.is_activated === 1 || user.is_activated === true)) || 
                        (payment && payment.status === 'approved') ||
                        (proof && proof.status === 'approved');

    const paymentStatus = payment ? payment.status : (proof ? proof.status : 'not_submitted');
    const proofUrl = payment?.proof_image || proof?.file_url || null;

    return new Response(
      JSON.stringify({
        success: true,
        userId: targetUserId,
        is_activated: isActivated ? 1 : 0,
        role: user ? user.role : 'earner',
        balance: user ? user.balance : 0,
        activation_paid_at: user?.activation_paid_at || (paymentStatus === 'approved' ? (payment?.created_at || proof?.created_at) : null),
        payment_status: paymentStatus,
        proof_image: proofUrl,
        reference: payment?.reference || proof?.reference || null,
        admin_note: payment?.admin_note || proof?.admin_note || null,
        created_at: payment?.created_at || proof?.created_at || null,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Status check failed' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
