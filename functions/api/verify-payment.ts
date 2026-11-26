
export async function onRequest(context: any) {
  const env = context.env;
  const url = new URL(context.request.url);
  const reference = url.searchParams.get('reference');

  if (!reference) {
    return new Response(JSON.stringify({ success: false, message: 'No reference' }), { status: 400 });
  }

  try {
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const result: any = await verifyRes.json();
    if (!result.status || result.data.status !== 'success') {
      return new Response(JSON.stringify({ success: false, message: 'Paystack says not successful' }), { status: 400 });
    }

    const amount = result.data.amount / 100;
    const email = result.data.customer.email.toLowerCase().trim();

    const existing: any = await env.DB.prepare(`SELECT id, status FROM deposits WHERE reference = ?`).bind(reference).first();
    if (existing && existing.status === 'approved') {
      return new Response(JSON.stringify({ success: true, message: 'Already credited', amount }), { status: 200 });
    }

    let user: any = await env.DB.prepare(`SELECT id FROM users WHERE LOWER(email) = ?`).bind(email).first();
    if (!user) {
      const create: any = await env.DB.prepare(`INSERT INTO users (email, wallet_balance, created_at) VALUES (?, 0, datetime('now'))`).bind(email).run();
      user = { id: create.meta.last_row_id };
    }

    await env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`).bind(amount, user.id).run();

    if (existing) {
      await env.DB.prepare(`UPDATE deposits SET status = 'approved' WHERE reference = ?`).bind(reference).run();
    } else {
      await env.DB.prepare(`INSERT INTO deposits (user_id, amount, reference, status, created_at) VALUES (?, ?, ?, 'approved', datetime('now'))`).bind(user.id, amount, reference).run();
    }

    return new Response(JSON.stringify({ success: true, amount }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, message: 'Server error: ' + e.message }), { status: 500 });
  }
}
