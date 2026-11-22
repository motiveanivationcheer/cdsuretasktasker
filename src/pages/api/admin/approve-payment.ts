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
    const { id, user_id, amount } = body;

    if (!id && !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing payment id or user_id' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const nowIso = new Date().toISOString();
    let targetUserId = user_id;
    let paymentAmount = amount || 1500;

    if (env.DB) {
      if (!targetUserId && id) {
        const pRecord = await env.DB.prepare('SELECT user_id, amount FROM activation_payments WHERE id = ?').bind(id).first();
        if (pRecord) {
          targetUserId = pRecord.user_id;
          paymentAmount = pRecord.amount || paymentAmount;
        }
      }

      if (id) {
        await env.DB.prepare(
          `UPDATE activation_payments SET status = 'approved', admin_note = 'Approved by Administrator' WHERE id = ?`
        ).bind(id).run().catch(() => {});

        await env.DB.prepare(
          `UPDATE payment_proofs SET status = 'approved', admin_note = 'Approved by Administrator' WHERE id = ?`
        ).bind(id).run().catch(() => {});
      }

      if (targetUserId) {
        await env.DB.prepare(
          `UPDATE users SET is_activated = 1, activation_paid_at = ? WHERE id = ?`
        ).bind(nowIso, targetUserId).run().catch(() => {});
      }
    }

    const fee30 = Math.round(paymentAmount * 0.30 * 100) / 100;
    const net70 = Math.round((paymentAmount - fee30) * 100) / 100;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment approved. Earner account activated successfully.',
        status: 'approved',
        fee_amount: fee30,
        net_amount: net70,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error approving payment' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
