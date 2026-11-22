// Official Paystack LIVE API Integration Helper for CDSure Tasks
// Endpoint: https://api.paystack.co
// SECURITY: LIVE keys ONLY (sk_live_). Never log or expose secret keys.

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
      requested_role?: 'earner' | 'employer';
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

export function nairaToKobo(naira: number): number {
  return Math.round(Number(naira) * 100);
}

export function koboToNaira(kobo: number): number {
  return Math.round((Number(kobo) / 100) * 100) / 100;
}

export function generatePaystackReference(purpose: string = 'tx', userId?: string): string {
  if (purpose === 'activation' && userId) {
    const cleanUid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'USER';
    return `CDSURE-${cleanUid}-${Date.now()}`;
  }
  const prefixMap: Record<string, string> = {
    activation: 'CDSURE',
    deposit: 'CDSURE-DEP',
    wallet_funding: 'CDSURE-DEP',
    subscription: 'CDSURE-SUB',
    marketplace_purchase: 'CDSURE-MKT',
  };
  const prefix = prefixMap[purpose] || 'CDSURE-PAY';
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${Date.now()}-${rand}`;
}

function isUsableLiveSecretKey(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const k = val.trim();
  if (!k || k.includes('placeholder') || k.includes('REPLACE_WITH')) return false;
  return k.startsWith('sk_live_');
}

/**
 * Resolves PAYSTACK_SECRET_KEY strictly from server runtime environment variables (LIVE sk_live_ only)
 */
export function getPaystackSecretKey(env?: any): string {
  const fromBinding = env?.PAYSTACK_SECRET_KEY;
  if (isUsableLiveSecretKey(fromBinding)) return fromBinding.trim();

  const fromProcess = typeof process !== 'undefined' ? process.env?.PAYSTACK_SECRET_KEY : '';
  if (isUsableLiveSecretKey(fromProcess)) return fromProcess.trim();

  return '';
}

export function getPaystackWebhookSecret(env?: any): string {
  const fromBinding = env?.PAYSTACK_WEBHOOK_SECRET;
  if (isUsableLiveSecretKey(fromBinding)) return fromBinding.trim();

  const fromProcess = typeof process !== 'undefined' ? process.env?.PAYSTACK_WEBHOOK_SECRET : '';
  if (isUsableLiveSecretKey(fromProcess)) return fromProcess.trim();

  return getPaystackSecretKey(env);
}

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
