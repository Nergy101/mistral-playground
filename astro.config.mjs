import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321 },
  // Public demo site, no cookies/auth — allow cross-origin POSTs to /api/*.
  security: { checkOrigin: false },
});
