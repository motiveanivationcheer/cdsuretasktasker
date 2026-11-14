import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { devApiPlugin } from './src/server/devApiMiddleware';

const LIVE_PUBLIC_KEY = 'pk_live_d373a3e0e4c9f6ec3916d30de7a2dacd08b70d90';

// Purge any stale pk_test_ / sk_test_ values inherited from host environment and load live .env keys
try {
  const envPath = path.resolve('./.env');
  const parsedEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
  for (const key of ['PAYSTACK_PUBLIC_KEY', 'PUBLIC_PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET']) {
    const cur = (process.env[key] || '').trim();
    const isTestOrPlaceholder = cur.startsWith('pk_test_') || cur.startsWith('sk_test_') || cur.includes('placeholder') || cur.includes('REPLACE_WITH');
    if (!cur || isTestOrPlaceholder) {
      const fromFile = (parsedEnv[key] || '').trim();
      if (fromFile && !fromFile.startsWith('pk_test_') && !fromFile.startsWith('sk_test_')) {
        process.env[key] = fromFile;
      } else if (isTestOrPlaceholder) {
        delete process.env[key];
      }
    }
  }
} catch {
  // Safe fallback
}

const resolvedLivePublicKey =
  (process.env.PAYSTACK_PUBLIC_KEY?.startsWith('pk_live_') ? process.env.PAYSTACK_PUBLIC_KEY : '') ||
  (process.env.PUBLIC_PAYSTACK_PUBLIC_KEY?.startsWith('pk_live_') ? process.env.PUBLIC_PAYSTACK_PUBLIC_KEY : '') ||
  LIVE_PUBLIC_KEY;

process.env.PAYSTACK_PUBLIC_KEY = resolvedLivePublicKey;
process.env.PUBLIC_PAYSTACK_PUBLIC_KEY = resolvedLivePublicKey;

export default defineConfig({
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  vite: {
    envPrefix: ['PUBLIC_', 'VITE_', 'PAYSTACK_PUBLIC_'],
    define: {
      'import.meta.env.PUBLIC_PAYSTACK_PUBLIC_KEY': JSON.stringify(resolvedLivePublicKey),
      'import.meta.env.PAYSTACK_PUBLIC_KEY': JSON.stringify(resolvedLivePublicKey),
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
