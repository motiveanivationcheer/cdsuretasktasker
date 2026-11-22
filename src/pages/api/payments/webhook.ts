import type { APIRoute } from 'astro';
import { handlePaystackWebhook, PAYMENT_CORS_HEADERS } from '../../../server/paymentProcessor';

export const prerender = false;

function resolveServerEnv(locals: any): Record<string, any> {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  return {
    ...runtimeEnv,
    PAYSTACK_SECRET_KEY:
      runtimeEnv.PAYSTACK_SECRET_KEY || procEnv.PAYSTACK_SECRET_KEY || import.meta.env?.PAYSTACK_SECRET_KEY || '',
    PAYSTACK_WEBHOOK_SECRET:
      runtimeEnv.PAYSTACK_WEBHOOK_SECRET || procEnv.PAYSTACK_WEBHOOK_SECRET || import.meta.env?.PAYSTACK_WEBHOOK_SECRET || '',
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = resolveServerEnv(locals);
    return await handlePaystackWebhook(request, env);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Webhook processing error.' }),
      { status: 500, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
