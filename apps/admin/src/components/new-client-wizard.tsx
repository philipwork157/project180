import {
  ApiError,
  api,
  coachesQuery,
  invitationsQuery,
  programsQuery,
  usersQuery,
} from '@project180/client'
import {
  type CreateUserInput,
  createUserInput,
  GOAL_LABELS,
  generateTempPassword,
  INVITE_DAYS,
  type Invitation,
  isOwner,
  isStaff,
  type Me,
  type Role,
  TEMP_PASSWORD_DAYS,
} from '@project180/shared'
import {
  Button,
  buttonClasses,
  cn,
  DatePicker,
  Drawer,
  Field,
  Input,
  Select,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { APP_URL } from '../urls'
import { nextMonday } from './assign-form'
import {
  BodyFields,
  draftToInput,
  EMPTY_PROFILE,
  GoalFields,
  type ProfileDraft,
} from './client-profile'

const STEPS = ['Who', 'Body', 'Goals', 'Program'] as const
/** wa.me wants international numbers; South African 0XX numbers become 27XX. */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return `27${digits.slice(1)}`
  return digits
}

type EmailResult = { status: 'sent' | 'logged' | 'failed'; to: string; error?: string } | null

interface Created {
  name: string
  email: string
  /** Staff only: the temporary password. Clients get a link instead. */
  password: string | null
  phone: string
  emailResult: EmailResult
  /** Clients: the link to choose their password. Not sent yet: the coach sends it. */
  link: string | null
  /** The invitation, to email it from here when the coach is ready. */
  invitationId: number | null
  /** The email already belonged to someone training on their own: they were invited instead. */
  invited: boolean
}

type CreateReply = { email: EmailResult; link?: string; invited?: true; invitationId?: number }

/**
 * Add a client (or, for owners, a coach) in four short steps. A client gets a link to choose
 * their own password (by email, and to copy or send on WhatsApp); their profile, goals, program
 * and check-in are ready when they open it. Coaches get a temporary password.
 */
export function NewClientDrawer({
  open,
  onClose,
  me,
}: {
  open: boolean
  onClose: () => void
  me: Me
}) {
  const [key, setKey] = useState(0)
  const close = () => {
    onClose()
    // Start fresh next time.
    setTimeout(() => setKey((k) => k + 1), 300)
  }
  return <Wizard key={key} open={open} onClose={close} me={me} />
}

function Wizard({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me }) {
  const queryClient = useQueryClient()
  const owner = isOwner(me.role)
  const coaches = useQuery({ ...coachesQuery, enabled: owner && open })
  const programs = useQuery({ ...programsQuery(), enabled: open })
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string>()
  const [created, setCreated] = useState<Created | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generateTempPassword())
  // Owners add coaches, other owners or clients; never a platform admin (that's a script).
  const [role, setRole] = useState<Exclude<Role, 'platform'>>('member')
  const [coachId, setCoachId] = useState<number>(me.id)
  const [profile, setProfile] = useState<ProfileDraft>(EMPTY_PROFILE)
  const [weightNow, setWeightNow] = useState('')
  const [programId, setProgramId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(() => nextMonday(me.timezone))
  const [checkInDate, setCheckInDate] = useState<string | null>(null)
  const [checkInRepeat, setCheckInRepeat] = useState<'1' | '2' | '4' | 'once'>('2')
  const [sendWelcome, setSendWelcome] = useState(true)

  const updateProfile = (patch: Partial<ProfileDraft>) => setProfile((p) => ({ ...p, ...patch }))
  const first = name.trim().split(' ')[0] || 'them'
  const isClient = !isStaff(role)
  // Programs stay between a client and their own coach, so only you can give yours one.
  const otherCoach = owner && isClient && coachId !== me.id
  const coachName = coaches.data?.find((c) => c.id === coachId)?.name ?? 'Their coach'

  const create = useMutation({
    mutationFn: (input: CreateUserInput) =>
      api<CreateReply>('/admin/users', { method: 'POST', body: input }),
  })

  function checkWho(): string | undefined {
    // Clients choose their own password from the link; only staff get a temporary one.
    const who = createUserInput.pick({ name: true, email: true, password: true })
    const parsed = (isClient ? who : who.required({ password: true })).safeParse({
      name,
      email,
      password: isClient ? undefined : password,
    })
    return parsed.success ? undefined : parsed.error.issues[0]?.message
  }

  function next() {
    if (step === 0) {
      const problem = checkWho()
      if (problem) return setError(problem)
    }
    setError(undefined)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function finish() {
    const problem = checkWho()
    if (problem) {
      setStep(0)
      return setError(problem)
    }
    setError(undefined)
    const weight = Number.parseFloat(weightNow.replace(',', '.'))
    try {
      const res = await create.mutateAsync({
        name,
        email,
        ...(isClient ? {} : { password }),
        role: owner ? role : 'member',
        coachId: owner && isClient ? coachId : undefined,
        profile: draftToInput(profile),
        currentWeightKg: Number.isFinite(weight) ? weight : null,
        program: programId && !otherCoach ? { programId, startDate } : null,
        checkIn:
          isClient && !otherCoach && checkInDate
            ? {
                dueDate: checkInDate,
                repeatWeeks: checkInRepeat === 'once' ? null : (Number(checkInRepeat) as 1 | 2 | 4),
              }
            : null,
        sendWelcome: isClient ? false : sendWelcome,
      })
      void queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      void queryClient.invalidateQueries({ queryKey: invitationsQuery.queryKey })
      toast({
        title: res.invited ? 'Invitation ready' : isClient ? 'Client added' : 'Coach added',
        description: res.invited
          ? `${name} already uses the app: they accept on their Today screen.`
          : isClient
            ? `Send ${name} their link when you’re ready.`
            : `${name} can sign in now.`,
      })
      setCreated({
        name,
        email: email.trim().toLowerCase(),
        password: isClient ? null : password,
        phone: profile.phone,
        emailResult: res.email ?? null,
        link: res.link ?? null,
        invitationId: res.invitationId ?? null,
        invited: Boolean(res.invited),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add them. Try again.')
    }
  }

  const last = step === STEPS.length - 1
  const footer = created ? (
    <Button onClick={onClose}>Done</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
        {step === 0 ? 'Cancel' : 'Back'}
      </Button>
      {last ? (
        <Button loading={create.isPending} onClick={finish}>
          {isClient ? 'Add client' : 'Add coach'}
        </Button>
      ) : (
        <Button onClick={next}>{step > 0 ? 'Next' : 'Continue'}</Button>
      )}
    </>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        created
          ? created.invited
            ? `${created.name.split(' ')[0]} is invited`
            : `${created.name.split(' ')[0]} is set up`
          : owner
            ? 'Add a person'
            : 'Add a client'
      }
      description={
        created
          ? created.link || created.invited
            ? 'Nothing has been sent yet.'
            : 'Share their sign-in details.'
          : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`
      }
      footer={footer}
    >
      {created ? (
        <Done created={created} />
      ) : (
        <div className="flex flex-col gap-6">
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Steps">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > step && Boolean(checkWho())}
                  onClick={() => (i <= step || !checkWho() ? setStep(i) : undefined)}
                  className="flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed"
                >
                  <span
                    className={cn(
                      'h-1.5 rounded-pill transition-colors',
                      i <= step ? 'bg-lime' : 'bg-surface-raised',
                    )}
                  />
                  <span
                    className={cn(
                      'font-bold text-[12px]',
                      i === step ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    {label}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-5"
            >
              {step === 0 && (
                <>
                  <Field label="Full name">
                    {(id) => (
                      <Input
                        id={id}
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Sam Naidoo"
                      />
                    )}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email" hint="They sign in with this">
                      {(id) => (
                        <Input
                          id={id}
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Phone" hint="Optional, for WhatsApp">
                      {(id) => (
                        <Input
                          id={id}
                          type="tel"
                          placeholder="082 123 4567"
                          value={profile.phone}
                          onChange={(e) => updateProfile({ phone: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                  {isClient ? (
                    <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
                      {first === 'them' ? 'They get' : `${first} gets`} a link by email (you can
                      also send it on WhatsApp) to choose their own password. Everything you set up
                      here is ready when they open it.
                    </p>
                  ) : (
                    <Field
                      label="Temporary password"
                      hint={`Works for ${TEMP_PASSWORD_DAYS} days. They choose their own the first time they sign in.`}
                      error={error}
                    >
                      {(id) => (
                        <div className="flex gap-2">
                          <Input
                            id={id}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="font-mono"
                          />
                          <Button
                            variant="secondary"
                            className="shrink-0"
                            icon={<RefreshCw className="size-4" aria-hidden />}
                            onClick={() => setPassword(generateTempPassword())}
                          >
                            New
                          </Button>
                        </div>
                      )}
                    </Field>
                  )}
                  {error && isClient && step === 0 && (
                    <p role="alert" className="font-semibold text-[14px] text-danger">
                      {error}
                    </p>
                  )}
                  {owner && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Role">
                        {(id) => (
                          <Select
                            id={id}
                            value={role}
                            onChange={(e) => setRole(e.target.value as Exclude<Role, 'platform'>)}
                          >
                            <option value="member">Client</option>
                            <option value="admin">Coach (sees only their own clients)</option>
                            <option value="owner">Owner (sees everyone)</option>
                          </Select>
                        )}
                      </Field>
                      {isClient && (coaches.data?.length ?? 0) > 1 && (
                        <Field label="Coach">
                          {(id) => (
                            <Select
                              id={id}
                              value={coachId}
                              onChange={(e) => setCoachId(Number(e.target.value))}
                            >
                              {(coaches.data ?? [{ id: me.id, name: me.name }]).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.id === me.id ? `${c.name} (you)` : c.name}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Field>
                      )}
                    </div>
                  )}
                </>
              )}

              {step === 1 && (
                <>
                  <p className="text-[14px] text-ink-muted">
                    All optional. Today’s weight becomes {first}’s first weigh-in, so the chart
                    starts now.
                  </p>
                  <BodyFields
                    draft={profile}
                    onChange={updateProfile}
                    currentWeight={weightNow}
                    onCurrentWeight={setWeightNow}
                  />
                </>
              )}

              {step === 2 && <GoalFields draft={profile} onChange={updateProfile} />}

              {step === 3 && (
                <>
                  {otherCoach ? (
                    <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
                      {coachName} gives {first} a program. Programs stay between a client and their
                      own coach.
                    </p>
                  ) : (
                    <Field
                      label="Program"
                      hint={`Optional. ${first} gets their own copy you can tweak later.`}
                    >
                      {(id) => (
                        <Select
                          id={id}
                          value={programId ?? ''}
                          onChange={(e) =>
                            setProgramId(e.target.value ? Number(e.target.value) : null)
                          }
                        >
                          <option value="">No program yet</option>
                          {(programs.data ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.durationWeeks} wks
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
                  {programId && !otherCoach && (
                    <Field label="Start date">
                      {(id) => <DatePicker id={id} value={startDate} onChange={setStartDate} />}
                    </Field>
                  )}
                  {isClient && !otherCoach && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        label="First check-in"
                        hint={`Optional. ${first} is reminded the evening before and on the day.`}
                      >
                        {(id) => (
                          <DatePicker
                            id={id}
                            value={checkInDate}
                            onChange={setCheckInDate}
                            onClear={() => setCheckInDate(null)}
                            placeholder="No check-in yet"
                          />
                        )}
                      </Field>
                      <Field label="Then">
                        {(id) => (
                          <Select
                            id={id}
                            value={checkInRepeat}
                            disabled={!checkInDate}
                            onChange={(e) =>
                              setCheckInRepeat(e.target.value as '1' | '2' | '4' | 'once')
                            }
                          >
                            <option value="1">Every week</option>
                            <option value="2">Every 2 weeks</option>
                            <option value="4">Every 4 weeks</option>
                            <option value="once">Just this once</option>
                          </Select>
                        )}
                      </Field>
                    </div>
                  )}
                  {!isClient && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-raised p-4">
                      <input
                        type="checkbox"
                        checked={sendWelcome}
                        onChange={(e) => setSendWelcome(e.target.checked)}
                        className="mt-0.5 size-5 accent-[var(--brand)]"
                      />
                      <span>
                        <span className="block font-bold text-[15px]">
                          Email {first} their sign-in details
                        </span>
                        <span className="text-[13px] text-ink-muted">
                          A welcome email with the link and temporary password.
                        </span>
                      </span>
                    </label>
                  )}
                  <Summary
                    rows={[
                      ['Name', name || '–'],
                      ['Email', email || '–'],
                      ['Main goal', profile.mainGoal ? GOAL_LABELS[profile.mainGoal] : 'Not set'],
                      [
                        'Program',
                        otherCoach
                          ? `Set by ${coachName}`
                          : (programs.data?.find((p) => p.id === programId)?.name ?? 'None yet'),
                      ],
                    ]}
                  />
                  {error && (
                    <p role="alert" className="font-semibold text-[14px] text-danger">
                      {error}
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </Drawer>
  )
}

function Summary({ rows }: { rows: Array<[string, string | undefined]> }) {
  const shown = rows.filter((r): r is [string, string] => r[1] !== undefined)
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-ink-muted">{k}</dt>
          <dd className="truncate font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Done({ created }: { created: Created }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  // Emailing makes a fresh link (the old one stops working), so the message follows it.
  const [link, setLink] = useState(created.link)
  const [emailedTo, setEmailedTo] = useState<string | null>(null)
  const sendEmail = useMutation({
    mutationFn: () =>
      api<{ invitations: Invitation[]; link?: string }>(
        `/admin/invitations/${created.invitationId}/resend`,
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(invitationsQuery.queryKey, res.invitations)
      if (res.link) setLink(res.link)
      setEmailedTo(created.email)
      toast({ title: 'Link emailed', description: `On its way to ${created.email}.` })
    },
    onError: (err) =>
      toast({
        title: 'Couldn’t send it',
        description: err instanceof ApiError ? err.message : 'Try again.',
        tone: 'error',
      }),
  })
  const first = created.name.split(' ')[0] ?? created.name
  const message = created.invited
    ? null
    : link
      ? `Hi ${first}, I’ve set you up on Project 180: your program and goals are ready.\n\nTap this link to choose your password and you’re in:\n${link}\n\nIt works for ${INVITE_DAYS} days. On your phone, “Add to Home Screen” once you’re in to install the app.`
      : `Hi ${first}, you're set up on Project 180.\n\nSign in: ${APP_URL}/login\nEmail: ${created.email}\nTemporary password: ${created.password}\n\nYou'll choose your own password when you first sign in. On your phone, open the link and "Add to Home Screen" to install it.`
  const wa = message
    ? `https://wa.me/${created.phone ? whatsappNumber(created.phone) : ''}?text=${encodeURIComponent(message)}`
    : null
  const r = created.emailResult
  const emailLine = emailedTo
    ? {
        ok: true,
        text: created.invited
          ? `Emailed ${emailedTo} too. They can accept from the email or their Today screen.`
          : `Emailed ${emailedTo} a link to choose their password (works ${INVITE_DAYS} days). The message below has the same new link.`,
      }
    : created.invited
      ? {
          ok: true,
          text: `${created.email} already uses the app on their own, so they get an invitation instead: it’s waiting on their Today screen, and nothing was emailed. They keep everything they’ve logged. Their body details, goals and program weren’t saved: set them up on their client page once they’ve accepted.`,
        }
      : created.link
        ? {
            ok: true,
            neutral: true,
            text: `Nothing has been sent to ${first} yet. When you’re ready, email the link, send it on WhatsApp or copy the message. You’ll also find ${first} under Waiting to join on Clients.`,
          }
        : !r
          ? null
          : r.status === 'sent'
            ? r.to === created.email
              ? { ok: true, text: `Welcome email sent to ${r.to}.` }
              : {
                  ok: true,
                  text: `Dev: the welcome email went to ${r.to} instead of ${created.email}.`,
                }
            : r.status === 'logged'
              ? {
                  ok: false,
                  text: 'Email isn’t set up yet (no AWS keys), so nothing was sent. Share the details below.',
                }
              : {
                  ok: false,
                  text: `The email couldn’t be sent: ${r.error ?? 'unknown error'}. Share the details below.`,
                }

  return (
    <div className="flex flex-col gap-5">
      <motion.span
        initial={{ scale: 0.5 }}
        animate={{ scale: [0.5, 1.12, 1] }}
        className="grid size-16 place-items-center rounded-full bg-lime text-on-lime"
      >
        <Check className="size-8" strokeWidth={3} aria-hidden />
      </motion.span>
      {emailLine && (
        <p
          className={cn(
            'flex items-start gap-2 rounded-md p-3 font-semibold text-[14px]',
            'neutral' in emailLine
              ? 'bg-surface-raised text-ink'
              : emailLine.ok
                ? 'bg-brand-soft text-brand-text'
                : 'bg-sand/25 text-sand-text',
          )}
        >
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          {emailLine.text}
        </p>
      )}
      {created.invitationId !== null && !emailedTo && (
        <Button
          className="self-start"
          icon={<Mail className="size-4" aria-hidden />}
          loading={sendEmail.isPending}
          onClick={() => sendEmail.mutate()}
        >
          {created.invited ? `Email ${first} too` : `Email the link to ${first}`}
        </Button>
      )}
      {message && wa && (
        <>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-raised p-4 font-sans text-[14px] leading-6">
            {message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={
                copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )
              }
              onClick={async () => {
                await navigator.clipboard.writeText(message)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied' : link ? 'Copy message' : 'Copy details'}
            </Button>
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('secondary')}>
              <MessageCircle className="size-4" aria-hidden />
              Send on WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  )
}
