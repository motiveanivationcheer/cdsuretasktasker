// functions/api/paystack-webhook.js
import crypto from 'crypto';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const bodyText = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(bodyText).digest('hex');
    if (hash !== signature) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }
    const event = JSON.parse(bodyText);
    if (event.event !== 'charge.success') {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }
    const data = event.data;
    const reference = data.reference;
    const amount = data.amount / 100;
    const email = data.customer.email;

    const existing = await env.DB.prepare(`SELECT id, status FROM deposits WHERE reference = ?`).bind(reference).first();
    if (existing && existing.status === 'approved') {
      return new Response(JSON.stringify({ message: 'Already credited' }), { status: 200 });
    }
    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

    await env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`).bind(amount, user.id).run();
    await env.DB.prepare(`UPDATE deposits SET status = 'approved' WHERE reference = ?`).bind(reference).run();
    await env.DB.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at) VALUES (?, 'deposit', ?, ?, 'approved', datetime('now'))`).bind(user.id, amount, reference).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
