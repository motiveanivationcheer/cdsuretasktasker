// Server-Side Cloudinary Signed Upload, Validation & Asset Management Engine
// Works identically in Cloudflare Workers (V8 Web Crypto API) and Node.js.
// SECURITY: CLOUDINARY_API_SECRET is strictly server-only and NEVER returned to clients.

export const DEFAULT_CLOUDINARY_CLOUD_NAME = 'yojvb8cn';
export const MAX_CLOUDINARY_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export type CloudinaryCategory =
  | 'profile-images'
  | 'task-screenshots'
  | 'verification'
  | 'payment-proofs'
  | 'campaign-images'
  | 'product-images'
  | 'support-attachments';

export const CLOUDINARY_FOLDER_MAP: Record<CloudinaryCategory, string> = {
  'profile-images': 'cdsure/profile-images',
  'task-screenshots': 'cdsure/task-screenshots',
  verification: 'cdsure/verification',
  'payment-proofs': 'cdsure/payment-proofs',
  'campaign-images': 'cdsure/campaign-images',
  'product-images': 'cdsure/product-images',
  'support-attachments': 'cdsure/support-attachments',
};

const FOLDER_ALIASES: Record<string, CloudinaryCategory> = {
  'profile-images': 'profile-images',
  'cdsure/profile-images': 'profile-images',
  profiles: 'profile-images',
  profile: 'profile-images',
  avatar: 'profile-images',

  'task-screenshots': 'task-screenshots',
  'cdsure/task-screenshots': 'task-screenshots',
  'task-proofs': 'task-screenshots',
  'task-screenshot': 'task-screenshots',

  verification: 'verification',
  'cdsure/verification': 'verification',
  'verification-docs': 'verification',

  'payment-proofs': 'payment-proofs',
  'cdsure/payment-proofs': 'payment-proofs',
  'payment-proof': 'payment-proofs',

  'campaign-images': 'campaign-images',
  'cdsure/campaign-images': 'campaign-images',
  campaign: 'campaign-images',

  'product-images': 'product-images',
  'cdsure/product-images': 'product-images',
  'marketplace-images': 'product-images',
  marketplace: 'product-images',

  'support-attachments': 'support-attachments',
  'cdsure/support-attachments': 'support-attachments',
  support: 'support-attachments',
};

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export interface ResolvedCloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function isUsableCredential(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper.includes('YOUR_CLOUDINARY') ||
    upper.includes('REPLACE_WITH') ||
    upper.includes('PLACEHOLDER')
  ) {
    return false;
  }
  return true;
}

export function normalizeCloudinaryCategory(input?: string | null): CloudinaryCategory {
  const key = String(input || '').trim().toLowerCase();
  return FOLDER_ALIASES[key] || 'task-screenshots';
}

export function resolveCloudinaryFolder(input?: string | null): {
  category: CloudinaryCategory;
  folder: string;
} {
  const category = normalizeCloudinaryCategory(input);
  return {
    category,
    folder: CLOUDINARY_FOLDER_MAP[category],
  };
}

export function getCloudinaryConfig(env?: any): ResolvedCloudinaryConfig {
  const procEnv = typeof process !== 'undefined' ? process.env : {};

  const rawCloudName =
    env?.CLOUDINARY_CLOUD_NAME ||
    env?.PUBLIC_CLOUDINARY_CLOUD_NAME ||
    procEnv.CLOUDINARY_CLOUD_NAME ||
    procEnv.PUBLIC_CLOUDINARY_CLOUD_NAME ||
    import.meta.env?.CLOUDINARY_CLOUD_NAME ||
    import.meta.env?.PUBLIC_CLOUDINARY_CLOUD_NAME ||
    DEFAULT_CLOUDINARY_CLOUD_NAME;

  const rawApiKey =
    env?.CLOUDINARY_API_KEY ||
    procEnv.CLOUDINARY_API_KEY ||
    import.meta.env?.CLOUDINARY_API_KEY ||
    '';

  const rawApiSecret =
    env?.CLOUDINARY_API_SECRET ||
    procEnv.CLOUDINARY_API_SECRET ||
    import.meta.env?.CLOUDINARY_API_SECRET ||
    '';

  return {
    cloudName: isUsableCredential(rawCloudName)
      ? rawCloudName.trim()
      : DEFAULT_CLOUDINARY_CLOUD_NAME,
    apiKey: isUsableCredential(rawApiKey) ? rawApiKey.trim() : '',
    apiSecret: isUsableCredential(rawApiSecret) ? rawApiSecret.trim() : '',
  };
}

export function validateCloudinaryImageInput(params: {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}): { valid: boolean; error?: string } {
  const mime = String(params.fileType || '').trim().toLowerCase();
  const name = String(params.fileName || '').trim().toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';

  const mimeOk = mime ? ALLOWED_IMAGE_MIME_TYPES.has(mime) : false;
  const extOk = ext ? ALLOWED_IMAGE_EXTENSIONS.has(ext) : false;

  // Reject explicit disallowed MIME types even if extension looks right
  if (mime && !mimeOk) {
    return {
      valid: false,
      error: `Invalid file type (${mime}). Only JPG, JPEG, PNG, and WEBP images are allowed.`,
    };
  }
  if (!mimeOk && !extOk) {
    return {
      valid: false,
      error: 'Only JPG, JPEG, PNG, and WEBP image files are allowed.',
    };
  }

  const size = Number(params.fileSize);
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: 'Image file size must be greater than 0 bytes.' };
  }
  if (size > MAX_CLOUDINARY_FILE_SIZE_BYTES) {
    return { valid: false, error: 'Maximum upload size is 10MB.' };
  }

  return { valid: true };
}

export async function signCloudinaryParams(
  params: Record<string, string | number | undefined | null>,
  apiSecret: string
): Promise<string> {
  const entries = Object.entries(params)
    .filter(
      ([k, v]) =>
        v !== undefined &&
        v !== null &&
        String(v) !== '' &&
        !['file', 'cloud_name', 'resource_type', 'api_key', 'signature'].includes(k)
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);

  const stringToSign = `${entries.join('&')}${apiSecret}`;
  const data = new TextEncoder().encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function destroyCloudinaryAssetOnCloud(
  config: ResolvedCloudinaryConfig,
  publicId: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  if (!config.apiKey || !config.apiSecret) {
    return {
      success: false,
      error: 'Cloudinary API credentials are not configured on the backend.',
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signCloudinaryParams(
    {
      invalidate: 'true',
      public_id: publicId,
      timestamp,
    },
    config.apiSecret
  );

  const form = new URLSearchParams();
  form.set('public_id', publicId);
  form.set('timestamp', String(timestamp));
  form.set('api_key', config.apiKey);
  form.set('signature', signature);
  form.set('invalidate', 'true');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }
  );

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    return {
      success: false,
      error: data?.error?.message || `Cloudinary destroy failed (HTTP ${res.status}).`,
    };
  }

  return {
    success: true,
    result: data?.result || 'ok',
  };
}
