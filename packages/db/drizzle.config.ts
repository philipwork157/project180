import { defineConfig } from 'drizzle-kit'

// `bun run db:generate` writes SQL migrations to ./drizzle from the schema.
// Wrangler applies them to D1 (see apps/web/wrangler.jsonc → migrations_dir).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/index.ts',
  out: './drizzle',
})
