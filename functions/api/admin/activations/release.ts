// Cloudflare Pages Function: POST /api/admin/activations/release
// Developer Release Button endpoint: immediately marks payment as approved and unlocks user
import { onRequestPost as approvePost } from '../approve-payment';

export const onRequestPost = approvePost;
