import type { APIRoute } from 'astro';

export const prerender = false;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env: any = (locals as any)?.runtime?.env || {};
    const body: any = await request.json().catch(() => ({}));
    const { id, user_id, reason } = body;

    if (!id && !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing payment id or user_id' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const adminNote = reason || 'Payment proof rejected.';

    if (env.DB) {
      if (id) {
        await env.DB.prepare(
          `UPDATE activation_payments SET status = 'rejected', admin_note = ? WHERE id = ?`
        ).bind(adminNote, id).run().catch(() => {});
        await env.DB.prepare(
          `UPDATE payment_proofs SET status = 'rejected', admin_note = ? WHERE id = ?`
        ).bind(adminNote, id).run().catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment rejected.',
        status: 'rejected',
        reason: adminNote,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error rejecting payment' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
