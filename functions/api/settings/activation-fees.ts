import { readD1FeeSettings } from '../../../src/server/paymentProcessor';

interface Env {
  DB: any;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestGet = async (context: { env: Env }) => {
  try {
    const fees = await readD1FeeSettings(context.env?.DB);
    return new Response(JSON.stringify({ success: true, ...fees }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
