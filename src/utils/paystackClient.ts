// Frontend-only Paystack LIVE configuration helper
// SECURITY: Reads ONLY public keys (PAYSTACK_PUBLIC_KEY or PUBLIC_PAYSTACK_PUBLIC_KEY). Never reference secret keys here.

const LIVE_PAYSTACK_PUBLIC_KEY = 'pk_live_d373a3e0e4c9f6ec3916d30de7a2dacd08b70d90';

export function getPaystackPublicKey(): string {
  const candidates = [
    import.meta.env.PAYSTACK_PUBLIC_KEY,
    import.meta.env.PUBLIC_PAYSTACK_PUBLIC_KEY,
  ];
  for (const raw of candidates) {
    const key = (raw || '').trim();
    if (key.startsWith('pk_live_') && !key.includes('REPLACE_WITH') && !key.includes('placeholder')) {
      return key;
    }
  }
  return LIVE_PAYSTACK_PUBLIC_KEY;
}

export function getPaystackMode(): 'live' | 'unconfigured' {
  return getPaystackPublicKey().startsWith('pk_live_') ? 'live' : 'unconfigured';
}

export function isPaystackPublicKeyConfigured(): boolean {
  return getPaystackPublicKey().startsWith('pk_live_');
}
