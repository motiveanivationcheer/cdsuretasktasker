// Cloudflare Pages Function: GET /api/wallet/:userId
interface Env {
  DB: any;
}

export const onRequestGet = async (context: { params: { userId: string }; env: Env }) => {
  try {
    const { params, env } = context;
    const userId = params.userId;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    const { results: transactions } = await env.DB.prepare(
      'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    const { results: deposits } = await env.DB.prepare(
      'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    const { results: withdrawals } = await env.DB.prepare(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();

    return new Response(
      JSON.stringify({
        success: true,
        wallet: {
          user_id: userId,
          balance: Number(user?.balance || 0),
          total_deposited: Number(user?.total_deposited || 0),
          total_withdrawn: Number(user?.total_withdrawn || 0),
          total_earned: Number(user?.total_earned || 0),
          total_fees_paid: Number(user?.total_fees_paid || 0),
        },
        transactions: transactions || [],
        deposits: deposits || [],
        withdrawals: withdrawals || [],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
