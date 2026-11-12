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
export default defineConfig(({ command }) => ({
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:5173' },
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    command === 'build' && cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'P180 Admin',
        short_name: 'P180 Admin',
        description: 'Clients, programs and progress for Project 180 coaches.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Phone, tablet or laptop: either way round.
        orientation: 'any',
        theme_color: '#202321',
        background_color: '#202321',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell loads instantly and works after updates; data always comes live from /api.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Fonts: precache the Latin files only; the extra-character sets load if a name needs them.
        globIgnores: ['**/*-latin-ext-*.woff2', '**/*-vietnamese-*.woff2'],
      },
    }),
  ],
}))
