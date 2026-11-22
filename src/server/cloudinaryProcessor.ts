// Shared Server-Side Cloudinary Signed Upload & Review Processor
// Used by Astro SSR API routes (src/pages/api/cloudinary/*) on Cloudflare Workers.

import { verifyFirebaseToken, requireAdmin, isAdminEmail } from './auth';
import {
  getCloudinaryConfig,
  resolveCloudinaryFolder,
  validateCloudinaryImageInput,
  signCloudinaryParams,
  destroyCloudinaryAssetOnCloud,
} from './cloudinary';

export const CLOUDINARY_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(payload: any, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CLOUDINARY_CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function ensureCloudinaryTable(db: any) {
  if (!db) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cloudinary_images (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT,
        user_name TEXT,
        category TEXT NOT NULL,
        folder TEXT NOT NULL,
        public_id TEXT UNIQUE NOT NULL,
        secure_url TEXT NOT NULL,
        format TEXT,
        bytes INTEGER DEFAULT 0,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        related_id TEXT,
        review_note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT
      )`
    )
    .run()
    .catch(() => {});
}

/**
 * POST /api/cloudinary/sign
 * Authenticates user, validates JPG/JPEG/PNG/WEBP + <=10MB + folder category,
 * and returns SHA-1 signed upload parameters (NEVER returns apiSecret).
 */
export async function handleSignCloudinaryUpload(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const auth = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return jsonRes({ success: false, error: auth.error || 'Authentication required before uploading.' }, 401);
    }

    const body: any = await request.json().catch(() => ({}));
    const validation = validateCloudinaryImageInput({
      fileName: body.fileName || body.file_name,
      fileType: body.fileType || body.file_type || body.mimeType,
      fileSize: body.fileSize ?? body.file_size,
    });
    if (!validation.valid) {
      return jsonRes({ success: false, error: validation.error }, 400);
    }

    const { category, folder } = resolveCloudinaryFolder(body.category || body.folder);
    const config = getCloudinaryConfig(env);

    if (!config.apiKey || !config.apiSecret) {
      return jsonRes(
        {
          success: false,
          error:
            'Cloudinary signed upload credentials (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET) are not configured on the backend.',
        },
        503
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = {
      folder,
      timestamp,
    };

    const signature = await signCloudinaryParams(paramsToSign, config.apiSecret);

    return jsonRes({
      success: true,
      signed: true,
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      timestamp,
      signature,
      folder,
      category,
      upload_url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    });
  } catch (err: any) {
    return jsonRes({ success: false, error: err?.message || 'Could not generate Cloudinary upload signature.' }, 500);
  }
}

/**
 * POST /api/cloudinary/record
 * Links a verified Cloudinary secure_url + public_id to the authenticated user in D1.
 * Strictly blocks Base64 data URIs or non-Cloudinary URLs.
 */
export async function handleRecordCloudinaryImage(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const auth = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return jsonRes({ success: false, error: auth.error || 'Authentication required.' }, 401);
    }

    const body: any = await request.json().catch(() => ({}));
    const publicId = String(body.public_id || body.publicId || '').trim();
    const secureUrl = String(body.secure_url || body.secureUrl || '').trim();

    if (!publicId) {
      return jsonRes({ success: false, error: 'Cloudinary public_id is required.' }, 400);
    }
    if (!secureUrl || secureUrl.startsWith('data:') || !secureUrl.startsWith('https://res.cloudinary.com/')) {
      return jsonRes(
        { success: false, error: 'Only HTTPS Cloudinary image URLs are allowed (Base64 is rejected).' },
        400
      );
    }

    const { category, folder } = resolveCloudinaryFolder(body.category || body.folder);
    const defaultStatus =
      category === 'profile-images' || category === 'campaign-images' || category === 'product-images'
        ? 'approved'
        : 'pending';
    const nowIso = new Date().toISOString();
    const id = `img_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const db = env?.DB;
    if (db) {
      await ensureCloudinaryTable(db);
      const userRow: any = await db
        .prepare('SELECT name, email FROM users WHERE id = ?')
        .bind(auth.user.uid)
        .first()
        .catch(() => null);

      await db
        .prepare(
          `INSERT INTO cloudinary_images
           (id, user_id, user_email, user_name, category, folder, public_id, secure_url, format, bytes, width, height, status, related_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(public_id) DO UPDATE SET
             secure_url = excluded.secure_url,
             category = excluded.category,
             folder = excluded.folder,
             related_id = COALESCE(excluded.related_id, cloudinary_images.related_id)`
        )
        .bind(
          id,
          auth.user.uid,
          auth.user.email || userRow?.email || '',
          userRow?.name || auth.user.name || 'Member',
          category,
          folder,
          publicId,
          secureUrl,
          String(body.format || '').toLowerCase(),
          Number(body.bytes || 0),
          Number(body.width || 0),
          Number(body.height || 0),
          defaultStatus,
          body.related_id ? String(body.related_id) : null,
          nowIso
        )
        .run()
        .catch(() => {});

      if (category === 'profile-images') {
        await db
          .prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
          .bind(secureUrl, nowIso, auth.user.uid)
          .run()
          .catch(() => {});
      } else if (category === 'verification') {
        await db
          .prepare('UPDATE users SET activation_proof_url = ?, updated_at = ? WHERE id = ?')
          .bind(secureUrl, nowIso, auth.user.uid)
          .run()
          .catch(() => {});
      }
    }

    return jsonRes({
      success: true,
      image: {
        id,
        user_id: auth.user.uid,
        user_email: auth.user.email,
        category,
        folder,
        public_id: publicId,
        secure_url: secureUrl,
        status: defaultStatus,
        created_at: nowIso,
      },
    });
  } catch (err: any) {
    return jsonRes({ success: false, error: err?.message || 'Failed to record Cloudinary image.' }, 500);
  }
}

/**
 * POST /api/cloudinary/delete
 * Prevents unauthorized file deletion: verifies owner or admin, then destroys on Cloudinary & D1.
 */
export async function handleDeleteCloudinaryImage(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const auth = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return jsonRes({ success: false, error: auth.error || 'Authentication required.' }, 401);
    }

    const body: any = await request.json().catch(() => ({}));
    const publicId = String(body.public_id || body.publicId || '').trim();
    if (!publicId) {
      return jsonRes({ success: false, error: 'public_id is required to delete an image.' }, 400);
    }

    const isAdmin = isAdminEmail(auth.user.email);
    const db = env?.DB;
    let existing: any = null;

    if (db) {
      await ensureCloudinaryTable(db);
      existing = await db
        .prepare('SELECT * FROM cloudinary_images WHERE public_id = ?')
        .bind(publicId)
        .first()
        .catch(() => null);

      if (existing && existing.user_id !== auth.user.uid && !isAdmin) {
        return jsonRes({ success: false, error: 'Forbidden: You cannot delete another user’s image.' }, 403);
      }
    }

    if (!existing && !isAdmin && !publicId.startsWith('cdsure/')) {
      return jsonRes({ success: false, error: 'Forbidden: Unauthorized image deletion attempt.' }, 403);
    }

    const config = getCloudinaryConfig(env);
    if (!config.apiKey || !config.apiSecret) {
      return jsonRes(
        { success: false, error: 'Cloudinary API credentials are not configured on the backend.' },
        503
      );
    }

    const destroyRes = await destroyCloudinaryAssetOnCloud(config, publicId);
    if (!destroyRes.success) {
      return jsonRes({ success: false, error: destroyRes.error || 'Failed to delete from Cloudinary.' }, 400);
    }

    if (db && existing) {
      await db.prepare('DELETE FROM cloudinary_images WHERE public_id = ?').bind(publicId).run().catch(() => {});
    }

    return jsonRes({
      success: true,
      deleted: true,
      public_id: publicId,
      result: destroyRes.result,
    });
  } catch (err: any) {
    return jsonRes({ success: false, error: err?.message || 'Failed to delete Cloudinary image.' }, 500);
  }
}

/**
 * GET /api/cloudinary/images
 * Admin gets all submitted/uploaded Cloudinary images (plus linked proofs/submissions).
 * Non-admin gets only their own images.
 */
export async function handleListCloudinaryImages(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const auth = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!auth.success || !auth.user) {
      return jsonRes({ success: false, error: auth.error || 'Authentication required.' }, 401);
    }

    const isAdmin = isAdminEmail(auth.user.email);
    const url = new URL(request.url);
    const categoryFilter = url.searchParams.get('category');
    const statusFilter = url.searchParams.get('status');

    const db = env?.DB;
    if (!db) {
      return jsonRes({ success: true, images: [], task_submissions: [] });
    }

    await ensureCloudinaryTable(db);

    const clauses: string[] = [];
    const bindings: any[] = [];
    if (!isAdmin) {
      if (categoryFilter === 'product-images') {
        clauses.push("(status = 'approved' OR user_id = ?)");
        bindings.push(auth.user.uid);
      } else {
        clauses.push('user_id = ?');
        bindings.push(auth.user.uid);
      }
    }
    if (categoryFilter && categoryFilter !== 'all') {
      clauses.push('category = ?');
      bindings.push(categoryFilter);
    }
    if (statusFilter && statusFilter !== 'all') {
      clauses.push('status = ?');
      bindings.push(statusFilter);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await db
      .prepare(`SELECT * FROM cloudinary_images ${whereSql} ORDER BY created_at DESC LIMIT 200`)
      .bind(...bindings)
      .all()
      .catch(() => ({ results: [] }));

    let taskSubmissions: any[] = [];
    if (isAdmin) {
      const subRes = await db
        .prepare(
          `SELECT id, task_id, task_title, employer_id, earner_id, earner_name, earner_email, proof_url, proof_link, proof_text, reward, status, created_at
           FROM task_submissions
           WHERE proof_url IS NOT NULL AND proof_url != ''
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .all()
        .catch(() => ({ results: [] }));
      taskSubmissions = subRes?.results || [];
    }

    return jsonRes({
      success: true,
      images: res?.results || [],
      task_submissions: taskSubmissions,
    });
  } catch (err: any) {
    return jsonRes({ success: false, error: err?.message || 'Failed to load Cloudinary images.' }, 500);
  }
}

/**
 * POST /api/cloudinary/review
 * Admin-only approve/reject action for submitted task screenshots, verification docs, payment proofs, or support attachments.
 */
export async function handleReviewCloudinaryImage(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const adminCheck = await requireAdmin(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!adminCheck.success || !adminCheck.user) {
      return jsonRes({ success: false, error: adminCheck.error || 'Admin access required.' }, adminCheck.status);
    }

    const body: any = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const publicId = String(body.public_id || body.publicId || '').trim();
    const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : '';
    const reviewNote = String(body.review_note || body.note || '').trim();

    if ((!id && !publicId) || !status) {
      return jsonRes({ success: false, error: 'Image identifier and valid status (approved | rejected) are required.' }, 400);
    }

    const db = env?.DB;
    const nowIso = new Date().toISOString();
    if (db) {
      await ensureCloudinaryTable(db);
      if (id) {
        await db
          .prepare('UPDATE cloudinary_images SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?')
          .bind(status, reviewNote, nowIso, id)
          .run()
          .catch(() => {});
      } else {
        await db
          .prepare('UPDATE cloudinary_images SET status = ?, review_note = ?, reviewed_at = ? WHERE public_id = ?')
          .bind(status, reviewNote, nowIso, publicId)
          .run()
          .catch(() => {});
      }
    }

    return jsonRes({
      success: true,
      status,
      review_note: reviewNote,
      reviewed_at: nowIso,
    });
  } catch (err: any) {
    return jsonRes({ success: false, error: err?.message || 'Failed to update image review status.' }, 500);
  }
}
