import crypto from 'crypto';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
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
    const channel = data.channel || 'card';

    // 1. Find user, or create if not found
    let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!user) {
      const newId = 'user-' + crypto.randomUUID().slice(0, 8);
      await env.DB.prepare("INSERT INTO users (id, email, activation_amount) VALUES (?, ?, ?)")
        .bind(newId, email, amount).run();
      user = { id: newId };
    }

    // 2. Check if deposit already exists
    const existing = await env.DB.prepare("SELECT id, status FROM deposits WHERE reference = ?").bind(reference).first();

    if (existing) {
      // Update it - fill user_id + channel automatically
      await env.DB.prepare(
        "UPDATE deposits SET status = 'approved', user_id = ?, email = ?, amount = ?, channel = ? WHERE reference = ?"
      ).bind(user.id, email, amount, channel, reference).run();
    } else {
      // Create it - with everything filled
      await env.DB.prepare(
        "INSERT INTO deposits (user_id, email, amount, reference, channel, status, created_at) VALUES (?, ?, ?, ?, ?, 'approved', datetime('now'))"
      ).bind(user.id, email, amount, reference, channel).run();
    }

    // 3. Credit wallet
    await env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, activation_amount = ? WHERE id = ?")
      .bind(amount, amount, user.id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
