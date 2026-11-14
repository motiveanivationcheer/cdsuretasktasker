// Vite Dev Server Plugin: Runs live Paystack API integration & Cloudflare D1/R2 persistence in local dev
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { Plugin } from 'vite';

// Ensure stale test keys from host process.env are replaced by live keys in .env
try {
  const envPath = path.resolve('./.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    for (const key of ['PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET', 'PAYSTACK_PUBLIC_KEY', 'PUBLIC_PAYSTACK_PUBLIC_KEY']) {
      const cur = (process.env[key] || '').trim();
      if (!cur || cur.startsWith('sk_test_') || cur.startsWith('pk_test_') || cur.includes('placeholder') || cur.includes('REPLACE_WITH')) {
        if (parsed[key] && !parsed[key].startsWith('sk_test_') && !parsed[key].startsWith('pk_test_')) {
          process.env[key] = parsed[key].trim();
        } else {
          delete process.env[key];
        }
      }
    }
  }
} catch {}
import type { IncomingMessage, ServerResponse } from 'http';
import { verifyFirebaseToken } from './auth';
import {
  nairaToKobo,
  koboToNaira,
  generatePaystackReference,
  getPaystackSecretKey,
  getPaystackWebhookSecret,
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from './paystack';
import { MARKETPLACE_CATALOG, getCatalogProductById } from './marketplaceCatalog';

interface MemoryProof {
  id: string;
  userId: string;
  email: string;
  senderName: string;
  senderNumber: string;
  reference: string;
  amount: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  buffer: Buffer;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt: string;
}

interface MemoryUser {
  id: string;
  email: string;
  name: string;
  role: 'earner' | 'employer';
  is_activated: number;
  balance: number;
  total_fees_paid: number;
  total_deposited: number;
  activation_paid_at?: string;
  subscription_tier?: string;
  subscription_expires_at?: string;
}

const proofStore = new Map<string, MemoryProof>();
const userStore = new Map<string, MemoryUser>();
const transactionStore: any[] = [];
const orderStore = new Map<string, any>();
const vendorCommissionStore: any[] = [];
const paymentEventStore = new Map<string, any>();

// Seed default admin user
userStore.set('admin_001', {
  id: 'admin_001',
  email: 'admin@cdsure.com',
  name: 'CDSure Admin',
  role: 'employer',
  is_activated: 1,
  balance: 50000,
  total_fees_paid: 0,
  total_deposited: 50000,
});

function parseMultipartBody(req: IncomingMessage): Promise<{ fields: Record<string, string>; file?: { name: string; type: string; data: Buffer } }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const bodyBuffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) {
          // If not standard multipart boundary, try JSON
          try {
            const json = JSON.parse(bodyBuffer.toString('utf-8'));
            return resolve({ fields: json });
          } catch {
            return resolve({ fields: {} });
          }
        }

        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const boundaryBuffer = Buffer.from('--' + boundary);
        const endBoundaryBuffer = Buffer.from('--' + boundary + '--');

        const fields: Record<string, string> = {};
        let fileData: { name: string; type: string; data: Buffer } | undefined;

        // Split buffer by boundary
        let start = 0;
        while (start < bodyBuffer.length) {
          const bIdx = bodyBuffer.indexOf(boundaryBuffer, start);
          if (bIdx === -1) break;
          const nextBIdx = bodyBuffer.indexOf(boundaryBuffer, bIdx + boundaryBuffer.length);
          const partEnd = nextBIdx === -1 ? bodyBuffer.indexOf(endBoundaryBuffer, bIdx) : nextBIdx;
          if (partEnd === -1) break;

          const partBuffer = bodyBuffer.slice(bIdx + boundaryBuffer.length, partEnd);
          const headerEndIdx = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEndIdx !== -1) {
            const headerStr = partBuffer.slice(0, headerEndIdx).toString('utf-8');
            const dataBuffer = partBuffer.slice(headerEndIdx + 4, partBuffer.length - 2); // trim trailing \r\n

            const nameMatch = headerStr.match(/name="([^"]+)"/i);
            const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
            const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

            if (nameMatch) {
              const fieldName = nameMatch[1];
              if (filenameMatch) {
                fileData = {
                  name: filenameMatch[1],
                  type: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
                  data: dataBuffer,
                };
              } else {
                fields[fieldName] = dataBuffer.toString('utf-8');
              }
            }
          }

          start = nextBIdx === -1 ? bodyBuffer.length : nextBIdx;
        }

        resolve({ fields, file: fileData });
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

export function devApiPlugin(): Plugin {
  return {
    name: 'vite-dev-cloudflare-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const urlStr = req.url || '';
        const parsedUrl = new URL(urlStr, 'http://localhost:3000');
        const pathname = parsedUrl.pathname;
        const method = (req.method || 'GET').toUpperCase();

        if (method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.end();
          return;
        }

        // Only intercept /api routes
        if (!pathname.startsWith('/api/')) {
          return next();
        }

        try {
          // --- 1. POST /api/upload-proof ---
          if (pathname === '/api/upload-proof' && method === 'POST') {
            const { fields, file } = await parseMultipartBody(req);
            let fileBuffer: Buffer = file ? file.data : Buffer.alloc(0);
            let fileName = file ? file.name : 'proof.jpg';
            let fileType = file ? file.type : 'image/jpeg';
            let fileSize = fileBuffer.length;

            const senderName = fields.sender_name || fields.senderName || '';
            const senderNumber = fields.sender_number || fields.senderNumber || '';
            const reference = fields.reference || fields.txRef || '';
            const amount = parseFloat(fields.amount) || 1500;
            const userId = fields.user_id || fields.userId || 'demo_user';
            const userEmail = fields.email || 'user@cdsure.com';

            // Check if base64 upload
            if (fields.base64) {
              const raw = fields.base64.replace(/^data:[^;]+;base64,/, '');
              fileBuffer = Buffer.from(raw, 'base64');
              fileSize = fileBuffer.length;
              fileType = fields.contentType || 'image/jpeg';
              fileName = fields.fileName || 'proof.jpg';
            }

            if (fileSize === 0) {
              // Dev friendly mock buffer if empty file provided
              fileBuffer = Buffer.from('MOCK_SCREENSHOT_BINARY_DATA');
              fileSize = fileBuffer.length;
            }

            // Validate file size (max 5MB)
            if (fileSize > 5 * 1024 * 1024) {
              return sendJson(res, 400, {
                success: false,
                error: 'File size exceeds the 5MB limit. Please compress or select a smaller image.',
              });
            }

            // Check for duplicate reference
            if (reference.trim()) {
              for (const p of proofStore.values()) {
                if (p.reference === reference.trim() && p.userId !== userId) {
                  return sendJson(res, 409, {
                    success: false,
                    error: 'This transaction reference / session ID has already been submitted by another user.',
                  });
                }
              }
            }

            const proofId = 'prf_' + Math.random().toString(36).substring(2, 10);
            const nowIso = new Date().toISOString();
            const fileUrl = `/api/proof/${proofId}`;

            const proofRecord: MemoryProof = {
              id: proofId,
              userId,
              email: userEmail,
              senderName,
              senderNumber,
              reference,
              amount,
              fileName,
              fileType,
              fileSize,
              buffer: fileBuffer,
              status: 'pending',
              createdAt: nowIso,
            };

            proofStore.set(proofId, proofRecord);

            return sendJson(res, 200, {
              success: true,
              message: 'Payment proof submitted successfully. Status is now PENDING administrator verification.',
              proofId,
              fileUrl,
              status: 'pending',
              timestamp: nowIso,
            });
          }

          // --- 2. GET /api/my-proofs ---
          if (pathname === '/api/my-proofs' && method === 'GET') {
            const proofs = Array.from(proofStore.values()).map(p => ({
              id: p.id,
              reference: p.reference,
              amount: p.amount,
              file_url: `/api/proof/${p.id}`,
              file_type: p.fileType,
              file_size: p.fileSize,
              sender_name: p.senderName,
              sender_number: p.senderNumber,
              status: p.status,
              admin_note: p.adminNote,
              created_at: p.createdAt,
            }));
            return sendJson(res, 200, { success: true, proofs });
          }

          // --- 3. GET /api/proof/:id ---
          if (pathname.startsWith('/api/proof/') && method === 'GET') {
            const id = pathname.replace('/api/proof/', '');
            const proof = proofStore.get(id);
            if (proof && proof.buffer && proof.buffer.length > 0 && proof.buffer.toString() !== 'MOCK_SCREENSHOT_BINARY_DATA') {
              res.statusCode = 200;
              res.setHeader('Content-Type', proof.fileType || 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(proof.buffer);
              return;
            }

            // Return SVG placeholder proof receipt
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
              <rect width="600" height="400" fill="#f8fafc"/>
              <rect x="20" y="20" width="560" height="360" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
              <text x="300" y="140" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#7C3AED" text-anchor="middle">CDSure Tasks — Proof Receipt</text>
              <text x="300" y="180" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Proof ID: ${id}</text>
              <text x="300" y="215" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#0f172a" text-anchor="middle">Status: ${proof ? proof.status.toUpperCase() : 'PENDING'}</text>
              <rect x="200" y="260" width="200" height="42" rx="10" fill="#10b981"/>
              <text x="300" y="286" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">Verified Storage</text>
            </svg>`;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(svg);
            return;
          }

          // --- 4. POST /api/payment/submit & POST /api/activation/submit ---
          if ((pathname === '/api/payment/submit' || pathname === '/api/activation/submit') && method === 'POST') {
            const contentType = req.headers['content-type'] || '';
            let userId = 'demo_user';
            let email = 'user@cdsure.com';
            let amount = 1500;
            let senderName = '';
            let senderNumber = '';
            let reference = '';
            let proofImageUrl = '';
            let fileBuffer: Buffer = Buffer.alloc(0);

            if (contentType.includes('multipart/form-data')) {
              const { fields, file } = await parseMultipartBody(req);
              userId = fields.user_id || fields.userId || userId;
              email = fields.email || email;
              amount = parseFloat(fields.amount) || 1500;
              senderName = fields.sender_name || fields.senderName || '';
              senderNumber = fields.sender_number || fields.senderNumber || '';
              reference = fields.reference || fields.txRef || '';
              proofImageUrl = fields.proof_image || fields.proofImageUrl || '';
              if (file) {
                fileBuffer = file.data;
              }
            } else {
              const body = await parseJsonBody(req);
              userId = body.user_id || body.userId || userId;
              email = body.email || email;
              amount = body.amount || 1500;
              senderName = body.sender_name || body.senderName || '';
              senderNumber = body.sender_number || body.senderNumber || '';
              reference = body.reference || body.txRef || '';
              proofImageUrl = body.proof_image || body.proofImageUrl || '';
            }

            const proofId = 'prf_' + Math.random().toString(36).substring(2, 10);
            const nowIso = new Date().toISOString();
            if (!proofImageUrl) {
              proofImageUrl = `/api/proof/${proofId}`;
            }

            proofStore.set(proofId, {
              id: proofId,
              userId,
              email,
              senderName,
              senderNumber,
              reference: reference || `REF-${Date.now()}`,
              amount,
              fileName: 'screenshot.jpg',
              fileType: 'image/jpeg',
              fileSize: fileBuffer.length || 1024,
              buffer: fileBuffer,
              status: 'pending',
              createdAt: nowIso,
            });

            return sendJson(res, 200, {
              success: true,
              message: 'Payment Submitted - Waiting for Developer Confirmation. Do not pay again.',
              proofId,
              proof_image: proofImageUrl,
              status: 'pending',
              timestamp: nowIso,
            });
          }

          // --- 5. GET /api/payment/status & GET /api/activation/status/:userId ---
          if ((pathname === '/api/payment/status' || pathname.startsWith('/api/activation/status/')) && method === 'GET') {
            let targetUserId = parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('user_id');
            if (pathname.startsWith('/api/activation/status/')) {
              targetUserId = pathname.replace('/api/activation/status/', '');
            }

            // Find matching user or proofs
            const userProofs = Array.from(proofStore.values())
              .filter(p => !targetUserId || p.userId === targetUserId)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            const latestProof = userProofs[0];
            const isActivated = latestProof?.status === 'approved' ? 1 : 0;

            return sendJson(res, 200, {
              success: true,
              userId: targetUserId || 'user',
              is_activated: isActivated,
              role: 'earner',
              payment_status: latestProof ? latestProof.status : 'not_submitted',
              proof_image: latestProof ? `/api/proof/${latestProof.id}` : null,
              reference: latestProof?.reference || null,
              admin_note: latestProof?.adminNote || null,
              created_at: latestProof?.createdAt || null,
            });
          }

          // --- 6. Admin Actions: approve-payment, release, confirm ---
          if (
            (pathname === '/api/admin/approve-payment' ||
             pathname === '/api/admin/activations/approve' ||
             pathname === '/api/admin/activations/release' ||
             pathname === '/api/admin/activations/confirm') &&
            method === 'POST'
          ) {
            const body = await parseJsonBody(req);
            const { id, user_id } = body;
            const nowIso = new Date().toISOString();

            let targetItem = id ? proofStore.get(id) : null;
            if (!targetItem && user_id) {
              targetItem = Array.from(proofStore.values()).find(p => p.userId === user_id);
            }

            if (targetItem) {
              targetItem.status = 'approved';
              targetItem.adminNote = 'Approved by Administrator';
            }

            const amount = targetItem?.amount || 1500;
            const fee30 = Math.round(amount * 0.30 * 100) / 100;
            const net70 = Math.round((amount - fee30) * 100) / 100;

            transactionStore.push({
              id: 'tx_' + Math.random().toString(36).substring(2, 10),
              userId: user_id || targetItem?.userId,
              type: 'activation_fee',
              amount,
              feeAmount: fee30,
              status: 'completed',
              createdAt: nowIso,
            });

            return sendJson(res, 200, {
              success: true,
              message: 'Payment approved successfully. Earner account is now ACTIVATED.',
              status: 'approved',
              fee_amount: fee30,
              net_amount: net70,
            });
          }

          // --- 7. Admin Actions: reject-payment & reject ---
          if (
            (pathname === '/api/admin/reject-payment' ||
             pathname === '/api/admin/activations/reject') &&
            method === 'POST'
          ) {
            const body = await parseJsonBody(req);
            const { id, user_id, reason } = body;
            const note = reason || 'Payment proof could not be verified.';

            let targetItem = id ? proofStore.get(id) : null;
            if (!targetItem && user_id) {
              targetItem = Array.from(proofStore.values()).find(p => p.userId === user_id);
            }

            if (targetItem) {
              targetItem.status = 'rejected';
              targetItem.adminNote = note;
            }

            return sendJson(res, 200, {
              success: true,
              message: 'Payment rejected. Earner can re-upload.',
              status: 'rejected',
              reason: note,
            });
          }

          // --- 8. GET /api/admin/activations ---
          if (pathname === '/api/admin/activations' && method === 'GET') {
            const statusFilter = parsedUrl.searchParams.get('status');
            const roleFilter = parsedUrl.searchParams.get('role');
            const search = parsedUrl.searchParams.get('search');

            const list: any[] = [];
            const seenRefs = new Set<string>();

            // 1. Transaction store entries (Paystack)
            for (const t of transactionStore) {
              if (t.reference && !seenRefs.has(t.reference)) {
                seenRefs.add(t.reference);
                const targetU = userStore.get(t.userId);
                list.push({
                  id: t.id,
                  user_id: t.userId,
                  email: t.email || targetU?.email || 'user@cdsure.com',
                  amount: t.amount,
                  fee_amount: t.feeAmount,
                  net_amount: t.netAmount,
                  currency: t.currency || 'NGN',
                  payment_gateway: t.payment_gateway || 'paystack',
                  status: t.status === 'success' ? 'released' : t.status,
                  created_at: t.created_at,
                  verified_at: t.verified_at,
                  reference: t.reference,
                  transaction_type: t.transaction_type || 'activation',
                  user_name: targetU?.name || t.email?.split('@')[0] || 'Member',
                  user_role: targetU?.role || 'earner',
                  is_activated: targetU?.is_activated || 0,
                  proof_image: null,
                });
              }
            }

            // 2. Proof store entries
            for (const p of Array.from(proofStore.values())) {
              if (p.reference && !seenRefs.has(p.reference)) {
                seenRefs.add(p.reference);
                list.push({
                  id: p.id,
                  user_id: p.userId,
                  email: p.email,
                  amount: p.amount,
                  proof_image: `/api/proof/${p.id}`,
                  proofImageUrl: `/api/proof/${p.id}`,
                  status: p.status,
                  admin_note: p.adminNote,
                  created_at: p.createdAt,
                  sender_name: p.senderName,
                  sender_number: p.senderNumber,
                  reference: p.reference,
                  payment_gateway: 'Paystack',
                  user_name: p.senderName || 'Earner User',
                  user_role: 'earner',
                  is_activated: p.status === 'approved' ? 1 : 0,
                });
              }
            }

            let filtered = list;
            if (statusFilter && statusFilter !== 'all') {
              filtered = filtered.filter(item => item.status === statusFilter);
            }
            if (roleFilter && roleFilter !== 'all') {
              filtered = filtered.filter(item => item.user_role === roleFilter);
            }
            if (search && search.trim()) {
              const q = search.trim().toLowerCase();
              filtered = filtered.filter(item =>
                (item.email && item.email.toLowerCase().includes(q)) ||
                (item.user_name && item.user_name.toLowerCase().includes(q)) ||
                (item.reference && item.reference.toLowerCase().includes(q))
              );
            }

            return sendJson(res, 200, { success: true, activations: filtered, transactions: filtered });
          }

          // --- Marketplace 1: GET /api/marketplace/products ---
          if (pathname === '/api/marketplace/products' && method === 'GET') {
            const authHeader = (req.headers.authorization || req.headers.Authorization || null) as string | null;
            let authUid: string | null = null;
            if (authHeader) {
              const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f');
              if (authRes.success && authRes.user) {
                authUid = authRes.user.uid;
              }
            }
            const userOrders = authUid
              ? Array.from(orderStore.values()).filter(o => o.user_id === authUid)
              : [];

            return sendJson(res, 200, {
              success: true,
              products: MARKETPLACE_CATALOG,
              orders: userOrders,
            });
          }

          // --- Marketplace 2: GET /api/marketplace/deliver ---
          if (pathname === '/api/marketplace/deliver' && method === 'GET') {
            const authHeader = (req.headers.authorization || req.headers.Authorization || null) as string | null;
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f');
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: 'Authentication required to access product delivery.' });
            }

            const reference = parsedUrl.searchParams.get('reference');
            const productId = parsedUrl.searchParams.get('productId');

            let order: any = null;
            if (reference) {
              const o = orderStore.get(reference);
              if (o && o.user_id === authRes.user.uid && o.delivery_unlocked === 1) {
                order = o;
              }
            } else if (productId) {
              order = Array.from(orderStore.values()).find(
                o => o.product_id === productId && o.user_id === authRes.user.uid && o.delivery_unlocked === 1
              );
            }

            if (!order) {
              return sendJson(res, 403, {
                success: false,
                error: 'Access Denied: Product delivery is locked until Paystack verification succeeds.',
              });
            }

            const product = getCatalogProductById(order.product_id);
            return sendJson(res, 200, {
              success: true,
              delivered: true,
              reference: order.reference,
              product: {
                id: order.product_id,
                title: order.product_title,
                category: order.category,
                delivery_type: product?.delivery_type || 'download',
                r2_file_key: product?.r2_file_key || null,
                vendor_name: product?.vendor_name || 'CDSure Official',
              },
              accessPayload: {
                licenseKey: `CDSURE-${String(order.reference).toUpperCase()}`,
                unlockedAt: order.verified_at,
                instructions:
                  product?.delivery_type === 'subscription'
                    ? 'Your CDSure VIP Pro 30-Day Priority Pass is active across your account.'
                    : 'Your digital package has been verified via Paystack and unlocked for download & access.',
              },
            });
          }

          // --- Paystack 1: POST /api/payments/initialize (REAL Paystack API) ---
          if (pathname === '/api/payments/initialize' && method === 'POST') {
            const secretKey = getPaystackSecretKey();
            if (!secretKey || secretKey.includes('placeholder')) {
              return sendJson(res, 503, { success: false, error: 'Paystack secret key is not configured on server.' });
            }

            const authHeader = (req.headers.authorization || req.headers.Authorization || null) as string | null;
            const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f');
            if (!authRes.success || !authRes.user) {
              return sendJson(res, 401, { success: false, error: authRes.error || 'Unauthorized: Sign-in required.' });
            }

            const userId = authRes.user.uid;
            const body = await parseJsonBody(req);
            const userEmail = authRes.user.email || body.email;
            if (!userEmail || !String(userEmail).includes('@')) {
              return sendJson(res, 400, { success: false, error: 'Valid email is required for Paystack payment.' });
            }

            const role = body.role === 'employer' ? 'employer' : 'earner';
            const productId = body.productId ? String(body.productId).trim() : null;
            let purpose = String(body.purpose || (productId ? 'marketplace_purchase' : 'activation'));
            let amount = parseFloat(body.amount);
            let resolvedProduct = productId ? getCatalogProductById(productId) : undefined;

            if (productId) {
              if (!resolvedProduct) {
                return sendJson(res, 404, { success: false, error: 'Selected marketplace product not found.' });
              }
              amount = resolvedProduct.price_ngn;
              purpose = resolvedProduct.category === 'subscription' ? 'subscription' : 'marketplace_purchase';
            } else if (purpose === 'activation') {
              amount = role === 'employer' ? 5000 : 1500;
            } else if (purpose === 'subscription') {
              amount = isNaN(amount) || amount < 3500 ? 3500 : amount;
            } else {
              if (isNaN(amount) || amount < 100) {
                return sendJson(res, 400, { success: false, error: 'Minimum payment amount is ₦100.' });
              }
            }

            const reference = body.reference ? String(body.reference).trim() : generatePaystackReference(purpose);
            if (transactionStore.some(t => t.reference === reference)) {
              return sendJson(res, 409, { success: false, error: 'Duplicate order reference.' });
            }

            const amountInKobo = nairaToKobo(amount);
            const origin = `http://${req.headers.host || 'localhost:3000'}`;
            const callbackUrl = body.callback_url || `${origin}/#verify-payment?reference=${encodeURIComponent(reference)}`;
            const nowIso = new Date().toISOString();

            const feeAmount = Math.round(amount * 0.30 * 100) / 100;
            const netAmount = Math.round((amount - feeAmount) * 100) / 100;

            transactionStore.unshift({
              id: 'tx_' + Math.random().toString(36).substring(2, 10),
              reference,
              userId,
              email: userEmail,
              product_id: resolvedProduct?.id || null,
              amount,
              feeAmount,
              netAmount,
              currency: 'NGN',
              payment_gateway: 'paystack',
              status: 'pending',
              transaction_type: purpose,
              created_at: nowIso,
            });

            if (resolvedProduct) {
              orderStore.set(reference, {
                id: 'ord_' + Math.random().toString(36).substring(2, 10),
                reference,
                user_id: userId,
                email: userEmail,
                product_id: resolvedProduct.id,
                product_title: resolvedProduct.title,
                category: resolvedProduct.category,
                amount,
                platform_fee: feeAmount,
                vendor_amount: netAmount,
                vendor_id: resolvedProduct.vendor_id,
                status: 'pending',
                delivery_unlocked: 0,
                created_at: nowIso,
              });
            }

            const paystackRes = await initializePaystackTransaction(secretKey, {
              email: userEmail,
              amountInKobo,
              reference,
              callback_url: callbackUrl,
              metadata: {
                userId,
                email: userEmail,
                purpose,
                role,
                expectedAmountNaira: amount,
                productId: resolvedProduct?.id,
                productTitle: resolvedProduct?.title,
                category: resolvedProduct?.category,
                vendorId: resolvedProduct?.vendor_id,
              },
            });

            if (!paystackRes.status || !paystackRes.data) {
              return sendJson(res, 400, {
                success: false,
                error: paystackRes.message || 'Paystack transaction initialization failed.',
              });
            }

            return sendJson(res, 200, {
              success: true,
              message: 'Paystack checkout initialized.',
              authorization_url: paystackRes.data.authorization_url,
              access_code: paystackRes.data.access_code,
              reference: paystackRes.data.reference,
              amount,
              amountInKobo,
              currency: 'NGN',
              purpose,
              productId: resolvedProduct?.id || null,
            });
          }

          // --- Paystack 2: GET/POST /api/payments/verify (REAL Paystack Verification) ---
          if ((pathname === '/api/payments/verify') && (method === 'GET' || method === 'POST')) {
            const secretKey = getPaystackSecretKey();
            if (!secretKey || secretKey.includes('placeholder')) {
              return sendJson(res, 503, { success: false, error: 'Paystack secret key not configured.' });
            }

            const authHeader = (req.headers.authorization || req.headers.Authorization || null) as string | null;
            let authUid: string | null = null;
            if (authHeader) {
              const authRes = await verifyFirebaseToken(authHeader, 'cdsure-c360f');
              if (!authRes.success || !authRes.user) {
                return sendJson(res, 401, { success: false, error: authRes.error || 'Unauthorized.' });
              }
              authUid = authRes.user.uid;
            }

            let reference = parsedUrl.searchParams.get('reference') || parsedUrl.searchParams.get('trxref');
            if (!reference && method === 'POST') {
              const b = await parseJsonBody(req);
              reference = b.reference || b.trxref;
            }

            if (!reference) {
              return sendJson(res, 400, { success: false, error: 'Transaction reference is required.' });
            }

            const tx = transactionStore.find(t => t.reference === reference);
            if (authUid && tx && tx.userId && tx.userId !== authUid) {
              return sendJson(res, 403, { success: false, error: 'Forbidden: Transaction does not belong to you.' });
            }

            const verifyRes = await verifyPaystackTransaction(secretKey, reference);
            if (!verifyRes.status || !verifyRes.data) {
              return sendJson(res, 400, {
                success: false,
                status: 'failed',
                error: verifyRes.message || 'Transaction not found or verification failed on Paystack.',
              });
            }

            const pData = verifyRes.data;
            if (pData.reference !== reference) {
              return sendJson(res, 400, { success: false, error: 'Reference mismatch.' });
            }
            if (pData.domain && String(pData.domain).toLowerCase() !== 'live') {
              return sendJson(res, 400, { success: false, status: 'failed', error: 'Test-mode transactions cannot be accepted in LIVE MODE.' });
            }
            if (String(pData.currency).toUpperCase() !== 'NGN') {
              return sendJson(res, 400, { success: false, error: `Invalid currency ${pData.currency}.` });
            }

            const metadata = pData.metadata || {};
            const targetUserId = tx?.userId || metadata.userId || authUid || 'unknown';
            if (authUid && targetUserId !== 'unknown' && targetUserId !== authUid) {
              return sendJson(res, 403, { success: false, error: 'Forbidden: User ownership mismatch.' });
            }

            if (pData.status !== 'success') {
              if (tx && tx.status !== 'success') {
                tx.status = pData.status === 'abandoned' ? 'abandoned' : 'failed';
                tx.gateway_response = pData.gateway_response || pData.status;
              }
              const ord = orderStore.get(reference);
              if (ord && ord.status !== 'delivered') {
                ord.status = 'failed';
                ord.delivery_unlocked = 0;
              }
              return sendJson(res, 400, {
                success: false,
                status: pData.status,
                reference,
                error: `Payment ${pData.status}: ${pData.gateway_response || 'Transaction was not completed.'}`,
              });
            }

            const paidNaira = koboToNaira(pData.amount);
            const expectedNaira = tx?.amount ? Number(tx.amount) : Number(metadata.expectedAmountNaira || 0);
            if (expectedNaira > 0 && pData.amount < nairaToKobo(expectedNaira)) {
              return sendJson(res, 400, { success: false, error: 'Underpayment detected.' });
            }

            const nowIso = new Date().toISOString();
            const alreadyVerified = tx?.status === 'success';
            const purpose =
              tx?.transaction_type ||
              metadata.purpose ||
              (reference.includes('act') ? 'activation' : reference.includes('mkt') ? 'marketplace_purchase' : 'wallet_funding');
            const productId = tx?.product_id || metadata.productId || null;
            const feeAmount = Math.round(paidNaira * 0.30 * 100) / 100;
            const netAmount = Math.round((paidNaira - feeAmount) * 100) / 100;

            const u: MemoryUser = userStore.get(targetUserId) || {
              id: targetUserId,
              email: tx?.email || pData.customer?.email || 'user@cdsure.com',
              name: 'CDSure Member',
              role: 'earner',
              is_activated: 0,
              balance: 0,
              total_fees_paid: 0,
              total_deposited: 0,
              activation_paid_at: undefined,
            };

            if (!alreadyVerified) {
              if (tx) {
                tx.status = 'success';
                tx.verified_at = nowIso;
                tx.gateway_response = pData.gateway_response || 'Successful';
              } else {
                transactionStore.unshift({
                  id: 'tx_' + Math.random().toString(36).substring(2, 10),
                  reference,
                  userId: targetUserId,
                  email: pData.customer?.email || '',
                  product_id: productId,
                  amount: paidNaira,
                  feeAmount,
                  netAmount,
                  currency: 'NGN',
                  payment_gateway: 'paystack',
                  status: 'success',
                  transaction_type: purpose,
                  created_at: nowIso,
                  verified_at: nowIso,
                });
              }

              if (purpose === 'activation') {
                u.is_activated = 1;
                u.activation_paid_at = nowIso;
                u.total_fees_paid = (u.total_fees_paid || 0) + feeAmount;
              } else if (purpose === 'wallet_funding' || purpose === 'deposit') {
                u.balance = (u.balance || 0) + netAmount;
                u.total_deposited = (u.total_deposited || 0) + paidNaira;
                u.total_fees_paid = (u.total_fees_paid || 0) + feeAmount;
              }

              if (productId || purpose === 'marketplace_purchase' || purpose === 'subscription') {
                const product = productId ? getCatalogProductById(productId) : undefined;
                const deliveryUrl = `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`;
                const existingOrd = orderStore.get(reference);
                orderStore.set(reference, {
                  ...(existingOrd || {}),
                  id: existingOrd?.id || 'ord_' + Math.random().toString(36).substring(2, 10),
                  reference,
                  user_id: targetUserId,
                  email: u.email,
                  product_id: productId || 'prod_sub_pro',
                  product_title: product?.title || metadata.productTitle || 'CDSure Package',
                  category: product?.category || metadata.category || 'digital_product',
                  amount: paidNaira,
                  platform_fee: feeAmount,
                  vendor_amount: netAmount,
                  vendor_id: product?.vendor_id || 'vendor_cdsure_official',
                  status: 'delivered',
                  delivery_unlocked: 1,
                  download_url: deliveryUrl,
                  created_at: existingOrd?.created_at || nowIso,
                  verified_at: nowIso,
                });
                vendorCommissionStore.push({
                  id: 'vcom_' + Math.random().toString(36).substring(2, 8),
                  reference,
                  vendor_id: product?.vendor_id || 'vendor_cdsure_official',
                  gross_amount: paidNaira,
                  platform_fee: feeAmount,
                  vendor_net: netAmount,
                  created_at: nowIso,
                });
                if (purpose === 'subscription' || product?.category === 'subscription') {
                  u.subscription_tier = 'pro';
                  u.subscription_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                }
              }

              userStore.set(targetUserId, u);
            }

            return sendJson(res, 200, {
              success: true,
              alreadyVerified,
              message: alreadyVerified ? 'Payment already verified.' : 'Payment verified directly with Paystack.',
              reference,
              amount: paidNaira,
              currency: pData.currency,
              status: 'success',
              purpose,
              productId,
              delivered: Boolean(productId),
              delivery_url: productId ? `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}` : null,
              userId: targetUserId,
              is_activated: u.is_activated,
              balance: u.balance,
              verified_at: nowIso,
            });
          }

          // --- Paystack 3: POST /api/payments/webhook (Strict HMAC Signature Verification) ---
          if (pathname === '/api/payments/webhook' && method === 'POST') {
            const webhookSecret = getPaystackWebhookSecret();
            if (!webhookSecret || webhookSecret.includes('placeholder')) {
              res.statusCode = 500;
              res.end('Webhook secret not configured');
              return;
            }

            const signature = (req.headers['x-paystack-signature'] || null) as string | null;
            const rawBody = await parseRawBody(req);
            const isValid = await verifyPaystackWebhookSignature(rawBody, signature, webhookSecret);
            if (!isValid) {
              res.statusCode = 401;
              res.end('Invalid webhook signature');
              return;
            }

            const body = JSON.parse(rawBody);
            const eventType = body.event;
            const data = body.data;
            const reference = data?.reference;
            const nowIso = new Date().toISOString();

            if (reference && paymentEventStore.has(`${eventType}:${reference}`)) {
              return sendJson(res, 200, { status: true, message: 'Webhook event already processed' });
            }
            if (reference) {
              paymentEventStore.set(`${eventType}:${reference}`, { eventType, reference, processedAt: nowIso });
            }

            if (eventType === 'charge.success' && data && reference) {
              const currency = String(data.currency || 'NGN').toUpperCase();
              if (currency !== 'NGN') {
                return sendJson(res, 400, { status: false, message: 'Unsupported currency' });
              }

              let tx = transactionStore.find(t => t.reference === reference);
              const amountNaira = koboToNaira(data.amount || 0);
              const metadata = data.metadata || {};
              const expectedNaira = tx?.amount ? Number(tx.amount) : Number(metadata.expectedAmountNaira || 0);
              if (expectedNaira > 0 && Number(data.amount || 0) < nairaToKobo(expectedNaira)) {
                return sendJson(res, 400, { status: false, message: 'Underpayment detected' });
              }

              if (!tx || tx.status !== 'success') {
                const targetUserId = tx?.userId || metadata.userId || 'unknown';
                const purpose = tx?.transaction_type || metadata.purpose || 'wallet_funding';
                const productId = tx?.product_id || metadata.productId || null;
                const feeAmount = Math.round(amountNaira * 0.30 * 100) / 100;
                const netAmount = Math.round((amountNaira - feeAmount) * 100) / 100;

                if (tx) {
                  tx.status = 'success';
                  tx.verified_at = nowIso;
                  tx.gateway_response = data.gateway_response || 'Approved via Webhook';
                } else {
                  transactionStore.unshift({
                    id: 'tx_' + Math.random().toString(36).substring(2, 10),
                    reference,
                    userId: targetUserId,
                    email: data.customer?.email || metadata.email || '',
                    product_id: productId,
                    amount: amountNaira,
                    feeAmount,
                    netAmount,
                    currency: 'NGN',
                    payment_gateway: 'paystack',
                    status: 'success',
                    transaction_type: purpose,
                    created_at: nowIso,
                    verified_at: nowIso,
                  });
                }

                const u: MemoryUser = userStore.get(targetUserId) || {
                  id: targetUserId,
                  email: tx?.email || data.customer?.email || metadata.email || 'user@cdsure.com',
                  name: 'CDSure Member',
                  role: metadata.role === 'employer' ? 'employer' : 'earner',
                  is_activated: 0,
                  balance: 0,
                  total_fees_paid: 0,
                  total_deposited: 0,
                  activation_paid_at: undefined,
                };

                if (purpose === 'activation') {
                  u.is_activated = 1;
                  u.activation_paid_at = nowIso;
                  u.total_fees_paid = (u.total_fees_paid || 0) + feeAmount;
                } else if (purpose === 'wallet_funding' || purpose === 'deposit') {
                  u.balance = (u.balance || 0) + netAmount;
                  u.total_deposited = (u.total_deposited || 0) + amountNaira;
                  u.total_fees_paid = (u.total_fees_paid || 0) + feeAmount;
                }
                userStore.set(targetUserId, u);

                if (productId) {
                  const ord = orderStore.get(reference) || {
                    id: 'ord_' + Math.random().toString(36).substring(2, 10),
                    reference,
                    user_id: targetUserId,
                    product_id: productId,
                    product_title: metadata.productTitle || 'Package',
                    category: metadata.category || 'digital_product',
                    amount: amountNaira,
                  };
                  ord.status = 'delivered';
                  ord.delivery_unlocked = 1;
                  ord.verified_at = nowIso;
                  ord.download_url = `/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`;
                  orderStore.set(reference, ord);
                }
              }
            } else if (eventType === 'charge.failed' && data && reference) {
              const tx = transactionStore.find(t => t.reference === reference);
              if (tx && tx.status !== 'success') {
                tx.status = 'failed';
              }
              const ord = orderStore.get(reference);
              if (ord && ord.status !== 'delivered') {
                ord.status = 'failed';
                ord.delivery_unlocked = 0;
                orderStore.set(reference, ord);
              }
            }

            return sendJson(res, 200, { status: true, message: 'Webhook processed' });
          }

          // --- Paystack 4: GET /api/payments/status ---
          if (pathname === '/api/payments/status' && method === 'GET') {
            const reference = parsedUrl.searchParams.get('reference');
            const targetUserId = parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('user_id');

            if (reference) {
              const tx = transactionStore.find(t => t.reference === reference);
              if (tx) {
                return sendJson(res, 200, { success: true, transaction: tx, status: tx.status });
              }
            }

            const u = userStore.get(targetUserId || 'demo_user');
            const userTx = transactionStore.filter(t => !targetUserId || t.userId === targetUserId);
            const latest = userTx[0];

            return sendJson(res, 200, {
              success: true,
              userId: targetUserId || 'user',
              is_activated: u?.is_activated || 0,
              balance: u?.balance || 0,
              role: u?.role || 'earner',
              payment_status: latest ? latest.status : 'not_submitted',
              latest_transaction: latest,
              transactions: userTx,
            });
          }

          // --- 9. Users Sync (POST /api/users/sync) ---
          if (pathname === '/api/users/sync' && method === 'POST') {
            const body = await parseJsonBody(req);
            const user = userStore.get(body.id) || {
              id: body.id,
              email: body.email || 'user@cdsure.com',
              name: body.name || 'User',
              role: body.role || 'earner',
              is_activated: body.is_activated ? 1 : 0,
              balance: body.balance || 0,
              total_fees_paid: 0,
              total_deposited: 0,
            };
            if (body.name) user.name = body.name;
            if (body.role) user.role = body.role;
            if (typeof body.balance === 'number') user.balance = body.balance;
            if (typeof body.is_activated === 'number') user.is_activated = body.is_activated;
            userStore.set(body.id, user);

            return sendJson(res, 200, { success: true, user });
          }

          // --- 10. Platform Earnings (GET /api/admin/platform-earnings) ---
          if (pathname === '/api/admin/platform-earnings' && method === 'GET') {
            const totalFee = transactionStore.reduce((acc, t) => acc + (t.feeAmount || 0), 0);
            return sendJson(res, 200, {
              success: true,
              total_activation_fees: totalFee,
              total_retained_30: totalFee,
              transactions: transactionStore,
            });
          }

          // Unhandled /api route
          return sendJson(res, 404, { success: false, error: `API endpoint not found: ${pathname}` });
        } catch (err: any) {
          console.error('Dev API middleware error:', err);
          return sendJson(res, 500, { success: false, error: err.message || 'Internal error' });
        }
      });
    },
  };
}
