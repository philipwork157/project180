import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `vite build --mode dev` (the dev site) installs as its own app, "P180 Dev", with a DEV badge
// on its icons (public/icons/dev), so it's never mixed up with the real one on a phone.
export default defineConfig(({ mode }) => {
  const dev = mode === 'dev'
  const icons = dev ? '/icons/dev' : '/icons'
  return {
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
      {
        name: 'p180-dev-icons',
        // The home-screen icon and name iPhones use come from index.html, not the manifest.
        transformIndexHtml: (html: string) =>
          dev
            ? html
                .replace('/icons/apple-touch-icon.png', `${icons}/apple-touch-icon.png`)
                .replace('content="Project 180"', 'content="P180 Dev"')
            : html,
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon.svg', `${icons.slice(1)}/apple-touch-icon.png`],
        manifest: {
          name: dev ? 'Project 180 Dev' : 'Project 180',
          short_name: dev ? 'P180 Dev' : 'Project 180',
          description: 'Train. Fuel. Feel. Live.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#202321',
          background_color: '#202321',
          icons: [
            { src: `${icons}/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${icons}/icon-512.png`, sizes: '512x512', type: 'image/png' },
            {
              src: `${icons}/icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            // The scalable icon has no DEV badge, so the dev site leaves it out.
            ...(dev ? [] : [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }]),
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // Push notifications: the handlers live in public/push-sw.js.
          importScripts: ['/push-sw.js'],
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Fonts: precache the Latin files only; the extra-character sets load if a name needs them.
          // The live site doesn't precache the dev icons.
          globIgnores: [
            '**/*-latin-ext-*.woff2',
            '**/*-vietnamese-*.woff2',
            'recipe-images/**',
            ...(dev ? [] : ['icons/dev/**']),
          ],
          runtimeCaching: [
            {
              // Exercise photos: not precached (about 10 MB), kept once seen so they work offline.
              urlPattern: ({ url }) => url.pathname.startsWith('/exercise-images/'),
              handler: 'CacheFirst',
              options: { cacheName: 'exercise-images', expiration: { maxEntries: 600 } },
            },
            {
              // Recipe photos: the same, kept once seen.
              urlPattern: ({ url }) => url.pathname.startsWith('/recipe-images/'),
              handler: 'CacheFirst',
              options: { cacheName: 'recipe-images', expiration: { maxEntries: 200 } },
            },
            // Unsplash recipe photos are left to the browser on purpose: a service worker would
            // fetch them under the CSP it was installed with (a header change never reaches an
            // installed worker), and opaque cross-origin copies count as ~7 MB each in Chrome's
            // storage quota. Unsplash's own long cache headers keep them on the phone.
          ],
        },
      }),
    ],
  }
})
