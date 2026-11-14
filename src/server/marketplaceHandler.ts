// Shared Marketplace Catalog & Verified Digital Delivery Handlers
import { verifyFirebaseToken } from './auth';
import { MARKETPLACE_CATALOG, getCategoryLabel, resolveProductFromDbOrCatalog } from './marketplaceCatalog';
import { PAYMENT_CORS_HEADERS } from './paymentProcessor';

export async function handleGetMarketplaceProducts(request: Request, env: any): Promise<Response> {
  try {
    const db = env?.DB;
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    let authUserUid: string | null = null;

    if (authHeader) {
      const authRes = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
      if (authRes.success && authRes.user) {
        authUserUid = authRes.user.uid;
      }
    }

    let products = MARKETPLACE_CATALOG;
    if (db) {
      const rows = await db
        .prepare('SELECT * FROM marketplace_products WHERE is_active = 1 ORDER BY price_ngn ASC')
        .all()
        .catch(() => null);
      if (rows?.results && rows.results.length > 0) {
        products = rows.results.map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category,
          categoryLabel: getCategoryLabel(r.category),
          price_ngn: Number(r.price_ngn),
          vendor_id: r.vendor_id,
          vendor_name: r.vendor_name,
          commission_rate: Number(r.commission_rate ?? 0.3),
          r2_file_key: r.r2_file_key || '',
          delivery_type: r.delivery_type || 'download',
          badge: r.badge || 'Digital',
          is_active: Number(r.is_active ?? 1),
        }));
      }
    }

    let orders: any[] = [];
    if (db && authUserUid) {
      const orderRows = await db
        .prepare(
          `SELECT id, reference, product_id, product_title, category, amount, status, delivery_unlocked, download_url, created_at, verified_at
           FROM marketplace_orders
           WHERE user_id = ?
           ORDER BY created_at DESC`
        )
        .bind(authUserUid)
        .all()
        .catch(() => null);
      if (orderRows?.results) {
        orders = orderRows.results;
      }
    }

    return new Response(JSON.stringify({ success: true, products, orders }), {
      status: 200,
      headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to load marketplace products.' }),
      { status: 500, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleDeliverMarketplaceProduct(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authRes = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!authRes.success || !authRes.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required to download product.' }), {
        status: 401,
        headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const reference = url.searchParams.get('reference');
    const productId = url.searchParams.get('productId');

    if (!reference && !productId) {
      return new Response(JSON.stringify({ success: false, error: 'Order reference or productId required.' }), {
        status: 400,
        headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const db = env?.DB;
    let verifiedOrder: any = null;

    if (db) {
      if (reference) {
        verifiedOrder = await db
          .prepare(
            `SELECT * FROM marketplace_orders
             WHERE reference = ? AND user_id = ? AND delivery_unlocked = 1 AND status IN ('paid', 'delivered')`
          )
          .bind(reference, authRes.user.uid)
          .first()
          .catch(() => null);
      } else if (productId) {
        verifiedOrder = await db
          .prepare(
            `SELECT * FROM marketplace_orders
             WHERE product_id = ? AND user_id = ? AND delivery_unlocked = 1 AND status IN ('paid', 'delivered')
             ORDER BY verified_at DESC LIMIT 1`
          )
          .bind(productId, authRes.user.uid)
          .first()
          .catch(() => null);
      }
    }

    if (!verifiedOrder) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Access Denied: Product delivery is locked until Paystack server-side verification succeeds.',
        }),
        { status: 403, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const product = await resolveProductFromDbOrCatalog(db, verifiedOrder.product_id);
    const r2 = env?.PROOF_STORAGE || env?.PROOFS;

    // Serve digital asset directly from Cloudflare R2 when uploaded
    if (r2 && product?.r2_file_key) {
      const obj = await r2.get(product.r2_file_key).catch(() => null);
      if (obj) {
        const headers = new Headers(PAYMENT_CORS_HEADERS);
        headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
        headers.set(
          'Content-Disposition',
          `attachment; filename="${product.r2_file_key.split('/').pop() || 'cdsure-package'}"`
        );
        return new Response(obj.body, { status: 200, headers });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered: true,
        reference: verifiedOrder.reference,
        product: {
          id: verifiedOrder.product_id,
          title: verifiedOrder.product_title,
          category: verifiedOrder.category,
          delivery_type: product?.delivery_type || 'download',
          r2_file_key: product?.r2_file_key || null,
          vendor_name: product?.vendor_name || 'CDSure Official',
        },
        accessPayload: {
          licenseKey: `CDSURE-${verifiedOrder.reference.toUpperCase()}`,
          unlockedAt: verifiedOrder.verified_at,
          instructions:
            product?.delivery_type === 'subscription'
              ? 'Your CDSure VIP Pro 30-Day Priority Pass is active across your account.'
              : 'Your digital package has been verified via Paystack and unlocked for download & access.',
        },
      }),
      { status: 200, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to deliver product.' }),
      { status: 500, headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}
