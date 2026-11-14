// Cloudflare Pages Function: POST /api/admin/approve-payment
// Approves activation payment and immediately activates the user account

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
      // Find userId if only id was provided
      if (!targetUserId && id) {
        const pRecord = await env.DB.prepare(
          'SELECT user_id, amount FROM activation_payments WHERE id = ?'
        ).bind(id).first();
        if (pRecord) {
          targetUserId = pRecord.user_id;
          paymentAmount = pRecord.amount || paymentAmount;
        } else {
          const proofRecord = await env.DB.prepare(
            'SELECT user_id, amount FROM payment_proofs WHERE id = ?'
          ).bind(id).first();
          if (proofRecord) {
            targetUserId = proofRecord.user_id;
            paymentAmount = proofRecord.amount || paymentAmount;
          }
        }
      }

      // Update activation_payments
      if (id) {
        await env.DB.prepare(
          `UPDATE activation_payments
           SET status = 'approved', admin_note = 'Approved by Administrator', updated_at = ?
           WHERE id = ?`
        ).bind(nowIso, id).run().catch(() => {
          return env.DB.prepare(
            `UPDATE activation_payments
             SET status = 'approved', admin_note = 'Approved by Administrator'
             WHERE id = ?`
          ).bind(id).run();
        });

        await env.DB.prepare(
          `UPDATE payment_proofs
           SET status = 'approved', admin_note = 'Approved by Administrator'
           WHERE id = ?`
        ).bind(id).run().catch(() => {});
      }

      // Activate User Account
      if (targetUserId) {
        await env.DB.prepare(
          `UPDATE users
           SET is_activated = 1, activation_paid_at = ?
           WHERE id = ?`
        ).bind(nowIso, targetUserId).run();

        // Also update any pending activation records for this user
        await env.DB.prepare(
          `UPDATE activation_payments
           SET status = 'approved', admin_note = 'Approved by Administrator'
           WHERE user_id = ? AND status = 'pending'`
        ).bind(targetUserId).run().catch(() => {});

        await env.DB.prepare(
          `UPDATE payment_proofs
           SET status = 'approved', admin_note = 'Approved by Administrator'
           WHERE user_id = ? AND status = 'pending'`
        ).bind(targetUserId).run().catch(() => {});

        // Record 30% CDSure platform fee transaction in transactions table
        const fee30 = Math.round(paymentAmount * 0.30 * 100) / 100;
        const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        await env.DB.prepare(
          `INSERT INTO transactions (id, user_id, type, amount, fee_amount, status, description, created_at)
           VALUES (?, ?, 'activation_fee', ?, ?, 'completed', 'CDSure 30% Activation Platform Fee', ?)`
        ).bind(txId, targetUserId, paymentAmount, fee30, nowIso).run().catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment approved successfully. Earner account is now ACTIVATED.',
        userId: targetUserId,
        status: 'approved',
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Server error approving payment' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
