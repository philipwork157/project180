// Turning a coach's unread likes and comments into the phone app's notifications.
import type { FeedbackNews } from './types'
import type { AppNotification } from './weigh-in'

const firstName = (name: string | null) => name?.split(' ')[0] || 'Your coach'
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * One notification per workout, newest first. A single like or comment says exactly what it
 * was; several are summed up. The id changes when something new arrives, so it shows as new.
 */
export function feedbackNotifications(news: FeedbackNews[]): AppNotification[] {
  const bySession = new Map<number, FeedbackNews[]>()
  for (const f of news) {
    const list = bySession.get(f.sessionId) ?? []
    list.push(f)
    bySession.set(f.sessionId, list)
  }
  const out: AppNotification[] = []
  for (const [sessionId, items] of bySession) {
    const latest = items.reduce((a, b) => (b.id > a.id ? b : a))
    const coach = firstName(latest.authorName)
    const workout = latest.workoutName ?? 'your workout'
    const comments = items.filter((f) => f.kind === 'comment')
    const likes = items.length - comments.length
    const base = { id: `feedback:${sessionId}:${latest.id}`, kind: 'feedback' as const, sessionId }
    if (items.length === 1) {
      const what = latest.exerciseName ?? (latest.workoutName ? latest.workoutName : 'workout')
      out.push(
        latest.kind === 'like'
          ? {
              ...base,
              title: `${coach} liked your ${what}`,
              body: latest.exerciseName ? `On ${workout}. Tap to see it.` : 'Tap to see it.',
            }
          : {
              ...base,
              title: `${coach} commented on your ${what}`,
              body: latest.body ?? '',
            },
      )
      continue
    }
    const newestComment = comments.reduce<FeedbackNews | null>(
      (a, b) => (!a || b.id > a.id ? b : a),
      null,
    )
    const counts = [
      likes ? plural(likes, 'like') : null,
      comments.length ? plural(comments.length, 'comment') : null,
    ]
      .filter(Boolean)
      .join(' · ')
    out.push({
      ...base,
      title: `${coach} left feedback on ${workout}`,
      body: newestComment?.body ? `“${newestComment.body}” · ${counts}` : counts,
    })
  }
  return out
}
