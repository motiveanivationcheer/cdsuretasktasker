import type { APIRoute } from 'astro';
import { handlePaystackWebhook } from '../../../server/paymentProcessor';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env: any = (locals as any)?.runtime?.env || {};
  return handlePaystackWebhook(request, env);
};
