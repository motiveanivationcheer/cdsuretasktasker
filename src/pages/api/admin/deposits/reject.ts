import type { APIRoute } from 'astro';
import { onRequestPost } from '../../../../../functions/api/admin/deposits/reject';
import { adaptPagesHandler } from '../../../../server/pagesAdapter';

export const prerender = false;
export const POST: APIRoute = adaptPagesHandler(onRequestPost);
