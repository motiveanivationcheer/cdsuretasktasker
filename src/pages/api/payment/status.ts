import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || url.searchParams.get('user_id');

  // Cloudflare runtime bindings from Astro locals if available
  const env: any = (locals as any)?.runtime?.env || {};
  let isActivated = 0;
  let paymentStatus = 'not_submitted';

  if (env.DB && userId) {
    try {
      const user = await env.DB.prepare('SELECT is_activated FROM users WHERE id = ?').bind(userId).first();
      const payment = await env.DB.prepare('SELECT status, proof_image, reference, admin_note FROM activation_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first();
      if (user && user.is_activated) isActivated = 1;
      if (payment) paymentStatus = payment.status;
    } catch (_e) {}
  }

  return new Response(
    JSON.stringify({
      success: true,
      userId: userId || 'user',
      is_activated: isActivated,
      payment_status: paymentStatus,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};
