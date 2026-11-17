import { ApiError, api } from '@project180/client'
import { Button, toast } from '@project180/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Mail, Send } from 'lucide-react'

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

/** Where this site's email goes, and a test email to yourself (platform admin only). */
export function EmailSettings() {
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
