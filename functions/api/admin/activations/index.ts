// Cloudflare Pages Function: GET /api/admin/activations
// Returns Paystack transactions and activation records with user details and filters

interface Env {
  DB: any;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const roleFilter = url.searchParams.get('role');
    const search = url.searchParams.get('search');

    if (!env.DB) {
      return new Response(
        JSON.stringify({ success: true, activations: [], transactions: [] }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Query master transactions table
    const txQuery = `
      SELECT t.id, t.reference, t.user_id, t.email, t.amount, t.fee_amount, t.net_amount, t.currency,
             t.payment_gateway, t.status, t.transaction_type, t.gateway_response, t.created_at, t.verified_at,
             u.name as user_name, u.role as user_role, u.is_activated
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `;

    const txResult = await env.DB.prepare(txQuery).all().catch(() => ({ results: [] }));
    let records = txResult.results || [];

    // Fallback: also merge any legacy activation_payments that don't have matching transactions
    const actQuery = `
      SELECT p.id, p.user_id, p.email, p.amount, 
             p.proof_image, p.status, p.admin_note, p.created_at,
             p.reference, p.sender_name, p.sender_number,
             COALESCE(p.method, 'Paystack') as payment_gateway,
             'activation' as transaction_type,
             u.name as user_name, u.role as user_role, u.is_activated
      FROM activation_payments p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;
    const actResult = await env.DB.prepare(actQuery).all().catch(() => ({ results: [] }));
    const actRecords = actResult.results || [];

    // Combine unique references
    const seenRefs = new Set(records.map((r: any) => r.reference));
    for (const act of actRecords) {
      if (act.reference && !seenRefs.has(act.reference)) {
        seenRefs.add(act.reference);
        records.push(act);
      }
    }

    // Filters
    if (statusFilter && statusFilter !== 'all') {
      records = records.filter((r: any) => r.status?.toLowerCase() === statusFilter.toLowerCase());
    }
    if (roleFilter && roleFilter !== 'all') {
      records = records.filter((r: any) => (r.user_role || 'earner').toLowerCase() === roleFilter.toLowerCase());
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter((r: any) =>
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.reference && r.reference.toLowerCase().includes(q)) ||
        (r.user_name && r.user_name.toLowerCase().includes(q)) ||
        (r.user_id && r.user_id.toLowerCase().includes(q))
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        activations: records,
        transactions: records,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Server error loading activations' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
