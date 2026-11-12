import { personStatsQuery, usersQuery } from '@project180/client'
import { formatNumber, isStaff, type PersonStats, timeAgo } from '@project180/shared'
import { Card, cn, Field, Select, StatCard } from '@project180/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ArrowLeft, ArrowLeftRight, Trophy } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Segmented } from '../../components/controls'
import { PageHeader } from '../../components/page-header'
import { Bars, NumbersTable, shortDay, TrendLine } from '../../components/progress-charts'
import { SwapsLine } from '../../components/swaps-line'

export const Route = createFileRoute('/_dash/users_/$userId')({
  beforeLoad: ({ context }) => {
    if (!isStaff(context.me.role)) throw redirect({ to: '/' })
  },
  component: PersonProgressPage,
})

const RANGES = [
  { value: '4', label: '4 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '6 months' },
] as const
type Range = (typeof RANGES)[number]['value']

const FEELINGS = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great']

function PersonProgressPage() {
  const { me } = Route.useRouteContext()
  const userId = Number(Route.useParams().userId)
  const [range, setRange] = useState<Range>('12')
  const people = useQuery(usersQuery)
  const person = people.data?.find((u) => u.id === userId)
  // Changing the range keeps the last numbers on screen (dimmed) while the new ones load.
  const stats = useQuery({
    ...personStatsQuery(userId, Number(range)),
    placeholderData: keepPreviousData,
  })
  const isMe = userId === me.id
  const name = isMe ? 'Your' : person ? `${person.name.split(' ')[0]}’s` : 'Their'

  return (
    <div>
      <Link
        to="/users"
        className="mb-4 inline-flex h-11 items-center gap-2 rounded-sm font-bold text-[14px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        People
      </Link>
      <PageHeader
        title={`${name} progress`}
        subtitle={
          stats.data?.recent[0]
            ? `Last workout ${timeAgo(stats.data.recent[0].startedAt)}`
            : 'Workouts they finish in the app show up here.'
        }
        action={
          <Segmented
            label="Time range"
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      />
      {stats.isError ? (
        <Card>
          <p className="text-[14px] text-ink-muted">Couldn’t load their progress. Try again.</p>
        </Card>
      ) : !stats.data ? (
        <p className="text-[14px] text-ink-muted">Loading…</p>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-5 transition-opacity',
            stats.isPlaceholderData && 'opacity-60',
          )}
        >
          <Summary stats={stats.data} />
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <VolumeCard stats={stats.data} />
            <StrengthCard stats={stats.data} />
            <BodyWeightCard stats={stats.data} />
            <RecordsCard stats={stats.data} />
            <SwapsCard stats={stats.data} />
            <RecentCard stats={stats.data} />
          </div>
        </div>
      )}
    </div>
  )
}

function Summary({ stats }: { stats: PersonStats }) {
  const planned = stats.planned
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Workouts" value={stats.workouts} />
      <StatCard
        tone="lime"
        label="Done as planned"
        value={planned && planned.due > 0 ? Math.round((planned.done / planned.due) * 100) : '–'}
        unit={planned && planned.due > 0 ? '%' : undefined}
        delta={
          planned
            ? planned.due > 0
              ? `${planned.done} of ${planned.due} program workouts`
              : 'Nothing due yet'
            : 'No program'
        }
      />
      <StatCard tone="clay" label="Volume" value={formatNumber(stats.volumeKg)} unit="kg" />
      <StatCard tone="steel" label="Avg time" value={stats.avgMinutes ?? '–'} unit="min" />
      <StatCard
        tone="sand"
        label="Avg feeling"
        value={stats.avgFeeling === null ? '–' : FEELINGS[Math.round(stats.avgFeeling)]}
        className="col-span-2 md:col-span-1"
      />
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">{title}</h2>
          {description && <p className="text-[14px] text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

const workoutsLabel = (n: number) => `${n} workout${n === 1 ? '' : 's'}`

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">{children}</p>
}

function VolumeCard({ stats }: { stats: PersonStats }) {
  const weeks = stats.weeks
  return (
    <Section title="Weekly volume" description="Kilograms lifted per week (weight × reps).">
      {stats.workouts === 0 ? (
        <Empty>No workouts in this time range yet.</Empty>
      ) : (
        <>
          <Bars
            label="Volume per week"
            barClass="bg-clay"
            first={`Week of ${shortDay(weeks[0]?.weekStart ?? '')}`}
            last="This week"
            data={weeks.map((w) => ({
              key: w.weekStart,
              value: w.volumeKg,
              valueText: `${formatNumber(w.volumeKg)} kg`,
              label: `Week of ${shortDay(w.weekStart)} · ${workoutsLabel(w.workouts)}`,
            }))}
          />
          <NumbersTable
            head={['Week of', 'Workouts', 'Volume', 'Time']}
            rows={weeks.map((w) => ({
              key: w.weekStart,
              cells: [
                shortDay(w.weekStart),
                w.workouts,
                `${formatNumber(w.volumeKg)} kg`,
                `${w.minutes} min`,
              ],
            }))}
          />
        </>
      )}
    </Section>
  )
}

function StrengthCard({ stats }: { stats: PersonStats }) {
  const [picked, setPicked] = useState<number | null>(null)
  const lift = stats.strength.find((s) => s.exerciseId === picked) ?? stats.strength[0]
  const points = (lift?.points ?? []).map((p) => ({
    date: p.date,
    value: p.oneRepMax ?? p.bestWeightKg,
    valueText: `${formatNumber(p.oneRepMax ?? p.bestWeightKg)} kg est. max`,
    detail: `heaviest set ${formatNumber(p.bestWeightKg)} kg`,
  }))
  const first = points[0]?.value
  const last = points.at(-1)?.value
  const change = first !== undefined && last !== undefined ? last - first : 0
  return (
    <Section
      title="Strength"
      description="Estimated one-rep max per workout, from their best set."
      action={
        stats.strength.length > 0 && (
          <div className="w-full sm:w-56">
            <Field label="Exercise">
              {(id) => (
                <Select
                  id={id}
                  value={lift?.exerciseId ?? ''}
                  onChange={(e) => setPicked(Number(e.target.value))}
                >
                  {stats.strength.map((s) => (
                    <option key={s.exerciseId} value={s.exerciseId}>
                      {s.exerciseName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )
      }
    >
      {!lift ? (
        <Empty>Strength shows up once they log weights on an exercise.</Empty>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="metric text-[28px] leading-8">
              {formatNumber(last ?? 0)}
              <span className="ml-1 font-bold font-sans text-[15px] not-italic">kg</span>
            </span>
            {points.length > 1 && (
              <span
                className={cn(
                  'font-bold text-[14px]',
                  change > 0 ? 'text-lime-text' : 'text-ink-muted',
                )}
              >
                {change > 0 ? '+' : change < 0 ? '−' : '±'}
                {formatNumber(Math.abs(change))} kg since {shortDay(points[0]?.date ?? '')}
              </span>
            )}
          </p>
          <TrendLine
            points={points}
            lineClass="text-brand-text"
            label={`${lift.exerciseName} estimated max`}
            unit="kg"
          />
          <NumbersTable
            head={['Date', 'Heaviest set', 'Est. max']}
            rows={(lift.points ?? []).map((p, i) => ({
              key: `${p.date}-${i}`,
              cells: [
                shortDay(p.date),
                `${formatNumber(p.bestWeightKg)} kg`,
                p.oneRepMax === null ? '–' : `${formatNumber(p.oneRepMax)} kg`,
              ],
            }))}
          />
        </>
      )}
    </Section>
  )
}

function BodyWeightCard({ stats }: { stats: PersonStats }) {
  const points = stats.bodyWeight.map((p) => ({
    date: p.date,
    value: p.weightKg,
    valueText: `${formatNumber(p.weightKg)} kg`,
  }))
  const first = points[0]?.value
  const last = points.at(-1)?.value
  return (
    <Section title="Body weight" description="Every weigh-in they’ve logged.">
      {points.length === 0 ? (
        <Empty>No weigh-ins yet. They can log one from the app’s Progress tab.</Empty>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="metric text-[28px] leading-8">
              {formatNumber(last ?? 0)}
              <span className="ml-1 font-bold font-sans text-[15px] not-italic">kg</span>
            </span>
            {points.length > 1 && first !== undefined && last !== undefined && (
              <span className="font-bold text-[14px] text-ink-muted">
                {last > first ? '+' : last < first ? '−' : '±'}
                {formatNumber(Math.abs(last - first))} kg since {shortDay(points[0]?.date ?? '')}
              </span>
            )}
          </p>
          <TrendLine points={points} lineClass="text-sand" label="Body weight" unit="kg" />
          <NumbersTable
            head={['Date', 'Weight']}
            rows={points.map((p) => ({
              key: p.date,
              cells: [shortDay(p.date), `${formatNumber(p.value)} kg`],
            }))}
          />
        </>
      )}
    </Section>
  )
}

function RecordsCard({ stats }: { stats: PersonStats }) {
  return (
    <Section title="Personal records" description="Their heaviest set on each exercise, ever.">
      {stats.records.length === 0 ? (
        <Empty>No records yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md bg-surface-raised">
          {stats.records.map((r) => (
            <li key={r.exerciseId} className="flex items-center gap-3 px-4 py-3">
              <Trophy className="size-4 shrink-0 text-sand-text" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-bold text-[14px]">
                {r.exerciseName}
              </span>
              <span className="tabular font-semibold text-[13px] text-ink-muted">
                {formatNumber(r.bestWeightKg)} kg
                {r.bestOneRepMax !== null && ` · est. max ${formatNumber(r.bestOneRepMax)} kg`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SwapsCard({ stats }: { stats: PersonStats }) {
  return (
    <Section
      title="Swaps"
      description="Exercises they swapped during workouts. A swap that keeps coming back may be worth changing in their program."
    >
      {stats.swaps.length === 0 ? (
        <Empty>No swaps in this time range.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md bg-surface-raised">
          {stats.swaps.map((s) => (
            <li
              key={`${s.fromName}-${s.toName}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 font-bold text-[14px]">
                <span className="truncate">{s.fromName}</span>
                <ArrowLeftRight className="size-3.5 shrink-0 text-brand-text" aria-label="to" />
                <span className="truncate">{s.toName}</span>
              </span>
              <span className="tabular font-semibold text-[13px] text-ink-muted">
                {s.times}× {s.lastDate && `· last ${shortDay(s.lastDate)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function RecentCard({ stats }: { stats: PersonStats }) {
  return (
    <Section title="Latest workouts">
      {stats.recent.length === 0 ? (
        <Empty>No finished workouts yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md bg-surface-raised">
          {stats.recent.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 truncate font-bold text-[14px]">
                  {s.workoutName ?? 'Workout'}
                </span>
                <span className="tabular font-semibold text-[13px] text-ink-muted">
                  {timeAgo(s.startedAt)} · {s.setCount} {s.setCount === 1 ? 'set' : 'sets'}
                  {s.volumeKg ? ` · ${formatNumber(Math.round(s.volumeKg))} kg` : ''}
                  {s.feeling ? ` · felt ${FEELINGS[s.feeling]?.toLowerCase()}` : ''}
                </span>
              </div>
              <SwapsLine swaps={s.swaps} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
