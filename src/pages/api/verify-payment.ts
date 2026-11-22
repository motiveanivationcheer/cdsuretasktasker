import type { APIRoute } from 'astro';
import { handleVerifyPayment, PAYMENT_CORS_HEADERS } from '../../server/paymentProcessor';

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const GET: APIRoute = async ({ request, locals }) => {
  return handleVerifyPayment(request, (locals as any)?.runtime?.env || {});
};

export const POST: APIRoute = async ({ request, locals }) => {
  return handleVerifyPayment(request, (locals as any)?.runtime?.env || {});
};
