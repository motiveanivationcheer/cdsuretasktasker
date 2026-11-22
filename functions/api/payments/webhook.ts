import { handlePaystackWebhook } from '../../../src/server/paymentProcessor';

export const onRequestPost = async (context: { request: Request; env: any }) => {
  return handlePaystackWebhook(context.request, context.env);
};
