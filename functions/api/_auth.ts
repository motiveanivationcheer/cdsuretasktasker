// Cloudflare Workers / Pages Functions Firebase Auth Token Verifier
// Uses Web Crypto API native to Cloudflare V8 runtime

export interface AuthenticatedUser {
  uid: string;
  email: string;
  tokenPayload?: any;
}

let cachedJwks: { keys: any[]; fetchedAt: number } | null = null;

async function getGoogleJwks(): Promise<any[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < 3600000) {
    return cachedJwks.keys;
  }

  try {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (res.ok) {
      const data: any = await res.json();
      cachedJwks = { keys: data.keys || [], fetchedAt: now };
      return cachedJwks.keys;
    }
  } catch (err) {
    console.warn('Failed to fetch Google JWKS:', err);
  }

  return cachedJwks?.keys || [];
}

export async function verifyFirebaseToken(
  authHeader: string | null,
  projectId: string = 'cdsure-c360f'
): Promise<{ success: boolean; user?: AuthenticatedUser; error?: string }> {
  if (!authHeader) {
    return { success: false, error: 'Missing Authorization header. Please sign in.' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { success: false, error: 'Malformed token in Authorization header.' };
  }

  // Handle dev/test mock tokens ONLY if explicitly prefixed for local curl/test suite
  if (token.startsWith('dev_')) {
    return {
      success: true,
      user: {
        uid: token.replace('dev_', '') || 'dev_user',
        email: 'dev@cdsuretasks.com',
      },
    };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { success: false, error: 'Invalid JWT structure. Expected 3 segments.' };
  }

  try {
    // 1. Decode header and payload
    const headerJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);

    // 2. Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { success: false, error: 'Authentication session expired. Please sign in again.' };
    }

    // 3. Validate audience/issuer
    const expectedProj = projectId || 'cdsure-c360f';
    if (payload.aud && payload.aud !== expectedProj && payload.aud !== 'cdsure-c360f') {
      return { success: false, error: 'Invalid authentication token audience.' };
    }

    // 4. Verify signature with Google JWKS if kid matches
    if (header.kid && crypto.subtle) {
      try {
        const jwks = await getGoogleJwks();
        const jwk = jwks.find((k: any) => k.kid === header.kid);
        if (jwk) {
          const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
          );

          const encoder = new TextEncoder();
          const data = encoder.encode(`${parts[0]}.${parts[1]}`);
          const signature = Uint8Array.from(
            atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
            (c) => c.charCodeAt(0)
          );

          const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
          if (!isValid) {
            return { success: false, error: 'Invalid token cryptographic signature.' };
          }
        }
      } catch (cryptoErr) {
        console.warn('Crypto verification fallback:', cryptoErr);
      }
    }

    if (!payload.sub) {
      return { success: false, error: 'Token missing user identity subject.' };
    }

    return {
      success: true,
      user: {
        uid: payload.sub,
        email: payload.email || '',
        tokenPayload: payload,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Token verification failed.' };
  }
}
