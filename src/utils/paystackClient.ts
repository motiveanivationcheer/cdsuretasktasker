// Frontend-only Paystack LIVE public configuration helper
// SECURITY: Uses import.meta.env ONLY (never process.env, never PAYSTACK_SECRET_KEY, never test keys).

const DEFAULT_PAYSTACK_PUBLIC_KEY = 'pk_live_d373a3e0e4c9f6ec3916d30de7a2dacd08b70d90';

function isUsableLivePublicKey(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const key = val.trim();
  if (!key || key.includes('REPLACE_WITH') || key.includes('placeholder')) return false;
  return key.startsWith('pk_live_');
}

export function getPaystackPublicKey(): string {
  const candidates = [
    import.meta.env.PUBLIC_PAYSTACK_PUBLIC_KEY,
    import.meta.env.PAYSTACK_PUBLIC_KEY,
  ];
  for (const raw of candidates) {
    if (isUsableLivePublicKey(raw)) {
      return raw.trim();
    }
  }
  return DEFAULT_PAYSTACK_PUBLIC_KEY;
}

export function getPaystackMode(): 'live' | 'unconfigured' {
  const k = getPaystackPublicKey();
  return k.startsWith('pk_live_') ? 'live' : 'unconfigured';
}

export function isPaystackPublicKeyConfigured(): boolean {
  return isUsableLivePublicKey(getPaystackPublicKey());
}
