import { type Bindings, createApp, runDailyCleanup } from '@project180/api'

const app = createApp()

// One Worker: /api/* goes to Hono (see run_worker_first in wrangler.jsonc);
// everything else is the built React app, served as static assets.
// Once a day (triggers.crons in wrangler.jsonc): clear expired sign-ins and close forgotten
// workouts. Only this Worker runs it; the admin Worker shares the same database.
export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runDailyCleanup(env).then((done) => console.log('[cleanup]', JSON.stringify(done))),
    )
  },
} satisfies ExportedHandler<Bindings>
