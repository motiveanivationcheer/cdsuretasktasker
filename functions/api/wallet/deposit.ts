import { verifyFirebaseToken } from '../_auth';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const auth = await verifyFirebaseToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 401, headers: CORS });
    }
    const body: any = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const proofUrl = String(body.proof_url || body.proofUrl || '').trim();
    const paymentMethod = String(body.payment_method || 'bank_transfer').trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: 'Valid deposit amount is required.' }), { status: 400, headers: CORS });
    }
    if (!proofUrl || !proofUrl.startsWith('http')) {
      return new Response(JSON.stringify({ success: false, error: 'Payment proof screenshot URL is required.' }), { status: 400, headers: CORS });
    }

    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.uid).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'User not found.' }), { status: 404, headers: CORS });
    }

    const depositId = 'dep_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const ref = `DEP-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO deposits (id, user_id, user_email, user_name, amount, proof_url, reference, payment_method, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
    ).bind(depositId, user.id, user.email, user.name || 'Member', amount, proofUrl, ref, paymentMethod, nowIso).run();

    await env.DB.prepare(
      `INSERT INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 'deposit', ?, 'Pending', ?)`
    ).bind('wtx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), user.id, ref, amount, amount, `Deposit via ${paymentMethod} (Pending Admin Confirmation)`, nowIso).run();

    const deposit = await env.DB.prepare('SELECT * FROM deposits WHERE id = ?').bind(depositId).first();
    return new Response(JSON.stringify({ success: true, deposit, balance: Number(user.balance || 0) }), { headers: CORS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
