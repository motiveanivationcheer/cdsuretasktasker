import { handleDeliverMarketplaceProduct } from '../../../src/server/marketplaceHandler';
import { PAYMENT_CORS_HEADERS } from '../../../src/server/paymentProcessor';

export const onRequestOptions = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const onRequestGet = async (context: { request: Request; env: any }) => {
  return handleDeliverMarketplaceProduct(context.request, context.env);
};
