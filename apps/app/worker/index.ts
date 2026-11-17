import {
  type Bindings,
  createApp,
  recordError,
  runDailyCleanup,
  runFoodReminders,
} from '@project180/api'

const app = createApp()

/** Must match the second cron in wrangler.jsonc. */
const FOOD_REMINDER_CRON = '30 17 * * *'

// One Worker: /api/* goes to Hono (see run_worker_first in wrangler.jsonc);
// everything else is the built React app, served as static assets.
// Scheduled jobs (triggers.crons in wrangler.jsonc), only in this Worker (the admin Worker shares
// the same database): at 02:00 UTC clear expired sign-ins and close forgotten workouts; at 17:30
// UTC (19:30 in Johannesburg) remind people who turned it on to log their food.
export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (controller.cron === FOOD_REMINDER_CRON) {
      ctx.waitUntil(
        runFoodReminders(env)
          .then((done) => console.log('[food-reminders]', JSON.stringify(done)))
          .catch((err) => recordError(env, 'cron', 'food reminders', String(err))),
      )
      return
    }
    ctx.waitUntil(
      runDailyCleanup(env)
        .then((done) => console.log('[cleanup]', JSON.stringify(done)))
        .catch((err) => recordError(env, 'cron', 'daily cleanup', String(err))),
    )
  },
} satisfies ExportedHandler<Bindings>
