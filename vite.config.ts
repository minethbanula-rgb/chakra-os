import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // NO_PWA=1 builds a copy without the service worker (for embedded previews).
    !process.env.NO_PWA && VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Chakra Studio OS',
        short_name: 'Chakra',
        description: 'Projects, clients and money for creative studios',
        theme_color: '#050607',
        background_color: '#050607',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
