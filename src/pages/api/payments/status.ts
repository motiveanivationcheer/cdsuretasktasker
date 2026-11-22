import type { APIRoute } from 'astro';
import { onRequestGet, onRequestOptions } from '../../../../functions/api/payments/status';
import { adaptPagesHandler } from '../../../server/pagesAdapter';

export const prerender = false;
export const OPTIONS: APIRoute = adaptPagesHandler(onRequestOptions);
export const GET: APIRoute = adaptPagesHandler(onRequestGet);
