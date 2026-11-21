// The evening food reminder: people who turned it on in Profile and have logged fewer than two
// meals today get one push. The same reminder shows in the bell (foodReminderNotification), as
// every push must, because many phones never turn push on.

import { checkInAnswers, checkIns, createDb, type Db, foodEntries, users } from '@project180/db'
import { addDays, FOOD_REMINDER_MIN_MEALS, todayIn } from '@project180/shared'
import { and, countDistinct, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { inChunks } from './batch'
import type { Bindings } from './env'
import { sendPush } from './push'

/** Sends the reminder to everyone it's due for. One query per 80 people, all at once. */
export async function sendFoodReminders(env: Bindings, db: Db, now = new Date()) {
  const people = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(and(eq(users.foodReminders, true), isNull(users.blockedAt)))
  if (people.length === 0) return { due: 0, sent: 0 }
  const dayOf = new Map(people.map((p) => [p.id, todayIn(p.timezone, now)]))
  const days = [...new Set(dayOf.values())]
  // In slices: D1 allows 100 bound values per statement, and this list grows with every user.
  const logged = await inChunks(
    people.map((p) => p.id),
    (slice) =>
      db
        .select({
          userId: foodEntries.userId,
          date: foodEntries.date,
          meals: countDistinct(foodEntries.meal),
        })
        .from(foodEntries)
        .where(and(inArray(foodEntries.userId, slice), inArray(foodEntries.date, days)))
        .groupBy(foodEntries.userId, foodEntries.date),
    80 - days.length,
  )
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

/**
 * Check-in reminders, at the same evening run: "tomorrow" the evening before, and "today" on the
 * day for anyone who hasn't filled in their check-in yet. The bell shows the same (appNotifications).
 */
export async function sendCheckInReminders(env: Bindings, db: Db, now = new Date()) {
  const today = todayIn('Africa/Johannesburg', now)
  const tomorrow = addDays(today, 1)
  const coach = alias(users, 'reminder_coach')
  const due = await db
    .select({
      clientId: checkIns.clientId,
      dueDate: checkIns.dueDate,
      coachName: coach.name,
      answered: checkInAnswers.checkInId,
    })
    .from(checkIns)
    .innerJoin(users, eq(users.id, checkIns.clientId))
    .leftJoin(coach, eq(coach.id, checkIns.coachId))
    .leftJoin(checkInAnswers, eq(checkInAnswers.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.status, 'scheduled'),
        inArray(checkIns.dueDate, [today, tomorrow]),
        isNull(users.blockedAt),
      ),
    )
  // One push per message (the coach's name is in it).
  const groups = new Map<string, { ids: number[]; title: string; body: string }>()
  for (const d of due) {
    const name = d.coachName?.split(' ')[0] || 'your coach'
    const isToday = d.dueDate === today
    if (isToday && d.answered !== null) continue
    const key = `${isToday}:${name}`
    const group = groups.get(key) ?? {
      ids: [],
      title: isToday ? `Today’s your check-in with ${name}` : `Check-in with ${name} tomorrow`,
      body: isToday
        ? 'Fill in your check-in so your coach can see how it went. Tap to open it.'
        : 'Take a minute to fill in your check-in before then. Tap to open it.',
    }
    group.ids.push(d.clientId)
    groups.set(key, group)
  }
  let sent = 0
  for (const g of groups.values()) {
    const r = await sendPush(env, db, g.ids, {
      title: g.title,
      body: g.body,
      url: '/?checkIn=1',
      tag: 'check-in',
    })
    sent += r.sent
  }
  return { due: due.length, sent }
}

/** The same, given the Worker's bindings (for the scheduled handler). */
export async function runFoodReminders(env: Bindings) {
  const db = createDb(env.DB)
  const [food, checkIn] = await Promise.all([
    sendFoodReminders(env, db),
    sendCheckInReminders(env, db),
  ])
  return { ...food, checkIns: checkIn }
}
