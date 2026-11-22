import { handleVerifyPayment, PAYMENT_CORS_HEADERS } from '../../../src/server/paymentProcessor';

export const onRequestOptions = async () => {
  return new Response(null, { headers: PAYMENT_CORS_HEADERS });
};

export const onRequestGet = async (context: { request: Request; env: any }) => {
  return handleVerifyPayment(context.request, context.env);
};

export const onRequestPost = async (context: { request: Request; env: any }) => {
  return handleVerifyPayment(context.request, context.env);
};
