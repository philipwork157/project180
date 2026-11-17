import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The admin dashboard, installable as its own app ("Project 180 Admin", with an ADMIN
// badge on the icon so it's never mixed up with the clients' app). In production it has
// its own Worker that mounts the same API and binds the same D1 database as the app.
//
// Locally, only the phone app runs the Workers runtime (one process may hold the
// local database), so the admin dev server forwards /api to it on :5173.
// `vite build --mode dev` (the dev site) installs as "P180 Admin Dev", with a DEV badge under
// the ADMIN one on its icons (public/icons/dev), so it's never mixed up with the real one.
export default defineConfig(({ command, mode }) => {
  const dev = mode === 'dev'
  const icons = dev ? '/icons/dev' : '/icons'
  return {
    server: {
      port: 5174,
      strictPort: true,
      // Tagged as the admin so the API uses the admin's own sign-in cookie, not the app's.
      proxy: {
        '/api': { target: 'http://localhost:5173', headers: { 'x-project180-app': 'admin' } },
      },
    },
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      command === 'build' && cloudflare(),
      {
        name: 'p180-dev-icons',
        // The home-screen icon and name iPhones use come from index.html, not the manifest.
        transformIndexHtml: (html: string) =>
          dev
            ? html
                .replace('/icons/apple-touch-icon.png', `${icons}/apple-touch-icon.png`)
                .replace('content="P180 Admin"', 'content="Admin Dev"')
            : html,
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', `${icons.slice(1)}/apple-touch-icon.png`],
        manifest: {
          name: dev ? 'P180 Admin Dev' : 'P180 Admin',
          short_name: dev ? 'Admin Dev' : 'P180 Admin',
          description: 'Clients, programs and progress for Project 180 coaches.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // Phone, tablet or laptop: either way round.
          orientation: 'any',
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
          ],
        },
        workbox: {
          // The app shell loads instantly and works after updates; data always comes live from /api.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Fonts: precache the Latin files only; the extra-character sets load if a name needs them.
          // The live site doesn't precache the dev icons.
          globIgnores: [
            '**/*-latin-ext-*.woff2',
            '**/*-vietnamese-*.woff2',
            ...(dev ? [] : ['icons/dev/**']),
          ],
        },
      }),
    ],
  }
})
