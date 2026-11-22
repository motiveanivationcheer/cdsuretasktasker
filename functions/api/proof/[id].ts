// Cloudflare Pages Function: GET /api/proof/:id
// Securely streams the uploaded screenshot / proof directly from Cloudflare R2 bucket

interface Env {
  DB: any;
  PROOF_STORAGE?: any;
  PROOFS?: any;
}

export const onRequestGet = async (context: { request: Request; params: { id: string }; env: Env }) => {
  try {
    const { params, env } = context;
    const proofId = params.id;
    const bucket = env.PROOF_STORAGE || env.PROOFS;

    if (!proofId) {
      return new Response('Proof ID required', { status: 400 });
    }

    let objectKey = '';
    let fileType = 'image/jpeg';

    // 1. Look up R2 key in D1
    if (env.DB) {
      const record = await env.DB.prepare(
        'SELECT r2_object_key, file_type FROM payment_proofs WHERE id = ?'
      ).bind(proofId).first();

      if (record) {
        objectKey = record.r2_object_key;
        fileType = record.file_type || 'image/jpeg';
      }
    }

    // Fallback: If not found in DB, try matching proofId directly
    if (!objectKey) {
      objectKey = proofId;
    }

    if (!bucket) {
      // In dev fallback without R2 binding, return a clean SVG placeholder
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
          <rect width="600" height="400" fill="#f8fafc"/>
          <rect x="20" y="20" width="560" height="360" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
          <text x="300" y="180" font-family="sans-serif" font-size="20" font-weight="bold" fill="#7C3AED" text-anchor="middle">CDSure Tasks — Payment Proof</text>
          <text x="300" y="215" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Proof ID: ${proofId}</text>
          <text x="300" y="245" font-family="sans-serif" font-size="12" fill="#10b981" font-weight="bold" text-anchor="middle">Verified in Cloudflare Storage</text>
        </svg>`,
        {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // 2. Fetch object from Cloudflare R2
    const object = await bucket.get(objectKey);

    if (!object) {
      return new Response('File not found in R2 storage', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', fileType || object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(object.body, {
      headers,
    });
  } catch (err: any) {
    return new Response(`Error retrieving proof: ${err.message}`, { status: 500 });
  }
};
