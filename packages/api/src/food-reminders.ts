// The evening food reminder: people who turned it on in Profile and have logged fewer than two
// meals today get one push. The same reminder shows in the bell (foodReminderNotification), as
// every push must, because many phones never turn push on.
import { createDb, type Db, foodEntries, users } from '@project180/db'
import { FOOD_REMINDER_MIN_MEALS, todayIn } from '@project180/shared'
import { and, countDistinct, eq, inArray, isNull } from 'drizzle-orm'
import type { Bindings } from './env'
import { sendPush } from './push'

/** Sends the reminder to everyone it's due for. A fixed number of queries. */
export async function sendFoodReminders(env: Bindings, db: Db, now = new Date()) {
  const people = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(and(eq(users.foodReminders, true), isNull(users.blockedAt)))
  if (people.length === 0) return { due: 0, sent: 0 }
  const dayOf = new Map(people.map((p) => [p.id, todayIn(p.timezone, now)]))
  const days = [...new Set(dayOf.values())]
  const logged = await db
    .select({
      userId: foodEntries.userId,
      date: foodEntries.date,
      meals: countDistinct(foodEntries.meal),
    })
    .from(foodEntries)
    .where(
      and(
        inArray(
          foodEntries.userId,
          people.map((p) => p.id),
        ),
        inArray(foodEntries.date, days),
      ),
    )
    .groupBy(foodEntries.userId, foodEntries.date)
  const meals = new Map(
    logged.filter((r) => r.date === dayOf.get(r.userId)).map((r) => [r.userId, r.meals]),
  )
  const due = people
    .filter((p) => (meals.get(p.id) ?? 0) < FOOD_REMINDER_MIN_MEALS)
    .map((p) => p.id)
  const { sent } = await sendPush(env, db, due, {
    title: 'Log today’s food',
    body: 'A minute now keeps your calories right. Tap to open Fuel.',
    url: '/fuel',
    tag: 'food-reminder',
  })
  return { due: due.length, sent }
}

/** The same, given the Worker's bindings (for the scheduled handler). */
export function runFoodReminders(env: Bindings) {
  return sendFoodReminders(env, createDb(env.DB))
}
