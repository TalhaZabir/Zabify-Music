import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Audio streams are IP-bound, expiring URLs — never cached offline.
      // The SW caches app shell + artwork so the library stays browsable.
      // API navigations are excluded from the app-shell fallback.
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'zabify-artwork',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
      manifest: {
        name: 'Zabify',
        short_name: 'Zabify',
        description: 'Modern open-source music streaming client.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // Dedicated ports: a sibling Zabify project uses 5173/8787 on this
    // machine. strictPort fails fast instead of binding a shadow address.
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
