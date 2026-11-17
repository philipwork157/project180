import {
  authClient,
  forgetLocalData,
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@project180/client'
import { isClient } from '@project180/shared'
import { Button, cn } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { DeleteAccount } from '../../components/delete-account'
import { FoodReminderSetting } from '../../components/food-reminder-setting'
import { ChangePassword, MyGoals } from '../../components/my-goals'
import { MyPlanCard } from '../../components/my-targets'
import { PushSettings } from '../../components/push-settings'
import { ScreenHeader } from '../../components/screen-header'
import { Sheet } from '../../components/sheet'
import { turnPushOff } from '../../lib/push'

export const Route = createFileRoute('/_app/profile')({
  component: ProfilePage,
})

const themes: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function ProfilePage() {
  const { me } = Route.useRouteContext()
  const onOwn = isClient(me.role) && me.coachId === null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [theme, setTheme] = useState(getThemePreference)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      // While still signed in: this phone stops getting this person's notifications.
      await turnPushOff()
      await authClient.signOut()
    } finally {
      queryClient.clear()
      forgetLocalData()
      await navigate({ to: '/login' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Profile" />

      <section className="flex items-center gap-4 rounded-lg bg-surface p-5 shadow-card">
        <span className="grid size-14 place-items-center rounded-full bg-brand font-display font-extrabold text-[24px] text-on-brand">
          {me.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-[20px]">{me.name}</p>
          <p className="truncate font-semibold text-[13px] text-ink-muted">{me.email}</p>
        </div>
      </section>

      <MyGoals onOwn={onOwn} />
      {/* On your own you manage your body basics and calories; with a coach, they do. */}
      {onOwn && <MyPlanCard timezone={me.timezone} />}

      <PushSettings />
      <FoodReminderSetting />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-[17px]">Appearance</h2>
        <fieldset
          aria-label="Theme"
          className="grid grid-cols-3 gap-1 rounded-md bg-surface-raised p-1"
        >
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value)
                setThemePreference(value)
              }}
              className={cn(
                'flex h-11 items-center justify-center gap-2 rounded-sm font-bold text-[14px] transition',
                theme === value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </fieldset>
      </section>

      <section className="flex flex-col gap-3">
        <ChangePassword />
        <Button
          variant="secondary"
          block
          icon={<LogOut className="size-5" aria-hidden />}
          onClick={() => setConfirmSignOut(true)}
        >
          Sign out
        </Button>
      </section>

      {isClient(me.role) && <DeleteAccount coached={me.coachId !== null} />}

      <p className="text-center text-[13px] text-ink-muted">
        <Link to="/terms" className="font-semibold hover:text-ink">
          Terms
        </Link>
        {' · '}
        <Link to="/privacy" className="font-semibold hover:text-ink">
          Privacy
        </Link>
      </p>

      <Sheet
        open={confirmSignOut}
        onClose={() => !signingOut && setConfirmSignOut(false)}
        label="Sign out"
      >
        {/* Full width like every sheet: phone stacks Sign out over Cancel; wider screens put
            them side by side so neither button stretches across the whole screen alone. */}
        <div className="flex w-full flex-col items-center gap-2 pb-4 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-danger/10 text-danger">
            <LogOut className="size-6" aria-hidden />
          </span>
          <h2 className="mt-2 font-display font-extrabold text-[22px] leading-7">Sign out?</h2>
          <p className="text-[15px] text-ink-muted">
            You’ll need your email and password to sign back in.
          </p>
          <div className="mt-4 grid w-full grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            <Button
              variant="danger"
              size="lg"
              block
              loading={signingOut}
              onClick={signOut}
              className="md:order-2"
            >
              Sign out
            </Button>
            <Button
              variant="secondary"
              size="lg"
              block
              className="md:order-1"
              disabled={signingOut}
              onClick={() => setConfirmSignOut(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
