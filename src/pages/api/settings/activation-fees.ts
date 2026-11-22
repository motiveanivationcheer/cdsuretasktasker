import type { APIRoute } from 'astro';
import { onRequestGet } from '../../../../functions/api/settings/activation-fees';
import { adaptPagesHandler } from '../../../server/pagesAdapter';

export const prerender = false;
export const GET: APIRoute = adaptPagesHandler(onRequestGet);
