// functions/api/initialize-payment.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, amount } = await request.json();

  // Create a unique reference BEFORE user pays
  const reference = `CDS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Save as pending first
  await env.DB.prepare(
    `INSERT INTO deposits (user_id, email, amount, reference, status, created_at) VALUES ((SELECT id FROM users WHERE email = ?), ?, ?, ?, 'pending', datetime('now'))`
  ).bind(email, email, amount, reference).run();

  // Ask Paystack to start payment
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amount * 100, // Paystack wants kobo
      reference,
      callback_url: `https://cdsuretasktasker.pages.dev/wallet?reference=${reference}`,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), { status: 200 });
}
