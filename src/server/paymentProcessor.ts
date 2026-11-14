// Shared Server-Side Paystack Payment & Marketplace Fulfillment Processor
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

async function ensureD1User(db: any, userId: string, email: string, role: string = 'earner') {
  if (!db || !userId) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, name, email, role, balance, is_activated)
       VALUES (?, ?, ?, ?, 0, 0)`
    )
    .bind(userId, email?.split('@')[0] || 'Member', email || `${userId}@cdsure.user`, role)
    .run()
    .catch(() => {});
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
    productId?: string | null;
    productTitle?: string | null;
    category?: string | null;
    vendorId?: string | null;
    gatewayResponse: string;
    nowIso: string;
  }
): Promise<{ alreadyProcessed: boolean; balance?: number; is_activated?: number; deliveryUrl?: string }> {
  const {
    reference,
    userId,
    email,
    paidNaira,
    currency,
    purpose,
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
      deliveryUrl: productId ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}` : undefined,
    };
  }

  // Idempotency guard: check if transaction is already marked success
  const existingTx: any = await db
    .prepare('SELECT id, user_id, status, transaction_type, product_id, amount FROM transactions WHERE reference = ?')
    .bind(reference)
    .first()
    .catch(() => null);

  if (existingTx?.status === 'success') {
    const uRow: any = await db
      .prepare('SELECT balance, is_activated FROM users WHERE id = ?')
      .bind(existingTx.user_id || userId)
      .first()
      .catch(() => null);
    return {
      alreadyProcessed: true,
      balance: uRow ? Number(uRow.balance) : undefined,
      is_activated: uRow ? Number(uRow.is_activated) : undefined,
      deliveryUrl:
        existingTx.product_id || productId
          ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`
          : undefined,
    };
  }

  const effectiveUserId = existingTx?.user_id || userId;
  const effectiveProductId = existingTx?.product_id || productId || null;
  const effectivePurpose = existingTx?.transaction_type || purpose;
  const feeAmount = Math.round(paidNaira * 0.30 * 100) / 100;
  const netAmount = Math.round((paidNaira - feeAmount) * 100) / 100;

  await ensureD1User(db, effectiveUserId, email);

  // 1. Update or insert master transactions ledger
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paystack', 'success', ?, ?, ?, ?)`
      )
      .bind(
        makeId('tx'),
        reference,
        effectiveUserId,
        email,
        effectiveProductId,
        paidNaira,
        feeAmount,
        netAmount,
        currency,
        effectivePurpose,
        gatewayResponse,
        nowIso,
        nowIso
      )
      .run()
      .catch(() => {});
  }

  let isActivated: number | undefined;
  let deliveryUrl: string | undefined;

  // 2. Apply domain fulfillment strictly after verification
  if (effectivePurpose === 'activation') {
    isActivated = 1;
    await db
      .prepare(`UPDATE users SET is_activated = 1, activation_paid_at = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, nowIso, effectiveUserId)
      .run();

    await db
      .prepare(`UPDATE activation_payments SET status = 'success', gateway_response = ?, verified_at = ? WHERE reference = ?`)
      .bind(gatewayResponse, nowIso, reference)
      .run()
      .catch(() => {});

    await db
      .prepare(
        `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'fee', 'Account Activation via Paystack (30% Platform Charge)', 'completed', ?)`
      )
      .bind(makeId('wtx'), effectiveUserId, `${reference}_act`, paidNaira, feeAmount, nowIso)
      .run()
      .catch(() => {});
  } else if (effectivePurpose === 'wallet_funding' || effectivePurpose === 'deposit') {
    await db
      .prepare(`UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?`)
      .bind(netAmount, nowIso, effectiveUserId)
      .run();

    await db
      .prepare(
        `INSERT INTO wallets (user_id, balance, total_deposited, total_fees_paid, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           balance = balance + excluded.balance,
           total_deposited = total_deposited + excluded.total_deposited,
           total_fees_paid = total_fees_paid + excluded.total_fees_paid,
           updated_at = excluded.updated_at`
      )
      .bind(effectiveUserId, netAmount, paidNaira, feeAmount, nowIso)
      .run()
      .catch(() => {});

    await db
      .prepare(
        `INSERT OR IGNORE INTO wallet_transactions (id, user_id, reference, amount, fee_amount, net_amount, type, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'deposit', 'Wallet Funding via Paystack (30% CDSure Charge Deducted)', 'completed', ?)`
      )
      .bind(makeId('wtx'), effectiveUserId, reference, paidNaira, feeAmount, netAmount, nowIso)
      .run()
      .catch(() => {});
  }

  // 3. Marketplace product or subscription delivery
  if (effectiveProductId || effectivePurpose === 'marketplace_purchase' || effectivePurpose === 'subscription') {
    const product = effectiveProductId ? await resolveProductFromDbOrCatalog(db, effectiveProductId) : null;
    const resolvedTitle = product?.title || productTitle || 'CDSure Premium Package';
    const resolvedCategory = product?.category || category || (effectivePurpose === 'subscription' ? 'subscription' : 'digital_product');
    const resolvedVendorId = product?.vendor_id || vendorId || 'vendor_cdsure_official';
    const commRate = product?.commission_rate ?? 0.30;
    const platformFee = Math.round(paidNaira * commRate * 100) / 100;
    const vendorNet = Math.round((paidNaira - platformFee) * 100) / 100;
    deliveryUrl = `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`;

    // Unlock marketplace_orders row
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

    // Record vendor commission (idempotent by UNIQUE reference)
    await db
      .prepare(
        `INSERT OR IGNORE INTO vendor_commissions (id, order_id, reference, vendor_id, gross_amount, platform_fee, vendor_net, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'credited', ?)`
      )
      .bind(makeId('vcom'), reference, reference, resolvedVendorId, paidNaira, platformFee, vendorNet, nowIso)
      .run()
      .catch(() => {});

    // Activate subscription if subscription package
    if (effectivePurpose === 'subscription' || resolvedCategory === 'subscription') {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare(
          `INSERT OR IGNORE INTO subscriptions (id, reference, user_id, plan, amount, status, starts_at, expires_at, created_at)
           VALUES (?, ?, ?, 'pro', ?, 'active', ?, ?, ?)`
        )
        .bind(makeId('sub'), reference, effectiveUserId, paidNaira, nowIso, expiresAt, nowIso)
        .run()
        .catch(() => {});

      await db
        .prepare(`UPDATE users SET subscription_tier = 'pro', subscription_expires_at = ?, updated_at = ? WHERE id = ?`)
        .bind(expiresAt, nowIso, effectiveUserId)
        .run()
        .catch(() => {});
    }
  }

  const finalUser: any = await db
    .prepare('SELECT balance, is_activated FROM users WHERE id = ?')
    .bind(effectiveUserId)
    .first()
    .catch(() => null);

  return {
    alreadyProcessed: false,
    balance: finalUser ? Number(finalUser.balance) : undefined,
    is_activated: finalUser ? Number(finalUser.is_activated) : isActivated,
    deliveryUrl,
  };
}

/**
 * POST /api/payments/initialize
 */
export async function handleInitializePayment(request: Request, env: any): Promise<Response> {
  try {
    const secretKey = getPaystackSecretKey(env);
    if (!secretKey || secretKey.includes('placeholder')) {
      return jsonResponse({ success: false, error: 'Payment gateway is not configured on server.' }, 503);
    }

    // 1. Strictly authenticate Firebase user
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
    const role = body.role === 'employer' ? 'employer' : 'earner';
    const productId = body.productId ? String(body.productId).trim() : null;
    let purpose = String(body.purpose || (productId ? 'marketplace_purchase' : 'activation'));
    let amount = parseFloat(body.amount);
    let resolvedProduct: any = null;

    // 2. Validate Product & Amount strictly server-side using D1 / Authoritative Catalog
    if (productId) {
      resolvedProduct = await resolveProductFromDbOrCatalog(db, productId);
      if (!resolvedProduct) {
        return jsonResponse({ success: false, error: 'Selected marketplace product not found or inactive.' }, 404);
      }
      // Authoritative product price from D1/catalog overrides any client amount
      amount = resolvedProduct.price_ngn;
      purpose = resolvedProduct.category === 'subscription' ? 'subscription' : 'marketplace_purchase';
    } else if (purpose === 'activation') {
      amount = role === 'employer' ? 5000 : 1500;
    } else if (purpose === 'subscription') {
      amount = isNaN(amount) || amount < 3500 ? 3500 : amount;
    } else {
      if (isNaN(amount) || amount < 100) {
        return jsonResponse({ success: false, error: 'Minimum payment amount is ₦100.' }, 400);
      }
    }

    const reference = body.reference ? String(body.reference).trim() : generatePaystackReference(purpose);

    // Prevent duplicate reference reuse
    if (db) {
      const duplicate = await db
        .prepare('SELECT id, status FROM transactions WHERE reference = ?')
        .bind(reference)
        .first()
        .catch(() => null);
      if (duplicate) {
        return jsonResponse({ success: false, error: 'Duplicate order reference. Please start a fresh checkout.' }, 409);
      }
    }

    const amountInKobo = nairaToKobo(amount);
    const url = new URL(request.url);
    const origin = url.origin;
    const callbackUrl = body.callback_url || `${origin}/#verify-payment?reference=${encodeURIComponent(reference)}`;

    const metadata: Record<string, any> = {
      userId,
      email: userEmail,
      purpose,
      role,
      expectedAmountNaira: amount,
      productId: resolvedProduct?.id || undefined,
      productTitle: resolvedProduct?.title || undefined,
      category: resolvedProduct?.category || undefined,
      vendorId: resolvedProduct?.vendor_id || undefined,
      custom_fields: [
        { display_name: 'Platform', variable_name: 'platform', value: 'CDSure Tasks' },
        { display_name: 'User ID', variable_name: 'user_id', value: userId },
        { display_name: 'Purpose', variable_name: 'purpose', value: purpose },
      ],
    };

    const nowIso = new Date().toISOString();

    // 3. Persist pending records in D1 BEFORE calling Paystack
    if (db) {
      await ensureD1User(db, userId, userEmail, role);
      const feeAmount = Math.round(amount * 0.30 * 100) / 100;
      const netAmount = Math.round((amount - feeAmount) * 100) / 100;

      await db
        .prepare(
          `INSERT INTO transactions (id, reference, user_id, email, product_id, amount, fee_amount, net_amount, currency, payment_gateway, status, transaction_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'paystack', 'pending', ?, ?)`
        )
        .bind(makeId('tx'), reference, userId, userEmail, resolvedProduct?.id || null, amount, feeAmount, netAmount, purpose, nowIso)
        .run()
        .catch(() => {});

      if (purpose === 'activation') {
        await db
          .prepare(
            `INSERT INTO activation_payments (id, reference, user_id, email, amount, currency, payment_gateway, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'NGN', 'paystack', 'pending', ?)`
          )
          .bind(makeId('act'), reference, userId, userEmail, amount, nowIso)
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

    // 4. Initialize transaction directly with Paystack API
    const paystackRes = await initializePaystackTransaction(secretKey, {
      email: userEmail,
      amountInKobo,
      reference,
      callback_url: callbackUrl,
      metadata,
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
      productId: resolvedProduct?.id || null,
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || 'Payment initialization failed.' }, 500);
  }
}

/**
 * GET / POST /api/payments/verify
 */
export async function handleVerifyPayment(request: Request, env: any): Promise<Response> {
  try {
    const secretKey = getPaystackSecretKey(env);
    if (!secretKey || secretKey.includes('placeholder')) {
      return jsonResponse({ success: false, error: 'Payment gateway secret key is not configured.' }, 503);
    }

    // Check Firebase Auth if Authorization header is supplied
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

    // Ownership validation: ensure transaction belongs to authenticated user
    if (authenticatedUid && existingTx && existingTx.user_id && existingTx.user_id !== authenticatedUid) {
      return jsonResponse({ success: false, error: 'Forbidden: Transaction does not belong to your account.' }, 403);
    }

    // Verify directly with Paystack API
    const verifyRes = await verifyPaystackTransaction(secretKey, reference);
    if (!verifyRes.status || !verifyRes.data) {
      return jsonResponse(
        {
          success: false,
          status: 'failed',
          error: verifyRes.message || 'Transaction could not be verified with Paystack.',
        },
        400
      );
    }

    const pData = verifyRes.data;

    // Strictly verify reference match and currency === 'NGN'
    if (pData.reference !== reference) {
      return jsonResponse({ success: false, error: 'Transaction reference mismatch.' }, 400);
    }
    if (pData.domain && String(pData.domain).toLowerCase() !== 'live') {
      return jsonResponse({ success: false, status: 'failed', error: 'Test-mode transactions cannot be accepted in LIVE MODE.' }, 400);
    }
    if (String(pData.currency).toUpperCase() !== 'NGN') {
      return jsonResponse({ success: false, error: `Invalid currency ${pData.currency}. Expected NGN.` }, 400);
    }

    const metadata = pData.metadata || {};
    const txOwnerId = existingTx?.user_id || metadata.userId;
    if (authenticatedUid && txOwnerId && txOwnerId !== authenticatedUid) {
      return jsonResponse({ success: false, error: 'Forbidden: Transaction ownership verification failed.' }, 403);
    }

    // Handle failed / abandoned / cancelled status cleanly
    if (pData.status !== 'success') {
      if (db && existingTx && existingTx.status !== 'success') {
        const mappedStatus = pData.status === 'abandoned' ? 'abandoned' : 'failed';
        await db
          .prepare(`UPDATE transactions SET status = ?, gateway_response = ? WHERE reference = ?`)
          .bind(mappedStatus, pData.gateway_response || pData.status, reference)
          .run()
          .catch(() => {});
        await db
          .prepare(`UPDATE marketplace_orders SET status = 'failed', delivery_unlocked = 0 WHERE reference = ?`)
          .bind(reference)
          .run()
          .catch(() => {});
      }

      return jsonResponse(
        {
          success: false,
          status: pData.status,
          reference,
          error: `Payment ${pData.status}: ${pData.gateway_response || 'Transaction was not completed.'}`,
        },
        400
      );
    }

    // Amount check: paid kobo must be >= expected order amount
    const paidNaira = koboToNaira(pData.amount);
    const expectedNaira = existingTx?.amount
      ? Number(existingTx.amount)
      : metadata.expectedAmountNaira
      ? Number(metadata.expectedAmountNaira)
      : 0;

    if (expectedNaira > 0 && pData.amount < nairaToKobo(expectedNaira)) {
      return jsonResponse(
        {
          success: false,
          error: `Underpayment detected: expected ₦${expectedNaira}, received ₦${paidNaira}.`,
        },
        400
      );
    }

    const nowIso = new Date().toISOString();
    const purpose =
      existingTx?.transaction_type ||
      metadata.purpose ||
      (reference.includes('act') ? 'activation' : reference.includes('mkt') ? 'marketplace_purchase' : 'wallet_funding');

    const fulfillment = await markPaymentVerifiedInD1(db, {
      reference,
      userId: txOwnerId || authenticatedUid || 'unknown',
      email: existingTx?.email || pData.customer?.email || metadata.email || '',
      paidNaira,
      currency: pData.currency,
      purpose,
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
      purpose,
      productId: existingTx?.product_id || metadata.productId || null,
      delivered: Boolean(fulfillment.deliveryUrl),
      delivery_url: fulfillment.deliveryUrl || null,
      userId: txOwnerId || authenticatedUid,
      is_activated: fulfillment.is_activated,
      balance: fulfillment.balance,
      verified_at: nowIso,
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || 'Payment verification failed.' }, 500);
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

    // Strict HMAC SHA-512 signature check
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

    // Idempotency check in payment_events
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

    if (eventType === 'charge.success') {
      if (currency !== 'NGN') {
        return jsonResponse({ status: false, message: 'Unsupported currency' }, 400);
      }

      const purpose =
        metadata.purpose ||
        (reference.includes('act')
          ? 'activation'
          : reference.includes('mkt')
          ? 'marketplace_purchase'
          : reference.includes('sub')
          ? 'subscription'
          : 'wallet_funding');

      await markPaymentVerifiedInD1(db, {
        reference,
        userId: metadata.userId || 'unknown',
        email: data.customer?.email || metadata.email || '',
        paidNaira: amountNaira,
        currency,
        purpose,
        productId: metadata.productId || null,
        productTitle: metadata.productTitle || null,
        category: metadata.category || null,
        vendorId: metadata.vendorId || null,
        gatewayResponse: data.gateway_response || 'Approved via Webhook',
        nowIso,
      });
    } else if (eventType === 'charge.failed' && db) {
      await db
        .prepare(`UPDATE transactions SET status = 'failed', gateway_response = ? WHERE reference = ? AND status != 'success'`)
        .bind(data.gateway_response || 'Failed via Webhook', reference)
        .run()
        .catch(() => {});
      await db
        .prepare(`UPDATE marketplace_orders SET status = 'failed', delivery_unlocked = 0 WHERE reference = ? AND status != 'delivered'`)
        .bind(reference)
        .run()
        .catch(() => {});
    }

    return jsonResponse({ status: true, message: 'Webhook processed successfully' }, 200);
  } catch (err: any) {
    return new Response('Webhook processing error', { status: 500 });
  }
}
