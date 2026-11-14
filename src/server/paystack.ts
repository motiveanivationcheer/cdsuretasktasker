// Official Paystack API Integration Helper for CDSure Tasks & Premium Marketplace
// Endpoint: https://api.paystack.co
// SECURITY: Never log or expose secret keys.

export const PAYSTACK_API_BASE = 'https://api.paystack.co';

export type PaymentPurpose =
  | 'activation'
  | 'wallet_funding'
  | 'deposit'
  | 'subscription'
  | 'marketplace_purchase';

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: {
    id: number;
    domain: string;
    status: 'success' | 'failed' | 'abandoned' | 'reversed';
    reference: string;
    amount: number; // in kobo
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata?: {
      userId?: string;
      email?: string;
      purpose?: PaymentPurpose;
      productId?: string;
      productTitle?: string;
      category?: string;
      vendorId?: string;
      role?: 'earner' | 'employer';
      expectedAmountNaira?: number;
      [key: string]: any;
    };
    customer?: {
      id: number;
      email: string;
      customer_code: string;
    };
  };
}

/**
 * Converts Nigerian Naira to Kobo (1 NGN = 100 Kobo)
 */
export function nairaToKobo(naira: number): number {
  return Math.round(Number(naira) * 100);
}

/**
 * Converts Kobo to Nigerian Naira
 */
export function koboToNaira(kobo: number): number {
  return Math.round((Number(kobo) / 100) * 100) / 100;
}

/**
 * Generates a unique, traceable Paystack transaction reference
 */
export function generatePaystackReference(purpose: string = 'tx'): string {
  const prefixMap: Record<string, string> = {
    activation: 'cds_act',
    deposit: 'cds_wlt',
    wallet_funding: 'cds_wlt',
    subscription: 'cds_sub',
    marketplace_purchase: 'cds_mkt',
  };
  const prefix = prefixMap[purpose] || 'cds_pay';
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${rand}`;
}

function isUsableLiveSecret(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const k = val.trim();
  if (!k || k.includes('placeholder') || k.includes('REPLACE_WITH')) return false;
  if (k.startsWith('sk_test_')) return false;
  return k.startsWith('sk_live_');
}

/**
 * Resolves PAYSTACK_SECRET_KEY strictly from server runtime environment variables (LIVE keys only)
 */
export function getPaystackSecretKey(env?: any): string {
  const fromBinding = env?.PAYSTACK_SECRET_KEY;
  if (isUsableLiveSecret(fromBinding)) return fromBinding.trim();

  const fromProcess = typeof process !== 'undefined' ? process.env?.PAYSTACK_SECRET_KEY : '';
  if (isUsableLiveSecret(fromProcess)) return fromProcess.trim();

  return '';
}

/**
 * Resolves Paystack webhook verification key (PAYSTACK_WEBHOOK_SECRET or PAYSTACK_SECRET_KEY, LIVE only)
 */
export function getPaystackWebhookSecret(env?: any): string {
  const fromBinding = env?.PAYSTACK_WEBHOOK_SECRET;
  if (isUsableLiveSecret(fromBinding)) return fromBinding.trim();

  const fromProcess = typeof process !== 'undefined' ? process.env?.PAYSTACK_WEBHOOK_SECRET : '';
  if (isUsableLiveSecret(fromProcess)) return fromProcess.trim();

  return getPaystackSecretKey(env);
}

/**
 * Initialize a Paystack payment transaction (NGN -> Kobo)
 */
export async function initializePaystackTransaction(
  secretKey: string,
  params: {
    email: string;
    amountInKobo: number;
    reference: string;
    callback_url?: string;
    metadata?: Record<string, any>;
    channels?: string[];
  }
): Promise<PaystackInitResponse> {
  const payload = {
    email: params.email,
    amount: params.amountInKobo,
    currency: 'NGN',
    reference: params.reference,
    callback_url: params.callback_url,
    metadata: params.metadata || {},
    channels: params.channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
  };

  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data: any = await response.json().catch(() => ({
    status: false,
    message: 'Invalid response from Paystack gateway.',
  }));

  return data as PaystackInitResponse;
}

/**
 * Verify a Paystack transaction directly via official Paystack REST API
 */
export async function verifyPaystackTransaction(
  secretKey: string,
  reference: string
): Promise<PaystackVerifyResponse> {
  const response = await fetch(
    `${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data: any = await response.json().catch(() => ({
    status: false,
    message: 'Invalid response from Paystack verification endpoint.',
  }));

  return data as PaystackVerifyResponse;
}

/**
 * Verifies the HMAC SHA-512 signature sent by Paystack webhooks in `x-paystack-signature`.
 */
export async function verifyPaystackWebhookSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string
): Promise<boolean> {
  if (!signature || !secretKey || !rawBody) return false;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const bodyData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Constant-time string comparison
    const sigLower = signature.toLowerCase();
    if (computedHex.length !== sigLower.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHex.length; i++) {
      diff |= computedHex.charCodeAt(i) ^ sigLower.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}
