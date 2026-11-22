import { requireAdmin } from '../_auth';
import { readD1FeeSettings } from '../../../src/server/paymentProcessor';

interface Env {
  DB: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const admin = await requireAdmin(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!admin.success || !admin.user) {
      return new Response(JSON.stringify({ success: false, error: admin.error }), { status: admin.status, headers: CORS });
    }

    const fees = await readD1FeeSettings(env.DB);

    const { results: users } = await env.DB.prepare(
      `SELECT id, name, email, phone, role, requested_role, payment_status, activation_reference,
              activation_amount, activation_paid_at, status, balance, created_at
       FROM users
       ORDER BY created_at DESC`
    ).all();

    const { results: deposits } = await env.DB.prepare(
      `SELECT d.*, u.phone as user_phone
       FROM deposits d
       LEFT JOIN users u ON d.user_id = u.id
       ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END, d.created_at DESC`
    ).all();

    const { results: withdrawals } = await env.DB.prepare(
      `SELECT w.*, u.balance as current_user_balance, u.phone as user_phone
       FROM withdrawals w
       LEFT JOIN users u ON w.user_id = u.id
       ORDER BY CASE WHEN w.status = 'Pending' THEN 0 ELSE 1 END, w.created_at DESC`
    ).all();

    const userList = (users || []).map((u: any) => ({
      ...u,
      expected_fee: u.requested_role === 'employer' ? fees.employer_fee : fees.earner_fee,
    }));
    const depList = deposits || [];
    const wdrList = withdrawals || [];

    return new Response(
      JSON.stringify({
        success: true,
        adminEmail: admin.user.email,
        fees,
        users: userList,
        deposits: depList,
        withdrawals: wdrList,
        counts: {
          paidUsers: userList.filter((u: any) => u.payment_status === 'paid').length,
          unpaidUsers: userList.filter((u: any) => u.payment_status !== 'paid').length,
          pendingDeposits: depList.filter((d: any) => d.status === 'Pending').length,
          pendingWithdrawals: wdrList.filter((w: any) => w.status === 'Pending').length,
        },
      }),
      { headers: CORS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
};
