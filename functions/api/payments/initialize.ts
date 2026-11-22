import { handleInitializePayment, PAYMENT_CORS_HEADERS } from '../../../src/server/paymentProcessor';

export const onRequestOptions = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const onRequestPost = async (context: { request: Request; env: any }) => {
  return handleInitializePayment(context.request, context.env);
};
