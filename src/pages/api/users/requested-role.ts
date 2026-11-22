import type { APIRoute } from 'astro';
import { onRequestOptions, onRequestPost } from '../../../../functions/api/users/requested-role';
import { adaptPagesHandler } from '../../../server/pagesAdapter';

export const prerender = false;
export const OPTIONS: APIRoute = adaptPagesHandler(onRequestOptions);
export const POST: APIRoute = adaptPagesHandler(onRequestPost);
