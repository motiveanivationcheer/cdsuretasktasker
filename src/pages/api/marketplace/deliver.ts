import type { APIRoute } from 'astro';
import { handleDeliverMarketplaceProduct } from '../../../server/marketplaceHandler';
import { PAYMENT_CORS_HEADERS } from '../../../server/paymentProcessor';

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const GET: APIRoute = async ({ request, locals }) => {
  const env: any = (locals as any)?.runtime?.env || {};
  return handleDeliverMarketplaceProduct(request, env);
};
