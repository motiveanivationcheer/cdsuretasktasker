import type { APIRoute } from 'astro';
import { handleInitializePayment, PAYMENT_CORS_HEADERS } from '../../../server/paymentProcessor';

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
    FIREBASE_PROJECT_ID:
      runtimeEnv.FIREBASE_PROJECT_ID || procEnv.FIREBASE_PROJECT_ID || import.meta.env?.FIREBASE_PROJECT_ID || 'cdsure-c360f',
  };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: PAYMENT_CORS_HEADERS });
};

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      endpoint: '/api/payments/initialize',
      method: 'GET',
      error: 'Method GET not allowed. Send POST /api/payments/initialize with JSON payload and Authorization Bearer token.',
    }),
    {
      status: 405,
      headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = resolveServerEnv(locals);
    return await handleInitializePayment(request, env);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Unexpected payment initialization failure.',
      }),
      {
        status: 500,
        headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
};
