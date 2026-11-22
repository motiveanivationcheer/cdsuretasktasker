import {
  auth,
  firestoreDb,
  collection,
  addDoc,
  deleteDoc,
  doc,
} from '../firebase';

export type CloudinaryCategory =
  | 'profile-images'
  | 'task-screenshots'
  | 'verification'
  | 'payment-proofs'
  | 'campaign-images'
  | 'product-images'
  | 'support-attachments';

export type CloudinaryFolder =
  | CloudinaryCategory
  | 'task-proofs'
  | 'profiles'
  | 'marketplace-images';

export interface UploadedCloudinaryAsset {
  secure_url: string;
  public_id: string;
  category: CloudinaryCategory;
  folder: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  created_at: string;
  firestoreDocId?: string;
}

export interface UploadProofOptions {
  onProgress?: (percent: number) => void;
  relatedId?: string;
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORY_MAP: Record<string, CloudinaryCategory> = {
  'profile-images': 'profile-images',
  'cdsure/profile-images': 'profile-images',
  profiles: 'profile-images',
  'task-screenshots': 'task-screenshots',
  'cdsure/task-screenshots': 'task-screenshots',
  'task-proofs': 'task-screenshots',
  verification: 'verification',
  'cdsure/verification': 'verification',
  'payment-proofs': 'payment-proofs',
  'cdsure/payment-proofs': 'payment-proofs',
  'campaign-images': 'campaign-images',
  'cdsure/campaign-images': 'campaign-images',
  'product-images': 'product-images',
  'cdsure/product-images': 'product-images',
  'marketplace-images': 'product-images',
  'support-attachments': 'support-attachments',
  'cdsure/support-attachments': 'support-attachments',
};

export function normalizeCategory(input: CloudinaryFolder | string): CloudinaryCategory {
  return CATEGORY_MAP[String(input || '').trim().toLowerCase()] || 'task-screenshots';
}

export function validateImageFile(file: File): void {
  if (!file) {
    throw new Error('Please select an image file to upload.');
  }
  const normalizedType = (file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  const hasAllowedExt = ALLOWED_EXTENSIONS.has(ext);

  if (normalizedType && !ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error(`Invalid file format (${normalizedType}). Only JPG, JPEG, PNG, and WEBP images are allowed.`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(normalizedType) && !hasAllowedExt) {
    throw new Error('Only JPG, JPEG, PNG, and WEBP image files are allowed.');
  }
  if (file.size <= 0) {
    throw new Error('Selected file is empty.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image file size must be 10MB or smaller.');
  }
}

async function getFirebaseAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in before uploading images.');
  }
  return user.getIdToken();
}

/**
 * Uploads an image directly to Cloudinary using a backend-generated SHA-1 signature,
 * organizes it under `cdsure/<category>/`, records metadata in backend DB & Firestore,
 * and returns the full Cloudinary asset record (NO Base64 in Firestore, NO Firebase Storage).
 */
export async function uploadCloudinaryAsset(
  file: File,
  folderOrCategory: CloudinaryFolder | string,
  options?: UploadProofOptions
): Promise<UploadedCloudinaryAsset> {
  validateImageFile(file);

  const token = await getFirebaseAuthToken();
  const category = normalizeCategory(folderOrCategory);

  // 1. Request signed upload signature from backend (authenticates user + validates type/size)
  const signRes = await fetch('/api/cloudinary/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      category,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });

  const signData: any = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !signData?.success || !signData?.signature || !signData?.api_key) {
    throw new Error(
      signData?.error || `Could not authorize signed upload (HTTP ${signRes.status}).`
    );
  }

  const uploadUrl =
    signData.upload_url ||
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signData.cloud_name || 'yojvb8cn')}/image/upload`;

  // 2. Upload file directly to Cloudinary using signed params
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', String(signData.api_key));
  formData.append('timestamp', String(signData.timestamp));
  formData.append('signature', String(signData.signature));
  formData.append('folder', String(signData.folder));

  const uploadJson = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options?.onProgress) {
        const pct = Math.min(95, Math.round((event.loaded / event.total) * 95));
        options.onProgress(pct);
      }
    };

    xhr.onload = () => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed?.secure_url && parsed?.public_id) {
        resolve(parsed);
        return;
      }
      const msg =
        parsed?.error?.message ||
        parsed?.message ||
        `Cloudinary upload failed (HTTP ${xhr.status}). Please try again.`;
      reject(new Error(msg));
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading image to Cloudinary. Please check your connection and try again.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Image upload timed out. Please try again.'));
    };

    xhr.timeout = 60000;
    xhr.send(formData);
  });

  const secureUrl = String(uploadJson.secure_url);
  const publicId = String(uploadJson.public_id);
  const createdAt = uploadJson.created_at || new Date().toISOString();

  // 3. Persist metadata in backend database (D1/SQLite)
  await fetch('/api/cloudinary/record', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      category,
      folder: signData.folder,
      public_id: publicId,
      secure_url: secureUrl,
      format: uploadJson.format || '',
      bytes: uploadJson.bytes || file.size,
      width: uploadJson.width || 0,
      height: uploadJson.height || 0,
      related_id: options?.relatedId || null,
    }),
  }).catch(() => {});

  // 4. Persist Cloudinary image URL & public ID in Firebase Firestore (never Base64)
  let firestoreDocId: string | undefined;
  const uid = auth.currentUser?.uid;
  if (uid && !secureUrl.startsWith('data:')) {
    try {
      const docRef = await addDoc(collection(firestoreDb, 'cloudinary_images'), {
        userId: uid,
        userEmail: auth.currentUser?.email || '',
        category,
        folder: signData.folder,
        publicId,
        secureUrl,
        format: String(uploadJson.format || '').toLowerCase(),
        bytes: Number(uploadJson.bytes || file.size),
        width: Number(uploadJson.width || 0),
        height: Number(uploadJson.height || 0),
        status:
          category === 'profile-images' || category === 'campaign-images' || category === 'product-images'
            ? 'approved'
            : 'pending',
        relatedId: options?.relatedId || null,
        createdAt,
      });
      firestoreDocId = docRef.id;
    } catch (fsErr) {
      console.warn('[Firestore cloudinary_images metadata warning]', fsErr);
    }
  }

  if (options?.onProgress) options.onProgress(100);

  return {
    secure_url: secureUrl,
    public_id: publicId,
    category,
    folder: String(signData.folder),
    format: uploadJson.format,
    bytes: uploadJson.bytes || file.size,
    width: uploadJson.width,
    height: uploadJson.height,
    created_at: createdAt,
    firestoreDocId,
  };
}

/**
 * Deletes a previously uploaded Cloudinary asset securely via backend ownership check,
 * and removes its Firestore metadata doc if present.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  firestoreDocId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!publicId) return { success: false, error: 'Missing Cloudinary public ID.' };
  const token = await getFirebaseAuthToken();

  const res = await fetch('/api/cloudinary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ public_id: publicId }),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    return { success: false, error: data?.error || 'Could not delete image.' };
  }

  if (firestoreDocId) {
    await deleteDoc(doc(firestoreDb, 'cloudinary_images', firestoreDocId)).catch(() => {});
  }

  return { success: true };
}

/**
 * Backwards-compatible wrapper returning verified HTTPS `secure_url`.
 */
export async function uploadProof(
  file: File,
  folder: CloudinaryFolder | string,
  options?: UploadProofOptions
): Promise<string> {
  const asset = await uploadCloudinaryAsset(file, folder, options);
  return asset.secure_url;
}
