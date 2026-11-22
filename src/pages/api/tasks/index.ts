import type { APIRoute } from 'astro';
import { onRequestGet, onRequestPost } from '../../../../functions/api/tasks/index';
import { adaptPagesHandler } from '../../../server/pagesAdapter';

export const prerender = false;
export const GET: APIRoute = adaptPagesHandler(onRequestGet);
export const POST: APIRoute = adaptPagesHandler(onRequestPost);
