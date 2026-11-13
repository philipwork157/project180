import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Runs the Worker (API + D1) inside the dev server, same as production.
    // Local data lives at the repo root (.wrangler/state). This app also serves
    // the API to the admin dev server, which proxies /api here.
    cloudflare({ persistState: { path: '../../.wrangler/state' } }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Project 180',
        short_name: 'Project 180',
        description: 'Train. Fuel. Feel. Live.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#202321',
        background_color: '#202321',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Push notifications: the handlers live in public/push-sw.js.
        importScripts: ['/push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Fonts: precache the Latin files only; the extra-character sets load if a name needs them.
        globIgnores: ['**/*-latin-ext-*.woff2', '**/*-vietnamese-*.woff2'],
        runtimeCaching: [
          {
            // Exercise photos: not precached (about 10 MB), kept once seen so they work offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/exercise-images/'),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', expiration: { maxEntries: 600 } },
          },
        ],
      },
    }),
  ],
})
