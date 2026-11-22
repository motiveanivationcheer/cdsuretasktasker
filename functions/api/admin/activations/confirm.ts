// Cloudflare Pages Function: POST /api/admin/activations/confirm
import { onRequestPost as approvePost } from '../approve-payment';

export const onRequestPost = approvePost;
