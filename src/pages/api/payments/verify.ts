import type { APIRoute } from 'astro';
import { handleVerifyPayment, PAYMENT_CORS_HEADERS } from '../../../server/paymentProcessor';

export const prerender = false;

function resolveServerEnv(locals: any): Record<string, any> {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  return {
    ...runtimeEnv,
    PAYSTACK_SECRET_KEY:
      runtimeEnv.PAYSTACK_SECRET_KEY || procEnv.PAYSTACK_SECRET_KEY || import.meta.env?.PAYSTACK_SECRET_KEY || '',
    FIREBASE_PROJECT_ID:
      runtimeEnv.FIREBASE_PROJECT_ID || procEnv.FIREBASE_PROJECT_ID || import.meta.env?.FIREBASE_PROJECT_ID || 'cdsure-c360f',
  };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: PAYMENT_CORS_HEADERS });
};

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = resolveServerEnv(locals);
    return await handleVerifyPayment(request, env);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Verification failed.' }),
      { status: 500, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = resolveServerEnv(locals);
    return await handleVerifyPayment(request, env);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Verification failed.' }),
      { status: 500, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
