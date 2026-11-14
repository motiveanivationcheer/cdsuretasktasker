import type { APIRoute } from 'astro';
import { handleInitializePayment, PAYMENT_CORS_HEADERS } from '../../../server/paymentProcessor';

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env: any = (locals as any)?.runtime?.env || {};
  return handleInitializePayment(request, env);
};
