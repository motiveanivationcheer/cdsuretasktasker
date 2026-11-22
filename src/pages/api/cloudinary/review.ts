import type { APIRoute } from 'astro';
import { handleReviewCloudinaryImage, CLOUDINARY_CORS_HEADERS } from '../../../server/cloudinaryProcessor';

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: CLOUDINARY_CORS_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = (locals as any)?.runtime?.env || {};
  return handleReviewCloudinaryImage(request, runtimeEnv);
};
