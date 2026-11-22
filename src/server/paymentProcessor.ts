// Shared Server-Side Paystack Payment & Fulfillment Processor
// Used by Astro SSR routes (src/pages/api/*) and Cloudflare Pages Functions (functions/api/*)
// SECURITY: Secret keys are resolved ONLY on the server and NEVER returned or logged.

import { verifyFirebaseToken } from './auth';
import {
  nairaToKobo,
  koboToNaira,
  generatePaystackReference,
  getPaystackSecretKey,
  getPaystackWebhookSecret,
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from './paystack';
import { resolveProductFromDbOrCatalog } from './marketplaceCatalog';

export const PAYMENT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(payload: any, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...PAYMENT_CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
}

async function ensureD1User(db: any, userId: string, email: string, requestedRole: string = '') {
  if (!db || !userId) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, name, email, role, requested_role, payment_status, status, balance, is_activated)
       VALUES (?, ?, ?, 'pending', ?, 'unpaid', 'pending', 0, 0)`
    )
    .bind(userId, email?.split('@')[0] || 'Member', email || `${userId}@cdsure.user`, requestedRole)
    .run()
    .catch(() => {});
}

export async function readD1FeeSettings(db: any) {
  let earner_fee = 2000;
  let employer_fee = 5000;
  let activation_bonus_earner = 0;
  let activation_bonus_employer = 0;

  if (db) {
    const res = await db.prepare('SELECT key, value FROM app_settings').all().catch(() => null);
    const map: Record<string, string> = {};
    for (const r of res?.results || []) {
      map[r.key] = r.value;
    }
    if (map.earner_activation_fee) earner_fee = Math.max(100, Number(map.earner_activation_fee) || 2000);
    if (map.employer_activation_fee) employer_fee = Math.max(100, Number(map.employer_activation_fee) || 5000);
    if (map.activation_bonus_earner) activation_bonus_earner = Math.max(0, Number(map.activation_bonus_earner) || 0);
    if (map.activation_bonus_employer) activation_bonus_employer = Math.max(0, Number(map.activation_bonus_employer) || 0);
  }

  return { earner_fee, employer_fee, activation_bonus_earner, activation_bonus_employer };
}

export async function markPaymentVerifiedInD1(
  db: any,
  params: {
    reference: string;
    userId: string;
    email: string;
    paidNaira: number;
    currency: string;
    purpose: string;
    requestedRole?: string;
    productId?: string | null;
    productTitle?: string | null;
    category?: string | null;
    vendorId?: string | null;
    gatewayResponse: string;
    nowIso: string;
  }
): Promise<{ alreadyProcessed: boolean; balance?: number; is_activated?: number; role?: string; deliveryUrl?: string; user?: any }> {
  const {
    reference,
    userId,
    email,
    paidNaira,
    currency,
    purpose,
    requestedRole,
    productId,
    productTitle,
    category,
    vendorId,
    gatewayResponse,
    nowIso,
  } = params;

  if (!db) {
    return {
      alreadyProcessed: false,
      is_activated: purpose === 'activation' ? 1 : undefined,
      role: requestedRole === 'employer' ? 'employer' : 'earner',
      deliveryUrl: productId ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}` : undefined,
    };
  }

  const existingTx: any = await db
    .prepare('SELECT id, user_id, status, transaction_type, product_id, amount FROM transactions WHERE reference = ?')
    .bind(reference)
    .first()
    .catch(() => null);

  if (existingTx?.status === 'success') {
    const uRow: any = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(existingTx.user_id || userId)
      .first()
      .catch(() => null);
    return {
      alreadyProcessed: true,
      balance: uRow ? Number(uRow.balance) : undefined,
      is_activated: uRow ? Number(uRow.is_activated) : undefined,
      role: uRow?.role,
      user: uRow,
      deliveryUrl:
        existingTx.product_id || productId
          ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`
          : undefined,
    };
  }

  const effectiveUserId = existingTx?.user_id || userId;
  const effectiveProductId = existingTx?.product_id || productId || null;
  const effectivePurpose = existingTx?.transaction_type || purpose;

  await ensureD1User(db, effectiveUserId, email, requestedRole || '');

  if (existingTx) {
    await db
      .prepare(
        `UPDATE transactions
         SET status = 'success', gateway_response = ?, verified_at = ?
         WHERE reference = ?`
      )
      .bind(gatewayResponse, nowIso, reference)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO transactions (id, reference, user_id, email, product_id, amount, fee_amount, net_amount, currency, payment_gateway, status, transaction_type, gateway_response, created_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'paystack', 'success', ?, ?, ?, ?)`
      )
      .bind(
        makeId('tx'),
        reference,
        effectiveUserId,
        email,
        effectiveProductId,
        paidNaira,
        paidNaira,
        currency,
        effectivePurpose,
        gatewayResponse,
        nowIso,
        nowIso
      )
      .run()
      .catch(() => {});
  }

  let deliveryUrl: string | undefined;

  if (effectivePurpose === 'activation') {
    const uRow: any = await db.prepare('SELECT * FROM users WHERE id = ?').bind(effectiveUserId).first().catch(() => null);
    const fees = await readD1FeeSettings(db);
    const targetRole =
      requestedRole === 'employer' || uRow?.requested_role === 'employer' ? 'employer' : 'earner';
    const bonus = targetRole === 'employer' ? fees.activation_bonus_employer : fees.activation_bonus_earner;

    await db
      .prepare(
        `UPDATE users
         SET payment_status = 'paid',
             activation_reference = ?,
             activation_amount = ?,
             activation_paid_at = ?,
             role = ?,
             requested_role = ?,
             status = 'active',
             is_activated = 1,
             employer_approved = ?,
             employer_status = ?,
             balance = COALESCE(balance, 0) + ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(
        reference,
        paidNaira,
        nowIso,
        targetRole,
        targetRole,
        targetRole === 'employer' ? 1 : 0,
        targetRole === 'employer' ? 'approved' : 'none',
        bonus,
        nowIso,
        effectiveUserId
      )
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'activation_payment', ?, 'Approved', ?)`
      )
      .bind(
        makeId('wtx'),
        effectiveUserId,
        `${reference}_act`,
        paidNaira,
        bonus,
        bonus > 0
          ? `Account Activation via Paystack (+₦${bonus.toLocaleString()} activation bonus)`
          : `Account Activation (${targetRole.toUpperCase()}) via Paystack`,
        nowIso
      )
      .run()
      .catch(() => {});
  } else if (effectivePurpose === 'wallet_funding' || effectivePurpose === 'deposit') {
    await db
      .prepare(
        `UPDATE users
         SET balance = COALESCE(balance, 0) + ?,
             total_deposited = COALESCE(total_deposited, 0) + ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(paidNaira, paidNaira, nowIso, effectiveUserId)
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO deposits (id, user_id, user_email, amount, reference, payment_method, status, created_at, reviewed_at)
         VALUES (?, ?, ?, ?, ?, 'paystack', 'Approved', ?, ?)`
      )
      .bind(makeId('dep'), effectiveUserId, email, paidNaira, reference, nowIso, nowIso)
      .run()
      .catch(() => {});

    await db
      .prepare(
        `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'deposit', 'Wallet Deposit via Paystack', 'Approved', ?)`
      )
      .bind(makeId('wtx'), effectiveUserId, reference, paidNaira, paidNaira, nowIso)
      .run()
      .catch(() => {});
  }

  if (effectiveProductId || effectivePurpose === 'marketplace_purchase' || effectivePurpose === 'subscription') {
    const product = effectiveProductId ? await resolveProductFromDbOrCatalog(db, effectiveProductId) : null;
    const resolvedTitle = product?.title || productTitle || 'CDSure Premium Package';
    const resolvedCategory = product?.category || category || (effectivePurpose === 'subscription' ? 'subscription' : 'digital_product');
    const resolvedVendorId = product?.vendor_id || vendorId || 'vendor_cdsure_official';
    const commRate = product?.commission_rate ?? 0.30;
    const platformFee = Math.round(paidNaira * commRate * 100) / 100;
    const vendorNet = Math.round((paidNaira - platformFee) * 100) / 100;
    deliveryUrl = `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`;

    await db
      .prepare(
        `INSERT INTO marketplace_orders (id, reference, user_id, email, product_id, product_title, category, amount, platform_fee, vendor_amount, vendor_id, status, delivery_unlocked, download_url, created_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', 1, ?, ?, ?)
         ON CONFLICT(reference) DO UPDATE SET
           status = 'delivered',
           delivery_unlocked = 1,
           download_url = excluded.download_url,
           verified_at = excluded.verified_at`
      )
      .bind(
        makeId('ord'),
        reference,
        effectiveUserId,
        email,
        effectiveProductId || 'prod_sub_pro',
        resolvedTitle,
        resolvedCategory,
        paidNaira,
        platformFee,
        vendorNet,
        resolvedVendorId,
        deliveryUrl,
        nowIso,
        nowIso
      )
      .run()
      .catch(() => {});

    if (effectivePurpose === 'subscription' || resolvedCategory === 'subscription') {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare(`UPDATE users SET subscription_tier = 'pro', subscription_expires_at = ?, updated_at = ? WHERE id = ?`)
        .bind(expiresAt, nowIso, effectiveUserId)
        .run()
        .catch(() => {});
    }
  }

  const finalUser: any = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(effectiveUserId)
    .first()
    .catch(() => null);

  return {
    alreadyProcessed: false,
    balance: finalUser ? Number(finalUser.balance) : undefined,
    is_activated: finalUser ? Number(finalUser.is_activated) : undefined,
    role: finalUser?.role,
    user: finalUser,
    deliveryUrl,
  };
}

/**
 * POST /api/payments/initialize
 */
export async function handleInitializePayment(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authResult = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
    if (!authResult.success || !authResult.user) {
      return jsonResponse({ success: false, error: authResult.error || 'Unauthorized: Please sign in.' }, 401);
    }

    const userId = authResult.user.uid;
    const body: any = await request.json().catch(() => ({}));
    const userEmail = authResult.user.email || body.email;

    if (!userEmail || !String(userEmail).includes('@')) {
      return jsonResponse({ success: false, error: 'Valid email address is required for Paystack payment.' }, 400);
    }

    const db = env?.DB;
    const productId = body.productId ? String(body.productId).trim() : null;
    let purpose = String(body.purpose || (productId ? 'marketplace_purchase' : 'activation'));
    let amount = parseFloat(body.amount);
    let resolvedProduct: any = null;
    const requestedRole: 'earner' | 'employer' =
      body.requested_role === 'employer' || body.role === 'employer' ? 'employer' : 'earner';

    if (productId) {
      resolvedProduct = await resolveProductFromDbOrCatalog(db, productId);
      if (!resolvedProduct) {
        return jsonResponse({ success: false, error: 'Selected marketplace product not found or inactive.' }, 404);
      }
      amount = resolvedProduct.price_ngn;
      purpose = resolvedProduct.category === 'subscription' ? 'subscription' : 'marketplace_purchase';
    } else if (purpose === 'activation') {
      const fees = await readD1FeeSettings(db);
      amount = requestedRole === 'employer' ? fees.employer_fee : fees.earner_fee;
    } else if (purpose === 'subscription') {
      amount = isNaN(amount) || amount < 3500 ? 3500 : amount;
    } else {
      if (!isNaN(Number(body.amountNaira)) && Number(body.amountNaira) >= 100) {
        amount = Number(body.amountNaira);
      } else if (body.unit === 'kobo' && !isNaN(amount)) {
        amount = koboToNaira(amount);
      }
      if (isNaN(amount) || amount < 100) {
        return jsonResponse({ success: false, error: 'Minimum payment amount is ₦100.' }, 400);
      }
    }

    const reference = body.reference ? String(body.reference).trim() : generatePaystackReference(purpose, userId);

    if (db) {
      const duplicate = await db
        .prepare('SELECT id, status FROM transactions WHERE reference = ?')
        .bind(reference)
        .first()
        .catch(() => null);
      if (duplicate) {
        return jsonResponse({ success: false, error: 'Duplicate order reference. Please retry checkout.' }, 409);
      }
    }

    const amountInKobo = nairaToKobo(amount);
    const nowIso = new Date().toISOString();

    if (db) {
      await ensureD1User(db, userId, userEmail, requestedRole);
      await db
        .prepare(
          `INSERT INTO transactions (id, reference, user_id, email, product_id, amount, fee_amount, net_amount, currency, payment_gateway, status, transaction_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'NGN', 'paystack', 'pending', ?, ?)`
        )
        .bind(makeId('tx'), reference, userId, userEmail, resolvedProduct?.id || null, amount, amount, purpose, nowIso)
        .run()
        .catch(() => {});

      if (purpose === 'activation') {
        await db
          .prepare(`UPDATE users SET requested_role = ?, activation_reference = ?, updated_at = ? WHERE id = ?`)
          .bind(requestedRole, reference, nowIso, userId)
          .run()
          .catch(() => {});
      }

      if (resolvedProduct) {
        const commRate = resolvedProduct.commission_rate ?? 0.30;
        const pFee = Math.round(amount * commRate * 100) / 100;
        const vNet = Math.round((amount - pFee) * 100) / 100;
        await db
          .prepare(
            `INSERT INTO marketplace_orders (id, reference, user_id, email, product_id, product_title, category, amount, platform_fee, vendor_amount, vendor_id, status, delivery_unlocked, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`
          )
          .bind(
            makeId('ord'),
            reference,
            userId,
            userEmail,
            resolvedProduct.id,
            resolvedProduct.title,
            resolvedProduct.category,
            amount,
            pFee,
            vNet,
            resolvedProduct.vendor_id,
            nowIso
          )
          .run()
          .catch(() => {});
      }
    }

    const secretKey = getPaystackSecretKey(env);
    if (!secretKey || !secretKey.startsWith('sk_live_')) {
      return jsonResponse({ success: false, error: 'Paystack LIVE secret key (sk_live_...) is not configured on server.' }, 503);
    }

    const url = new URL(request.url);
    const origin = url.origin;
    const defaultCallback =
      purpose === 'activation'
        ? `${origin}/activate?verify=${encodeURIComponent(reference)}`
        : `${origin}/verify-payment?reference=${encodeURIComponent(reference)}`;
    const callbackUrl = body.callback_url || defaultCallback;

    const paystackRes = await initializePaystackTransaction(secretKey, {
      email: userEmail,
      amountInKobo,
      reference,
      callback_url: callbackUrl,
      metadata: {
        userId,
        email: userEmail,
        purpose,
        role: requestedRole,
        requested_role: requestedRole,
        expectedAmountNaira: amount,
        productId: resolvedProduct?.id || undefined,
        productTitle: resolvedProduct?.title || undefined,
        category: resolvedProduct?.category || undefined,
        vendorId: resolvedProduct?.vendor_id || undefined,
      },
    });

    if (!paystackRes.status || !paystackRes.data) {
      return jsonResponse(
        { success: false, error: paystackRes.message || 'Paystack rejected transaction initialization.' },
        400
      );
    }

    return jsonResponse({
      success: true,
      message: 'Paystack checkout initialized.',
      authorization_url: paystackRes.data.authorization_url,
      access_code: paystackRes.data.access_code,
      reference: paystackRes.data.reference,
      amount,
      amountInKobo,
      currency: 'NGN',
      purpose,
      requested_role: requestedRole,
      productId: resolvedProduct?.id || null,
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || 'Payment initialization failed.' }, 500);
  }
}

/**
 * GET / POST /api/verify-payment & /api/payments/verify
 */
export async function handleVerifyPayment(request: Request, env: any): Promise<Response> {
  try {
    const secretKey = getPaystackSecretKey(env);
    if (!secretKey || !secretKey.startsWith('sk_live_')) {
      return jsonResponse({ success: false, error: 'Payment gateway LIVE secret key is not configured.' }, 503);
    }

    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    let authenticatedUid: string | null = null;
    if (authHeader) {
      const authResult = await verifyFirebaseToken(authHeader, env?.FIREBASE_PROJECT_ID || 'cdsure-c360f');
      if (!authResult.success || !authResult.user) {
        return jsonResponse({ success: false, error: authResult.error || 'Unauthorized user session.' }, 401);
      }
      authenticatedUid = authResult.user.uid;
    }

    const url = new URL(request.url);
    let reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    if (!reference && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      reference = body.reference || body.trxref;
    }

    if (!reference || !String(reference).trim()) {
      return jsonResponse({ success: false, error: 'Transaction reference is required.' }, 400);
    }
    reference = String(reference).trim();

    const db = env?.DB;
    const existingTx: any = db
      ? await db
          .prepare('SELECT id, user_id, email, product_id, amount, status, transaction_type FROM transactions WHERE reference = ?')
          .bind(reference)
          .first()
          .catch(() => null)
      : null;

    if (authenticatedUid && existingTx && existingTx.user_id && existingTx.user_id !== authenticatedUid) {
      return jsonResponse({ success: false, error: 'Forbidden: Transaction does not belong to your account.' }, 403);
    }

    const verifyRes = await verifyPaystackTransaction(secretKey, reference);
    if (!verifyRes.status || !verifyRes.data) {
      return jsonResponse(
        {
          success: false,
          status: 'failed',
          error: 'Payment not verified. Try again.',
        },
        400
      );
    }

    const pData = verifyRes.data;

    if (pData.reference !== reference) {
      return jsonResponse({ success: false, error: 'Payment not verified. Try again.' }, 400);
    }
    if (pData.domain && String(pData.domain).toLowerCase() !== 'live') {
      return jsonResponse({ success: false, status: 'failed', error: 'Test-mode transactions are rejected in LIVE production.' }, 400);
    }
    if (String(pData.currency).toUpperCase() !== 'NGN') {
      return jsonResponse({ success: false, error: `Invalid currency ${pData.currency}. Expected NGN.` }, 400);
    }

    const metadata = pData.metadata || {};
    const txOwnerId = existingTx?.user_id || metadata.userId || authenticatedUid;
    if (authenticatedUid && txOwnerId && txOwnerId !== authenticatedUid) {
      return jsonResponse({ success: false, error: 'Forbidden: Transaction ownership verification failed.' }, 403);
    }

    if (pData.status !== 'success') {
      if (db && existingTx && existingTx.status !== 'success') {
        const mappedStatus = pData.status === 'abandoned' ? 'abandoned' : 'failed';
        await db
          .prepare(`UPDATE transactions SET status = ?, gateway_response = ? WHERE reference = ?`)
          .bind(mappedStatus, pData.gateway_response || pData.status, reference)
          .run()
          .catch(() => {});
      }

      return jsonResponse(
        {
          success: false,
          status: pData.status,
          reference,
          error: 'Payment not verified. Try again.',
        },
        400
      );
    }

    const paidNaira = koboToNaira(pData.amount);
    const purpose =
      existingTx?.transaction_type ||
      metadata.purpose ||
      (reference.startsWith('CDSURE-') && !reference.startsWith('CDSURE-DEP') && !reference.startsWith('CDSURE-MKT')
        ? 'activation'
        : reference.includes('mkt')
        ? 'marketplace_purchase'
        : 'wallet_funding');

    const requestedRole = metadata.requested_role === 'employer' || metadata.role === 'employer' ? 'employer' : 'earner';

    let expectedNaira = existingTx?.amount
      ? Number(existingTx.amount)
      : metadata.expectedAmountNaira
      ? Number(metadata.expectedAmountNaira)
      : 0;

    if (purpose === 'activation' && expectedNaira <= 0) {
      const fees = await readD1FeeSettings(db);
      expectedNaira = requestedRole === 'employer' ? fees.employer_fee : fees.earner_fee;
    }

    if (expectedNaira > 0 && pData.amount < nairaToKobo(expectedNaira)) {
      return jsonResponse(
        {
          success: false,
          error: 'Payment not verified. Try again.',
        },
        400
      );
    }

    const nowIso = new Date().toISOString();
    const fulfillment = await markPaymentVerifiedInD1(db, {
      reference,
      userId: txOwnerId || authenticatedUid || 'unknown',
      email: existingTx?.email || pData.customer?.email || metadata.email || '',
      paidNaira,
      currency: pData.currency,
      purpose,
      requestedRole,
      productId: existingTx?.product_id || metadata.productId || null,
      productTitle: metadata.productTitle || null,
      category: metadata.category || null,
      vendorId: metadata.vendorId || null,
      gatewayResponse: pData.gateway_response || 'Approved',
      nowIso,
    });

    return jsonResponse({
      success: true,
      alreadyVerified: fulfillment.alreadyProcessed,
      message: fulfillment.alreadyProcessed
        ? 'Payment already verified.'
        : 'Payment verified directly with Paystack.',
      reference,
      amount: paidNaira,
      currency: pData.currency,
      status: 'success',
      payment_status: 'paid',
      purpose,
      role: fulfillment.role,
      user: fulfillment.user,
      productId: existingTx?.product_id || metadata.productId || null,
      delivered: Boolean(fulfillment.deliveryUrl),
      delivery_url: fulfillment.deliveryUrl || null,
      userId: txOwnerId || authenticatedUid,
      is_activated: fulfillment.is_activated,
      balance: fulfillment.balance,
      verified_at: nowIso,
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: 'Payment not verified. Try again.' }, 500);
  }
}

/**
 * POST /api/payments/webhook
 */
export async function handlePaystackWebhook(request: Request, env: any): Promise<Response> {
  try {
    const webhookSecret = getPaystackWebhookSecret(env);
    if (!webhookSecret || webhookSecret.includes('placeholder')) {
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const signature = request.headers.get('x-paystack-signature');
    const rawBody = await request.text();
    if (!rawBody) {
      return new Response('Empty body', { status: 400 });
    }

    const isValid = await verifyPaystackWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return new Response('Invalid webhook signature', { status: 401 });
    }

    const eventPayload: any = JSON.parse(rawBody);
    const eventType = eventPayload.event;
    const data = eventPayload.data;

    if (!data || !data.reference) {
      return jsonResponse({ status: true, message: 'No reference in payload; ignored.' }, 200);
    }

    const db = env?.DB;
    const reference = String(data.reference);
    const amountNaira = koboToNaira(data.amount || 0);
    const currency = String(data.currency || 'NGN').toUpperCase();
    const metadata = data.metadata || {};
    const nowIso = new Date().toISOString();

    if (db) {
      const existingEvent = await db
        .prepare('SELECT id FROM payment_events WHERE reference = ? AND event_type = ?')
        .bind(reference, eventType)
        .first()
        .catch(() => null);

      if (existingEvent) {
        return jsonResponse({ status: true, message: 'Webhook event already processed' }, 200);
      }

      await db
        .prepare(
          `INSERT OR IGNORE INTO payment_events (id, event_type, reference, user_id, amount, payload, processed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(makeId('evt'), eventType, reference, metadata.userId || 'unknown', amountNaira, rawBody, nowIso)
        .run()
        .catch(() => {});
    }

    if (eventType === 'charge.success' && currency === 'NGN') {
      const purpose =
        metadata.purpose ||
        (reference.startsWith('CDSURE-') && !reference.startsWith('CDSURE-DEP')
          ? 'activation'
          : 'wallet_funding');
      const requestedRole = metadata.requested_role === 'employer' || metadata.role === 'employer' ? 'employer' : 'earner';

      await markPaymentVerifiedInD1(db, {
        reference,
        userId: metadata.userId || 'unknown',
        email: data.customer?.email || metadata.email || '',
        paidNaira: amountNaira,
        currency,
        purpose,
        requestedRole,
        productId: metadata.productId || null,
        productTitle: metadata.productTitle || null,
        category: metadata.category || null,
        vendorId: metadata.vendorId || null,
        gatewayResponse: data.gateway_response || 'Approved via Webhook',
        nowIso,
      });
    }

    return jsonResponse({ status: true, message: 'Webhook processed successfully' }, 200);
  } catch {
    return new Response('Webhook processing error', { status: 500 });
  }
}
