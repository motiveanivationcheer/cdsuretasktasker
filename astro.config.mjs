// Polyfill MessageChannel & MessagePort before React/react-dom loads in Cloudflare Workers runtime
if (typeof globalThis.MessageChannel === 'undefined') {
  class PolyfillMessagePort {
    onmessage = null;
    _other = null;
    postMessage(data) {
      const target = this._other;
      if (target && typeof target.onmessage === 'function') {
        queueMicrotask(() => target.onmessage({ data }));
      }
    }
    start() {}
    close() {
      this.onmessage = null;
    }
    addEventListener() {}
    removeEventListener() {}
  }
  // @ts-ignore
  globalThis.MessagePort = globalThis.MessagePort || PolyfillMessagePort;
  // @ts-ignore
  globalThis.MessageChannel = class MessageChannel {
    constructor() {
      this.port1 = new PolyfillMessagePort();
      this.port2 = new PolyfillMessagePort();
      this.port1._other = this.port2;
      this.port2._other = this.port1;
    }
  };
}

import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { devApiPlugin } from './src/server/devApiMiddleware';

const DEFAULT_PUBLIC_KEY = 'pk_live_d373a3e0e4c9f6ec3916d30de7a2dacd08b70d90';
const DEFAULT_CLOUDINARY_CLOUD_NAME = 'yojvb8cn';

try {
  const envPath = path.resolve('./.env');
  const parsedEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
  for (const key of [
    'PAYSTACK_PUBLIC_KEY',
    'PUBLIC_PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_WEBHOOK_SECRET',
    'PUBLIC_CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'FIREBASE_PROJECT_ID',
    'ADMIN_EMAILS',
  ]) {
    const cur = (process.env[key] || '').trim();
    const fromEnv = (parsedEnv[key] || '').trim();
    const isPlaceholderOrTest =
      !cur ||
      cur.includes('placeholder') ||
      cur.includes('REPLACE_WITH') ||
      cur.startsWith('sk_test_') ||
      cur.startsWith('pk_test_');
    if (
      isPlaceholderOrTest &&
      fromEnv &&
      !fromEnv.includes('REPLACE_WITH') &&
      !fromEnv.includes('placeholder') &&
      !fromEnv.startsWith('sk_test_') &&
      !fromEnv.startsWith('pk_test_')
    ) {
      process.env[key] = fromEnv;
    }
  }
} catch {
  // Safe fallback
}

// LIVE PRODUCTION ONLY: strictly require pk_live_ public key
const resolvedPublicKey =
  (process.env.PUBLIC_PAYSTACK_PUBLIC_KEY?.startsWith('pk_live_') ? process.env.PUBLIC_PAYSTACK_PUBLIC_KEY : '') ||
  (process.env.PAYSTACK_PUBLIC_KEY?.startsWith('pk_live_') ? process.env.PAYSTACK_PUBLIC_KEY : '') ||
  DEFAULT_PUBLIC_KEY;

const resolvedCloudinaryCloudName =
  (process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim() || DEFAULT_CLOUDINARY_CLOUD_NAME;

process.env.PAYSTACK_PUBLIC_KEY = resolvedPublicKey;
process.env.PUBLIC_PAYSTACK_PUBLIC_KEY = resolvedPublicKey;
process.env.PUBLIC_CLOUDINARY_CLOUD_NAME = resolvedCloudinaryCloudName;

const WORKER_POLYFILL_BANNER = `globalThis.process ??= {}; globalThis.process.env ??= {};
if (typeof globalThis.MessageChannel === "undefined") {
  class _MP { constructor() { this.onmessage = null; this._o = null; } postMessage(d) { const t = this._o; if (t && typeof t.onmessage === "function") queueMicrotask(() => t.onmessage({ data: d })); } start() {} close() { this.onmessage = null; } addEventListener() {} removeEventListener() {} }
  globalThis.MessagePort = globalThis.MessagePort || _MP;
  globalThis.MessageChannel = class MessageChannel { constructor() { this.port1 = new _MP(); this.port2 = new _MP(); this.port1._o = this.port2; this.port2._o = this.port1; } };
}`;

export default defineConfig({
  output: 'server',
  devToolbar: {
    enabled: false,
  },
  session: {
    driver: 'memory',
  },
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'passthrough',
  }),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  vite: {
    server: {
      hmr: false,
    },
    envPrefix: ['PUBLIC_', 'VITE_', 'PAYSTACK_PUBLIC_'],
    define: {
      'import.meta.env.PUBLIC_PAYSTACK_PUBLIC_KEY': JSON.stringify(resolvedPublicKey),
      'import.meta.env.PAYSTACK_PUBLIC_KEY': JSON.stringify(resolvedPublicKey),
      'import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME': JSON.stringify(resolvedCloudinaryCloudName),
    },
    ssr: {
      noExternal: process.argv.includes('dev') ? [] : ['react-dom'],
    },
    build: {
      rollupOptions: {
        output: {
          banner: WORKER_POLYFILL_BANNER,
        },
      },
    },
    plugins: [devApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
