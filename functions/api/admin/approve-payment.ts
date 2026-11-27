
// Cloudflare Pages Function: POST /api/admin/approve-payment
// Approves activation payments, payment proofs, AND deposits (wallet top-up)

import { requireAdmin } from "../_auth";

interface Env {
  DB: any;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;
  try {
    const adminCheck = await requireAdmin(request, env);
    if (!adminCheck.ok) {
      return new Response(JSON.stringify({ success: false, error: 'adminCheck failed' }), { status: adminCheck.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const body: any = await request.json().catch(() => ({}));
    const { id, user_id, amount } = body;

    if (!id && !user_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing payment id or user_id' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const nowIso = new Date().toISOString();
    let targetUserId = user_id;
    let paymentAmount = amount;

    // 1. Try DEPOSITS table first (wallet top-up)
    if (id) {
      const dep: any = await env.DB.prepare("SELECT id, user_id, amount, status FROM deposits WHERE id = ?").bind(id).first().catch(() => null);
      if (dep) {
        targetUserId = dep.user_id;
        paymentAmount = dep.amount;
        await env.DB.prepare("UPDATE deposits SET status = 'approved', updated_at = ? WHERE id = ?").bind(nowIso, id).run().catch(() => null);
        // Also try 'paid' status if your admin UI checks for that
        await env.DB.prepare("UPDATE deposits SET status = 'approved' WHERE id = ?").bind(id).run().catch(() => null);

        // Credit wallet
        if (targetUserId && paymentAmount) {
          await env.DB.prepare("UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?").bind(paymentAmount, targetUserId).run().catch(() => null);
          await env.DB.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, 'credit', ?, 'Deposit approved by admin', ?)").bind(targetUserId, paymentAmount, nowIso).run().catch(() => null);
        }
        return new Response(JSON.stringify({ success: true, message: 'Deposit approved and wallet credited' }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    // 2. Try activation_payments (old logic)
    if (id) {
      const act: any = await env.DB.prepare("SELECT user_id, amount FROM activation_payments WHERE id = ?").bind(id).first().catch(() => null);
      if (act) {
        targetUserId = act.user_id;
        paymentAmount = act.amount;
        await env.DB.prepare("UPDATE activation_payments SET status = 'approved', admin_note = 'Approved by Administrator', updated_at = ? WHERE id = ?").bind(nowIso, id).run().catch(() => null);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    // 3. Try payment_proofs
    if (id) {
      const proof: any = await env.DB.prepare("SELECT user_id, amount FROM payment_proofs WHERE id = ?").bind(id).first().catch(() => null);
      if (proof) {
        await env.DB.prepare("UPDATE payment_proofs SET status = 'approved', admin_note = 'Approved by Administrator', updated_at = ? WHERE id = ?").bind(nowIso, id).run().catch(() => null);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Payment not found in deposits, activation_payments or payment_proofs' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message || 'Server error' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
}
