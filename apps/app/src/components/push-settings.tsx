import { ApiError } from '@project180/client'
import { Button } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { type PushState, pushStateQuery, turnPushOff, turnPushOn } from '../lib/push'

const COPY: Record<Exclude<PushState, 'unavailable'>, { title: string; text: string }> = {
  on: {
    title: 'Notifications are on',
    text: 'This phone tells you when your coach gives you a new program or changes it.',
  },
  off: {
    title: 'Get notified',
    text: 'Hear about a new or changed program straight away, even when the app is closed.',
  },
  blocked: {
    title: 'Notifications are blocked',
    text: 'They’re turned off for Project 180 in your phone’s settings. Allow them there, then come back.',
  },
  install: {
    title: 'Add the app to your Home Screen first',
    text: 'On an iPhone, notifications only work from the installed app: tap Share, then “Add to Home Screen”, and open it from there.',
  },
}

/** Profile: turn push notifications on or off for this phone. Hidden where they can't work. */
export function PushSettings({ heading = 'Notifications' }: { heading?: string }) {
  const queryClient = useQueryClient()
  const state = useQuery(pushStateQuery).data
  const set = (next: PushState) => queryClient.setQueryData(pushStateQuery.queryKey, next)
  const turnOn = useMutation({ mutationFn: turnPushOn, onSuccess: set })
  const turnOff = useMutation({ mutationFn: turnPushOff, onSuccess: () => set('off') })
  if (!state || state === 'unavailable') return null

  const { title, text } = COPY[state]
  const Icon = state === 'on' ? BellRing : state === 'off' ? Bell : BellOff
  const error = turnOn.error ?? turnOff.error
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-[17px]">{heading}</h2>
      <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span
            className={
              state === 'on'
                ? 'grid size-11 shrink-0 place-items-center rounded-full bg-lime/25 text-lime-text'
                : 'grid size-11 shrink-0 place-items-center rounded-full bg-surface-raised text-ink-muted'
            }
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[15px]">{title}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{text}</p>
          </div>
        </div>
        {state === 'off' && (
          <Button size="lg" block loading={turnOn.isPending} onClick={() => turnOn.mutate()}>
            Turn on notifications
          </Button>
        )}
        {state === 'on' && (
          <Button
            variant="secondary"
            block
            loading={turnOff.isPending}
            onClick={() => turnOff.mutate()}
          >
            Turn off on this phone
          </Button>
        )}
        {error && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {error instanceof ApiError
              ? error.message
              : 'That didn’t work. Check your connection and try again.'}
          </p>
        )}
      </div>
    </section>
  )
}
