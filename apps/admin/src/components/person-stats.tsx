import { clientProfileQuery, personStatsQuery } from '@project180/client'
import {
  formatNumber,
  type PersonStats as PersonStatsData,
  timeAgo,
  todayIn,
} from '@project180/shared'
import { Card, cn, Field, Select, StatCard, WeightChart } from '@project180/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ChevronRight, Trophy } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Segmented } from './controls'
import { Bars, NumbersTable, shortDay, TrendLine } from './progress-charts'
import { SessionStatusTag } from './session-status'
import { SwapsLine } from './swaps-line'
import { type OpenWorkout, WorkoutReviewDrawer } from './workout-review'

const RANGES = [
  { value: '4', label: '4 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '6 months' },
] as const
type Range = (typeof RANGES)[number]['value']

const FEELINGS = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great']

/**
 * Progress for one person (their client page's Progress tab, or My training): workouts, volume,
 * strength, body weight, records, swaps and their latest workouts, over a time range.
 */
export function PersonStats({ userId, name }: { userId: number; name: string }) {
  const [range, setRange] = useState<Range>('12')
  const [review, setReview] = useState<OpenWorkout | null>(null)
  // Changing the range keeps the last numbers on screen (dimmed) while the new ones load.
  const stats = useQuery({
    ...personStatsQuery(userId, Number(range)),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[14px] text-ink-muted">
          {stats.data?.recent[0]
            ? `Last workout ${timeAgo(stats.data.recent[0].startedAt).toLowerCase()}`
            : 'Workouts they finish in the app show up here.'}
        </p>
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>
      {stats.isError ? (
        <Card>
          <p className="text-[14px] text-ink-muted">Couldn’t load the progress. Try again.</p>
        </Card>
      ) : !stats.data ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-5 transition-opacity',
            stats.isPlaceholderData && 'opacity-60',
          )}
        >
          <Summary stats={stats.data} />
          {/* Two columns of their own on a laptop (so a short card never leaves a hole beside a
              tall one): the two charts on the left, what they did on the right. */}
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-5">
              <VolumeCard stats={stats.data} />
              <BodyWeightCard stats={stats.data} userId={userId} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <RecentCard
                stats={stats.data}
                onOpen={(sessionId) => setReview({ userId, sessionId, name })}
              />
              <StrengthCard stats={stats.data} />
              <RecordsCard stats={stats.data} />
              <SwapsCard stats={stats.data} />
            </div>
          </div>
        </div>
      )}
      <WorkoutReviewDrawer workout={review} onClose={() => setReview(null)} />
    </div>
  )
}

function Summary({ stats }: { stats: PersonStatsData }) {
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

function VolumeCard({ stats }: { stats: PersonStatsData }) {
  const weeks = stats.weeks
  return (
    <Section title="Weekly volume" description="Kilograms lifted per week (weight × reps).">
      {stats.workouts === 0 ? (
        <Empty>No workouts in this time range yet.</Empty>
      ) : stats.volumeKg === 0 ? (
        <Empty>
          No weights logged in this range yet. Bodyweight and timed exercises don’t add volume.
        </Empty>
      ) : (
        <>
          <Bars
            label="Volume per week"
            ticks={weeks.map((w) => shortDay(w.weekStart))}
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

function StrengthCard({ stats }: { stats: PersonStatsData }) {
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

function BodyWeightCard({ stats, userId }: { stats: PersonStatsData; userId: number }) {
  // Their goal weight (from their profile) shows as the dashed line, like on their phone.
  const goalKg = useQuery(clientProfileQuery(userId)).data?.goalWeightKg ?? null
  return (
    <Section title="Body weight" description="Every weigh-in they’ve logged.">
      <WeightChart
        embedded
        points={stats.bodyWeight}
        today={todayIn('Africa/Johannesburg')}
        goalKg={goalKg}
        emptyText={{
          none: 'No weigh-ins yet. They log them from the app on weigh-in days.',
          one: 'One more weigh-in and their trend line shows up here.',
        }}
      />
      {stats.bodyWeight.length > 0 && (
        <NumbersTable
          head={['Date', 'Weight']}
          rows={[...stats.bodyWeight].reverse().map((p) => ({
            key: p.date,
            cells: [shortDay(p.date), `${formatNumber(p.weightKg)} kg`],
          }))}
        />
      )}
    </Section>
  )
}

function RecordsCard({ stats }: { stats: PersonStatsData }) {
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

function SwapsCard({ stats }: { stats: PersonStatsData }) {
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

function RecentCard({
  stats,
  onOpen,
}: {
  stats: PersonStatsData
  onOpen: (sessionId: number) => void
}) {
  return (
    <Section title="Latest workouts">
      {stats.recent.length === 0 ? (
        <Empty>No finished workouts yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md bg-surface-raised">
          {stats.recent.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-border/40 active:scale-[0.99]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate font-bold text-[14px]">
                      {s.workoutName ?? 'Workout'}
                      <SessionStatusTag status={s.status} />
                    </span>
                    <span className="tabular font-semibold text-[13px] text-ink-muted">
                      {timeAgo(s.startedAt)} · {s.setCount} {s.setCount === 1 ? 'set' : 'sets'}
                      {s.volumeKg ? ` · ${formatNumber(Math.round(s.volumeKg))} kg` : ''}
                      {s.feeling ? ` · felt ${FEELINGS[s.feeling]?.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <SwapsLine swaps={s.swaps} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
