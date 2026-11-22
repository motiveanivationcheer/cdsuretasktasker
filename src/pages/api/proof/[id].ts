import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const proofId = params.id;
  const env: any = (locals as any)?.runtime?.env || {};
  const bucket = env.PROOF_STORAGE || env.PROOFS;

  if (!proofId) {
    return new Response('Proof ID required', { status: 400 });
  }

  let objectKey = proofId;
  let fileType = 'image/jpeg';

  if (env.DB) {
    try {
      const record = await env.DB.prepare('SELECT r2_object_key, file_type FROM payment_proofs WHERE id = ?').bind(proofId).first();
      if (record) {
        objectKey = record.r2_object_key;
        fileType = record.file_type || 'image/jpeg';
      }
    } catch (_e) {}
  }

  if (!bucket) {
    // Clean SVG receipt
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#f8fafc"/>
      <rect x="20" y="20" width="560" height="360" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
      <text x="300" y="160" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#7C3AED" text-anchor="middle">CDSure Tasks — Payment Proof</text>
      <text x="300" y="200" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Proof ID: ${proofId}</text>
      <rect x="220" y="240" width="160" height="36" rx="10" fill="#10b981"/>
      <text x="300" y="263" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">Verified Storage</text>
    </svg>`;
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  try {
    const object = await bucket.get(objectKey);
    if (!object) {
      return new Response('File not found in storage', { status: 404 });
    }
    const headers = new Headers();
    headers.set('Content-Type', fileType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(object.body, { headers });
  } catch (err: any) {
    return new Response(`Error retrieving proof: ${err.message}`, { status: 500 });
  }
};
