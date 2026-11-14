// When to ask for a weigh-in, and what the app's notifications list shows.
import { addDays, daysBetween } from './dates'
import type { ChatUnread, PlanDay } from './types'

/** A missed weigh-in day still asks for a few days, then waits for the next one. */
export const OVERDUE_DAYS = 3

export interface WeighInStatus {
  /** today = a weigh-in day; overdue = a recent one was missed. */
  kind: 'today' | 'overdue'
  /** The weigh-in day it's for. */
  date: string
  /** Weighed in today (or since the missed day). */
  done: boolean
  /** Today's weight, once logged. */
  weightKg: number | null
  /** The weigh-in before today, for "−0.4 kg since 5 Nov". */
  previous: { date: string; weightKg: number } | null
}

/**
 * Is a weigh-in due? Today when the program asks for one, or a weigh-in day in the last few
 * days that nothing was logged for (logging today counts for it). Null when nothing is due.
 */
export function weighInStatus(
  days: Pick<PlanDay, 'date' | 'checkinRequired'>[],
  today: string,
  bodyWeight: { date: string; weightKg: number }[],
): WeighInStatus | null {
  const sorted = [...bodyWeight].sort((a, b) => a.date.localeCompare(b.date))
  const todayLog = sorted.find((b) => b.date === today) ?? null
  const previous = sorted.filter((b) => b.date < today).at(-1) ?? null
  const base = { weightKg: todayLog?.weightKg ?? null, previous }
  if (days.some((d) => d.date === today && d.checkinRequired)) {
    return { kind: 'today', date: today, done: todayLog !== null, ...base }
  }
  const missed = days
    .filter(
      (d) =>
        d.checkinRequired &&
        d.date < today &&
        d.date >= addDays(today, -OVERDUE_DAYS) &&
        !sorted.some((b) => b.date >= d.date),
    )
    .at(-1)
  if (missed) return { kind: 'overdue', date: missed.date, done: false, ...base }
  // Caught up on a missed day today: say thanks instead of disappearing at once.
  const caughtUp = days
    .filter((d) => d.checkinRequired && d.date < today && d.date >= addDays(today, -OVERDUE_DAYS))
    .at(-1)
  if (caughtUp && todayLog && !sorted.some((b) => b.date >= caughtUp.date && b.date < today)) {
    return { kind: 'overdue', date: caughtUp.date, done: true, ...base }
  }
  return null
}

/** "−0.4 kg" / "+1.2 kg" / "same as" between two weights. */
export function weightChange(fromKg: number, toKg: number): string {
  const diff = Math.round((toKg - fromKg) * 10) / 10
  if (diff === 0) return 'No change'
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} kg`
}

export interface AppNotification {
  /** Stable per thing and day, so "seen" can be remembered. */
  id: string
  kind: 'weigh_in' | 'workout' | 'program' | 'feedback' | 'chat'
  title: string
  body: string
  /** Feedback: the workout it's on. */
  sessionId?: number
}

/** News about a program stays in the list this many days. */
export const PROGRAM_NEWS_DAYS = 7

/** "Monday 16 November", for a YYYY-MM-DD day. */
function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** What the bell needs to know about the program someone is on. */
export interface ProgramNews {
  enrollmentId: number
  programName: string
  startDate: string
  /** When it was assigned, and when their coach last brought changes to it (ISO moments). */
  assignedAt: string
  updatedAt: string | null
  coachName: string | null
}

/** A new program, or changes to it, from the last few days. Newest news only. */
function programNotification(p: ProgramNews, today: string): AppNotification | null {
  const coach = p.coachName?.split(' ')[0] || 'Your coach'
  const recent = (iso: string) => {
    const days = daysBetween(iso.slice(0, 10), today)
    return days >= -1 && days <= PROGRAM_NEWS_DAYS
  }
  // Changed at least a minute after it was assigned (assigning also stamps the copy).
  const changed =
    p.updatedAt !== null && Date.parse(p.updatedAt) - Date.parse(p.assignedAt) > 60_000
  if (changed && p.updatedAt && recent(p.updatedAt)) {
    return {
      id: `program-update:${p.enrollmentId}:${p.updatedAt}`,
      kind: 'program',
      title: 'Your program was updated',
      body: `${coach} made changes to ${p.programName}. Have a look at what's coming up.`,
    }
  }
  if (!recent(p.assignedAt)) return null
  return {
    id: `program:${p.enrollmentId}`,
    kind: 'program',
    title: `New program: ${p.programName}`,
    body:
      p.startDate > today
        ? `${coach} set it up for you. It starts on ${longDay(p.startDate)}.`
        : `${coach} set it up for you. Your plan is ready.`,
  }
}

/**
 * The notifications list in the phone app: things to do today, and news about your program.
 * Worked out from the plan, so they appear and clear themselves (weigh in, and the weigh-in
 * notification goes away; program news drops off after a week).
 */
export function appNotifications(input: {
  today: string
  weighIn: WeighInStatus | null
  todayWorkout: Pick<PlanDay, 'date' | 'workoutName' | 'state'> | null
  workoutInProgress: boolean
  program?: ProgramNews | null
}): AppNotification[] {
  const list: AppNotification[] = []
  const news = input.program ? programNotification(input.program, input.today) : null
  if (news) list.push(news)
  const w = input.weighIn
  if (w && !w.done) {
    const late = daysBetween(w.date, input.today)
    list.push({
      id: `weigh-in:${w.date}`,
      kind: 'weigh_in',
      title: w.kind === 'today' ? 'Weigh-in today' : 'Weigh-in missed',
      body:
        w.kind === 'today'
          ? 'Log your weight so your coach can track your progress.'
          : `It was due ${late === 1 ? 'yesterday' : `${late} days ago`}. Log it now; it counts.`,
    })
  }
  const t = input.todayWorkout
  if (t && t.state === 'planned' && t.workoutName && !input.workoutInProgress) {
    list.push({
      id: `workout:${t.date}`,
      kind: 'workout',
      title: `Today: ${t.workoutName}`,
      body: 'Your workout for today is ready when you are.',
    })
  }
  return list
}

/**
 * Unread messages from your coach, as one notification. Its id follows the newest message, so a
 * new message shows as "new" again even when the earlier ones were never read.
 */
export function chatNotification(chat: ChatUnread | null | undefined): AppNotification | null {
  if (!chat?.latest || chat.unread <= 0) return null
  const from = chat.latest.senderName?.split(' ')[0] || 'Your coach'
  const preview = chat.latest.body.replace(/\s+/g, ' ').trim()
  return {
    id: `chat:${chat.latest.id}`,
    kind: 'chat',
    title:
      chat.unread === 1 ? `New message from ${from}` : `${chat.unread} new messages from ${from}`,
    body: preview.length > 120 ? `${preview.slice(0, 119)}…` : preview,
  }
}
