import type { APIRoute } from 'astro';
import { handleRecordCloudinaryImage, CLOUDINARY_CORS_HEADERS } from '../../../server/cloudinaryProcessor';

export const prerender = false;

function resolveServerEnv(locals: any): Record<string, any> {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  return {
    ...runtimeEnv,
    FIREBASE_PROJECT_ID:
      runtimeEnv.FIREBASE_PROJECT_ID || procEnv.FIREBASE_PROJECT_ID || import.meta.env?.FIREBASE_PROJECT_ID || 'cdsure-c360f',
  };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: CLOUDINARY_CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  return handleRecordCloudinaryImage(request, resolveServerEnv(locals));
};
