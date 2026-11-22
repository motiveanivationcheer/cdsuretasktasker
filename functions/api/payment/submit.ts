// Cloudflare Pages Function: POST /api/payment/submit
// Submits activation payment details with optional uploaded proof
import { verifyFirebaseToken } from '../_auth';

interface Env {
  DB: any;
  PROOF_STORAGE?: any;
  PROOFS?: any;
  FIREBASE_PROJECT_ID?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);

    const contentType = request.headers.get('content-type') || '';
    let userId = authResult.user?.uid || '';
    let email = authResult.user?.email || '';
    let amount = 1500;
    let senderName = '';
    let senderNumber = '';
    let reference = '';
    let proofImageUrl = '';
    let role = 'earner';
    let method = 'Paystack';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      userId = (formData.get('user_id') as string) || (formData.get('userId') as string) || userId;
      email = (formData.get('email') as string) || email;
      senderName = (formData.get('sender_name') as string) || (formData.get('senderName') as string) || '';
      senderNumber = (formData.get('sender_number') as string) || (formData.get('senderNumber') as string) || '';
      reference = (formData.get('reference') as string) || (formData.get('txRef') as string) || '';
      amount = parseFloat(formData.get('amount') as string) || 1500;
      role = (formData.get('role') as string) || 'earner';
      method = (formData.get('method') as string) || 'Paystack';
      proofImageUrl = (formData.get('proof_image') as string) || (formData.get('proofImageUrl') as string) || '';

      const file = (formData.get('proof') as File) || (formData.get('file') as File);
      if (file && file.size > 0) {
        const bucket = env.PROOF_STORAGE || env.PROOFS;
        const ext = file.name.split('.').pop() || 'jpg';
        const objectKey = `proofs/${userId || 'guest'}/${Date.now()}_${crypto.randomUUID().substring(0, 8)}.${ext}`;
        if (bucket) {
          const buffer = await file.arrayBuffer();
          await bucket.put(objectKey, buffer, {
            httpMetadata: { contentType: file.type || 'image/jpeg' },
          });
          proofImageUrl = `/uploads/${objectKey}`;
        }
      }
    } else {
      const body: any = await request.json().catch(() => ({}));
      userId = body.user_id || body.userId || userId;
      email = body.email || email;
      amount = body.amount || 1500;
      senderName = body.sender_name || body.senderName || '';
      senderNumber = body.sender_number || body.senderNumber || '';
      reference = body.reference || body.txRef || '';
      proofImageUrl = body.proof_image || body.proofImageUrl || '';
      role = body.role || 'earner';
      method = body.method || 'Paystack';
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User identification required. Please sign in.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!reference.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction reference / Session ID is required.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const nowIso = new Date().toISOString();
    const paymentId = 'pay_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    if (env.DB) {
      // Check duplicate reference
      const existingRef = await env.DB.prepare(
        'SELECT id FROM payment_proofs WHERE reference = ? AND user_id != ?'
      ).bind(reference.trim(), userId).first();

      if (existingRef) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'This transaction reference has already been used. Please check your bank receipt.',
          }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Record in activation_payments
      const existing = await env.DB.prepare(
        'SELECT id FROM activation_payments WHERE user_id = ?'
      ).bind(userId).first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE activation_payments
           SET amount = ?, proof_image = ?, status = 'pending', sender_name = ?, sender_number = ?, reference = ?, method = ?, admin_note = NULL, created_at = ?
           WHERE id = ?`
        ).bind(amount, proofImageUrl, senderName.trim(), senderNumber.trim(), reference.trim(), method, nowIso, existing.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO activation_payments (id, user_id, email, amount, proof_image, status, sender_name, sender_number, reference, method, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
        ).bind(paymentId, userId, email, amount, proofImageUrl, senderName.trim(), senderNumber.trim(), reference.trim(), method, nowIso).run();
      }

      // Also record in payment_proofs
      await env.DB.prepare(
        `INSERT INTO payment_proofs (id, user_id, email, reference, amount, file_url, sender_name, sender_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(paymentId, userId, email, reference.trim(), amount, proofImageUrl, senderName.trim(), senderNumber.trim(), nowIso).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment submitted successfully. Awaiting administrator verification.',
        paymentId,
        status: 'pending',
        proofImageUrl,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Payment submission failed' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
