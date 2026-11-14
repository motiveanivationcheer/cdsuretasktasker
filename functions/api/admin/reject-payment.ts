// Cloudflare Pages Function: POST /api/admin/reject-payment
// Rejects activation payment proof with an admin note

interface Env {
  DB: any;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const body: any = await request.json().catch(() => ({}));
    const { id, user_id, reason } = body;

    if (!id && !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing payment id or user_id' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const adminNote = reason || 'Payment proof could not be verified. Please check transfer details and re-upload.';

    if (env.DB) {
      if (id) {
        await env.DB.prepare(
          `UPDATE activation_payments
           SET status = 'rejected', admin_note = ?
           WHERE id = ?`
        ).bind(adminNote, id).run();

        await env.DB.prepare(
          `UPDATE payment_proofs
           SET status = 'rejected', admin_note = ?
           WHERE id = ?`
        ).bind(adminNote, id).run().catch(() => {});
      } else if (user_id) {
        await env.DB.prepare(
          `UPDATE activation_payments
           SET status = 'rejected', admin_note = ?
           WHERE user_id = ? AND status = 'pending'`
        ).bind(adminNote, user_id).run();

        await env.DB.prepare(
          `UPDATE payment_proofs
           SET status = 'rejected', admin_note = ?
           WHERE user_id = ? AND status = 'pending'`
        ).bind(adminNote, user_id).run().catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment rejected. User can re-upload valid proof.',
        status: 'rejected',
        reason: adminNote,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Server error rejecting payment' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
