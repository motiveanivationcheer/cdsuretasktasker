import type { APIRoute } from 'astro';
import { verifyFirebaseToken } from '../../../functions/api/_auth';

export const prerender = false;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env: any = (locals as any)?.runtime?.env || {};
    const bucket = env.PROOF_STORAGE || env.PROOFS;

    // Verify Firebase Token
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authResult = await verifyFirebaseToken(authHeader, env.FIREBASE_PROJECT_ID);

    if (!authResult.success || !authResult.user) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error || 'Unauthorized. Please sign in.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;
    const contentType = request.headers.get('content-type') || '';

    let fileBuffer: ArrayBuffer | null = null;
    let fileName = 'proof.jpg';
    let fileType = 'image/jpeg';
    let fileSize = 0;
    let senderName = '';
    let senderNumber = '';
    let reference = '';
    let amount = 1500;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = (formData.get('file') as File) || (formData.get('proof') as File);
      senderName = (formData.get('sender_name') as string) || '';
      senderNumber = (formData.get('sender_number') as string) || '';
      reference = (formData.get('reference') as string) || '';
      amount = parseFloat(formData.get('amount') as string) || 1500;

      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ success: false, error: 'No file found in request. Please upload a screenshot or PDF.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      fileType = file.type || 'image/jpeg';
      fileName = file.name || 'proof.jpg';
      fileSize = file.size;
      fileBuffer = await file.arrayBuffer();
    } else {
      const body: any = await request.json().catch(() => ({}));
      senderName = body.sender_name || body.senderName || '';
      senderNumber = body.sender_number || body.senderNumber || '';
      reference = body.reference || body.txRef || '';
      amount = body.amount || 1500;

      if (body.base64) {
        const raw = body.base64.replace(/^data:[^;]+;base64,/, '');
        const binary = atob(raw);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;
        fileType = body.contentType || 'image/jpeg';
        fileName = body.fileName || 'proof.jpg';
        fileSize = fileBuffer.byteLength;
      }
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Uploaded file is empty.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate MIME type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!allowed.includes(fileType.toLowerCase())) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid format (${fileType}). Please upload JPG, JPEG, PNG, WEBP, or PDF.` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Max 5MB
    if (fileSize > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 5MB limit.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const uniqueId = crypto.randomUUID();
    const objectKey = `proofs/${user.uid}/${Date.now()}_${uniqueId.substring(0, 8)}.${ext}`;
    const proofId = `prf_${uniqueId.replace(/-/g, '').substring(0, 16)}`;
    const fileUrl = `/api/proof/${proofId}`;

    if (bucket) {
      await bucket.put(objectKey, fileBuffer, {
        httpMetadata: { contentType: fileType },
        customMetadata: { userId: user.uid, email: user.email, proofId, reference },
      });
    }

    const nowIso = new Date().toISOString();

    if (env.DB) {
      if (reference.trim()) {
        const existing = await env.DB.prepare('SELECT id FROM payment_proofs WHERE reference = ? AND user_id != ?').bind(reference.trim(), user.uid).first();
        if (existing) {
          return new Response(
            JSON.stringify({ success: false, error: 'This transaction reference has already been submitted by another user.' }),
            { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }

      await env.DB.prepare(
        `INSERT INTO payment_proofs (id, user_id, email, reference, amount, r2_object_key, file_url, file_type, file_size, sender_name, sender_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(proofId, user.uid, user.email, reference.trim(), amount, objectKey, fileUrl, fileType, fileSize, senderName.trim(), senderNumber.trim(), nowIso).run().catch(() => {});

      await env.DB.prepare(
        `INSERT INTO activation_payments (id, user_id, email, amount, proof_image, status, sender_name, sender_number, reference, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
      ).bind(proofId, user.uid, user.email, amount, fileUrl, senderName.trim(), senderNumber.trim(), reference.trim(), nowIso).run().catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment proof submitted successfully. Status is now PENDING administrator verification.',
        proofId,
        objectKey,
        fileUrl,
        status: 'pending',
        timestamp: nowIso,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Upload failed.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
