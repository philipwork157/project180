import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The admin dashboard: a normal website (not a PWA). In production it has its
// own Worker that mounts the same API and binds the same D1 database as the app.
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
  ],
}))
