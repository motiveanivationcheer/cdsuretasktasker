// functions/api/verify-payment.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const reference = url.searchParams.get('reference');

  if (!reference) {
    return new Response(JSON.stringify({ error: 'No reference' }), { status: 400 });
  }

  // 1. Ask Paystack: Did this payment really succeed?
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    },
  });

  const result = await verifyRes.json();

  if (!result.status || result.data.status !== 'success') {
    return new Response(JSON.stringify({ success: false, message: 'Payment not successful' }), { status: 400 });
  }

  const amount = result.data.amount / 100;
  const email = result.data.customer.email;

  // 2. Stop double credit
  const existing = await env.DB.prepare(`SELECT id, status FROM deposits WHERE reference = ?`).bind(reference).first();
  if (existing && existing.status === 'approved') {
    return new Response(JSON.stringify({ success: true, message: 'Already credited', amount }), { status: 200 });
  }

  // 3. Credit wallet
  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

  await env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`).bind(amount, user.id).run();
  await env.DB.prepare(`UPDATE deposits SET status = 'approved' WHERE reference = ?`).bind(reference).run();
  await env.DB.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at) VALUES (?, 'deposit', ?, ?, 'approved', datetime('now'))`).bind(user.id, amount, reference).run();

  return new Response(JSON.stringify({ success: true, amount }), { status: 200 });
}
