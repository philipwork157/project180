import { meQuery, myChatUnreadQuery, myFeedbackQuery, planQuery } from '@project180/client'
import {
  type AppNotification,
  appNotifications,
  chatNotification,
  feedbackNotifications,
  isClient,
} from '@project180/shared'
import { IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useWeighInStatus } from './weigh-in-card'

const SEEN_KEY = 'project180-seen-notifications'

/** The notifications this phone has already shown on the Notifications screen. */
export function loadSeenNotifications(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** Only what's still listed is remembered, so the stored list never grows. */
export function saveSeenNotifications(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    // Private mode: the badge just comes back next time.
  }
}

/**
 * What's waiting today (weigh-in, today's workout), program news from the plan, and what your
 * coach sent (unread messages, likes and comments).
 */
export function useAppNotifications(): AppNotification[] {
  const plan = useQuery(planQuery).data
  const feedback = useQuery(myFeedbackQuery).data
  const me = useQuery(meQuery).data
  const chat = useQuery({ ...myChatUnreadQuery, enabled: !!me && isClient(me.role) }).data
  const { status, today } = useWeighInStatus()
  // Unread messages first, then your coach's new likes and comments.
  const message = chatNotification(chat)
  const fromCoach = [...(message ? [message] : []), ...feedbackNotifications(feedback ?? [])]
  if (!plan?.plan || !today) return fromCoach
  const day = plan.plan.days.find((d) => d.isToday) ?? null
  const planned = appNotifications({
    today,
    weighIn: status,
    todayWorkout: day,
    workoutInProgress: plan.activeSession != null,
    program: {
      enrollmentId: plan.plan.enrollment.id,
      programName: plan.plan.enrollment.programName,
      startDate: plan.plan.enrollment.startDate,
      assignedAt: plan.plan.assigned.at,
      updatedAt: plan.plan.assigned.updatedAt,
      coachName: plan.plan.assigned.coachName,
      startedAt: plan.plan.assigned.startedAt,
    },
    next: plan.plan.next,
  })
  return [...fromCoach, ...planned]
}

/** The bell on the Today screen: a badge for anything new; a tap opens the Notifications screen. */
export function NotificationsButton() {
  const navigate = useNavigate()
  const list = useAppNotifications()
  const [seen] = useState(loadSeenNotifications)
  const unseen = list.filter((n) => !seen.includes(n.id)).length

  return (
    <div className="relative">
      <IconButton
        label={unseen ? `Notifications, ${unseen} new` : 'Notifications'}
        icon={<Bell aria-hidden />}
        size="lg"
        className="[&_svg]:size-[22px]"
        onClick={() => void navigate({ to: '/notifications' })}
      />
      {unseen > 0 && (
        <span
          aria-hidden
          className="tabular pointer-events-none absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1 font-extrabold text-[11px] text-on-clay ring-2 ring-bg"
        >
          {unseen}
        </span>
      )}
    </div>
  )
}
