// Cloudflare Pages Function: POST /api/upload-proof
// Uploads payment receipts and task screenshots directly to Cloudflare R2 and records in D1

import { verifyFirebaseToken } from './_auth';

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
    const bucket = env.PROOF_STORAGE || env.PROOFS;

    // 1. Verify Firebase Authentication Token
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
    let fileName = '';
    let fileType = 'image/jpeg';
    let fileSize = 0;
    let senderName = '';
    let senderNumber = '';
    let reference = '';
    let amount = 1500;
    let proofType = 'activation';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File || formData.get('proof') as File || formData.get('proof_image') as File;

      senderName = (formData.get('sender_name') as string) || (formData.get('senderName') as string) || '';
      senderNumber = (formData.get('sender_number') as string) || (formData.get('senderNumber') as string) || '';
      reference = (formData.get('reference') as string) || (formData.get('txRef') as string) || '';
      amount = parseFloat(formData.get('amount') as string) || 1500;
      proofType = (formData.get('type') as string) || 'activation';

      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ success: false, error: 'No file found in upload request. Please select an image or PDF.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      fileType = file.type || 'image/jpeg';
      fileName = file.name || 'proof.jpg';
      fileSize = file.size;
      fileBuffer = await file.arrayBuffer();
    } else {
      // JSON base64 upload fallback
      const body: any = await request.json().catch(() => ({}));
      senderName = body.sender_name || body.senderName || '';
      senderNumber = body.sender_number || body.senderNumber || '';
      reference = body.reference || body.txRef || '';
      amount = body.amount || 1500;
      proofType = body.type || 'activation';

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

    // 2. Validate MIME type (JPG, JPEG, PNG, WEBP, PDF)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!allowedMimeTypes.includes(fileType.toLowerCase())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid file format (${fileType}). Please upload a JPG, JPEG, PNG, WEBP, or PDF document.`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validate File Size (Maximum 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (fileSize > MAX_SIZE) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File size exceeds the 5MB limit. Please upload a smaller or compressed file.`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Generate unique filename organized by user UID
    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const uniqueId = crypto.randomUUID();
    const objectKey = `proofs/${user.uid}/${Date.now()}_${uniqueId.substring(0, 8)}.${ext}`;
    const proofId = `prf_${uniqueId.replace(/-/g, '').substring(0, 16)}`;

    // 5. Upload directly to Cloudflare R2
    let fileUrl = `/api/proof/${proofId}`;
    if (bucket) {
      await bucket.put(objectKey, fileBuffer, {
        httpMetadata: {
          contentType: fileType,
        },
        customMetadata: {
          userId: user.uid,
          userEmail: user.email,
          proofId,
          reference,
        },
      });
    }

    const nowIso = new Date().toISOString();

    // 6. Record metadata in Cloudflare D1
    if (env.DB) {
      // Check for duplicate payment references
      if (reference.trim()) {
        const existingRef = await env.DB.prepare(
          'SELECT id FROM payment_proofs WHERE reference = ? AND user_id != ?'
        ).bind(reference.trim(), user.uid).first();

        if (existingRef) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'This transaction reference / session ID has already been submitted by another user.',
            }),
            { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Insert into payment_proofs table
      await env.DB.prepare(
        `INSERT INTO payment_proofs (
           id, user_id, email, reference, amount, r2_object_key,
           file_url, file_type, file_size, sender_name, sender_number, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(
        proofId,
        user.uid,
        user.email,
        reference.trim(),
        amount,
        objectKey,
        fileUrl,
        fileType,
        fileSize,
        senderName.trim(),
        senderNumber.trim(),
        nowIso
      ).run();

      // Backwards-compatible insert/update to activation_payments
      const existingAct = await env.DB.prepare(
        'SELECT id FROM activation_payments WHERE user_id = ?'
      ).bind(user.uid).first();

      if (existingAct) {
        await env.DB.prepare(
          `UPDATE activation_payments
           SET proof_image = ?, status = 'pending', reference = ?, sender_name = ?, sender_number = ?, created_at = ?
           WHERE id = ?`
        ).bind(fileUrl, reference.trim(), senderName.trim(), senderNumber.trim(), nowIso, existingAct.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO activation_payments (id, user_id, email, amount, proof_image, status, sender_name, sender_number, reference, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
        ).bind(proofId, user.uid, user.email, amount, fileUrl, senderName.trim(), senderNumber.trim(), reference.trim(), nowIso).run();
      }
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
    console.error('Upload proof error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Failed to process proof upload.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
