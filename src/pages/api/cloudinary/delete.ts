import type { APIRoute } from 'astro';
import { handleDeleteCloudinaryImage, CLOUDINARY_CORS_HEADERS } from '../../../server/cloudinaryProcessor';

export const prerender = false;

function resolveServerEnv(locals: any): Record<string, any> {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  return {
    ...runtimeEnv,
    CLOUDINARY_CLOUD_NAME:
      runtimeEnv.CLOUDINARY_CLOUD_NAME ||
      procEnv.CLOUDINARY_CLOUD_NAME ||
      import.meta.env?.CLOUDINARY_CLOUD_NAME ||
      'yojvb8cn',
    CLOUDINARY_API_KEY:
      runtimeEnv.CLOUDINARY_API_KEY || procEnv.CLOUDINARY_API_KEY || import.meta.env?.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET:
      runtimeEnv.CLOUDINARY_API_SECRET || procEnv.CLOUDINARY_API_SECRET || import.meta.env?.CLOUDINARY_API_SECRET || '',
    FIREBASE_PROJECT_ID:
      runtimeEnv.FIREBASE_PROJECT_ID || procEnv.FIREBASE_PROJECT_ID || import.meta.env?.FIREBASE_PROJECT_ID || 'cdsure-c360f',
  };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: CLOUDINARY_CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  return handleDeleteCloudinaryImage(request, resolveServerEnv(locals));
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  return handleDeleteCloudinaryImage(request, resolveServerEnv(locals));
};
