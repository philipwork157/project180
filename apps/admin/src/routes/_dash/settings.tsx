import { ApiError, api, authClient, meQuery } from '@project180/client'
import { type Me, ROLE_LABELS } from '@project180/shared'
import { Button, Card, Field, Input, PasswordInput, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Mail, Send } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { PageHeader } from '../../components/page-header'
import { PersonActivityPanel } from '../../components/person-activity'

export const Route = createFileRoute('/_dash/settings')({
  component: SettingsPage,
})

/** One settings row: what it is on the left, the controls on the right (stacked on phones). */
function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid grid-cols-1 gap-5 py-8 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-12">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">{title}</h2>
        <p className="text-[14px] text-ink-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function SettingsPage() {
  const { me: routeMe } = Route.useRouteContext()
  const me = useQuery(meQuery).data ?? routeMe

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and where you're signed in." />
      <Card className="divide-y divide-border">
        <Section
          title="Profile"
          description={`How your name shows to your clients and team. You're signed in as ${ROLE_LABELS[me.role].toLowerCase()} with ${me.email}.`}
        >
          <NameForm me={me} />
        </Section>
        <Section
          title="Password"
          description="Use at least 8 characters. Changing it signs you out on your other devices."
        >
          <PasswordForm />
        </Section>
        <Section
          title="Where you're signed in"
          description="Each browser or phone you've signed in on. This dashboard and the phone app sign in separately."
        >
          <PersonActivityPanel userId={me.id} name={me.name} isMe defaultOpen />
        </Section>
        <Section
          title="Email"
          description="Where the app's emails (new passwords, welcome emails) actually go on this site. On the dev site they all go to one test inbox."
        >
          <EmailSettings />
        </Section>
      </Card>
    </>
  )
}

function NameForm({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(me.name)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return setError('Enter your name')
    setError(undefined)
    setPending(true)
    try {
      const { user } = await api<{ user: Me }>('/me', {
        method: 'PATCH',
        body: { name: name.trim() },
      })
      queryClient.setQueryData(meQuery.queryKey, user)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast({ title: 'Name saved', description: user.name })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your name.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" error={error}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
        </Field>
        <Field label="Email" hint="Ask an owner to change it.">
          {(id) => <Input id={id} value={me.email} readOnly disabled />}
        </Field>
      </div>
      <Button
        type="submit"
        className="self-start"
        loading={pending}
        disabled={!name.trim() || name.trim() === me.name}
      >
        Save name
      </Button>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<{ field: 'current' | 'next' | 'repeat'; message: string }>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (next.length < 8) return setError({ field: 'next', message: 'Use at least 8 characters.' })
    if (next === current)
      return setError({
        field: 'next',
        message: 'Choose a password different from your current one.',
      })
    if (next !== repeat)
      return setError({ field: 'repeat', message: 'The two new passwords don’t match.' })
    setError(undefined)
    setPending(true)
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    })
    setPending(false)
    if (err) {
      return setError(
        err.status === 400 || err.status === 401
          ? { field: 'current', message: 'That isn’t your current password.' }
          : { field: 'next', message: err.message ?? 'Could not change it.' },
      )
    }
    toast({ title: 'Password changed', description: 'Your other devices were signed out.' })
    setCurrent('')
    setNext('')
    setRepeat('')
  }

  const errorFor = (field: 'current' | 'next' | 'repeat') =>
    error?.field === field ? error.message : undefined
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Current password" error={errorFor('current')}>
          {(id) => (
            <PasswordInput
              id={id}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="New password" error={errorFor('next')}>
          {(id) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label="Confirm new password" error={errorFor('repeat')}>
          {(id) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Button
        type="submit"
        className="self-start"
        loading={pending}
        disabled={!current || !next || !repeat}
      >
        Change password
      </Button>
    </form>
  )
}

interface EmailMode {
  mode: 'off' | 'redirect' | 'blocked' | 'live'
  redirectTo: string | null
  from: string | null
}

const EMAIL_MODES: Record<
  EmailMode['mode'],
  { label: string; tone: string; text: (e: EmailMode) => string }
> = {
  redirect: {
    label: 'Test inbox',
    tone: 'bg-sand/20 text-ink',
    text: (e) =>
      `Every email goes to ${e.redirectTo}, never to clients. The subject says who it was meant for.`,
  },
  live: {
    label: 'Live',
    tone: 'bg-brand-soft text-brand-text',
    text: () => 'Emails go to the real people they’re meant for.',
  },
  blocked: {
    label: 'Held back',
    tone: 'bg-surface-raised text-ink-muted',
    text: () =>
      'This is a test site with no test inbox set (EMAIL_REDIRECT_TO), so nothing is sent. Emails are only written to the server log.',
  },
  off: {
    label: 'Not set up',
    tone: 'bg-surface-raised text-ink-muted',
    text: () =>
      'No email account is connected (AWS keys and EMAIL_FROM), so emails are only written to the server log.',
  },
}

function EmailSettings() {
  const status = useQuery({
    queryKey: ['admin', 'email'],
    queryFn: async () => (await api<{ email: EmailMode }>('/admin/email')).email,
  })
  const test = useMutation({
    mutationFn: () =>
      api<{ email: { status: 'sent' | 'logged' | 'failed'; to: string; error?: string } }>(
        '/admin/email/test',
        { method: 'POST' },
      ),
    onSuccess: ({ email }) =>
      toast(
        email.status === 'sent'
          ? { title: 'Test email sent', description: `Check ${email.to}` }
          : email.status === 'failed'
            ? { tone: 'error', title: 'Amazon refused it', description: email.error }
            : {
                tone: 'info',
                title: 'Not sent',
                description: 'Email isn’t set up here, so it was only written to the server log.',
              },
      ),
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t send it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const e = status.data
  if (!e) return <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
  const m = EMAIL_MODES[e.mode]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-md bg-surface-raised p-4">
        <Mail className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <span className={`self-start rounded-full px-2.5 py-0.5 font-bold text-[12px] ${m.tone}`}>
            {m.label}
          </span>
          <p className="text-[14px]">{m.text(e)}</p>
          {e.from && <p className="truncate text-[13px] text-ink-muted">Sent from {e.from}</p>}
        </div>
      </div>
      <Button
        variant="secondary"
        className="self-start"
        icon={<Send className="size-4" aria-hidden />}
        loading={test.isPending}
        onClick={() => test.mutate()}
      >
        Send a test email
      </Button>
    </div>
  )
}
