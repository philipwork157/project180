import { statsQuery } from '@project180/client'
import {
  formatDuration,
  formatNumber,
  formatWeight,
  type MyStats,
  todayIn,
} from '@project180/shared'
import { cn, EmptyState, StatCard } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronRight, TrendingUp, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { ScreenHeader } from '../../components/screen-header'
import { SessionDetails } from '../../components/session-details'
import { Sheet } from '../../components/sheet'
import { WeighIn } from '../../components/weigh-in'

export const Route = createFileRoute('/_app/progress')({
  component: ProgressPage,
})

const FEELINGS = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great']

function ProgressPage() {
  const { me } = Route.useRouteContext()
  const stats = useQuery(statsQuery(8))
  const s = stats.data
  const [openSession, setOpenSession] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader overline="Last 8 weeks" title="Progress" />
      {stats.isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      ) : !s ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard tone="brand" label="Workouts" value={s.workouts} />
            <StatCard tone="clay" label="Volume" value={formatNumber(s.volumeKg)} unit="kg" />
            <StatCard tone="steel" label="Avg time" value={s.avgMinutes ?? '–'} unit="min" />
            <StatCard
              tone="sand"
              label="Avg feeling"
              value={s.avgFeeling ? s.avgFeeling.toFixed(1) : '–'}
              unit="/ 5"
            />
          </div>

          {s.workouts === 0 && s.recent.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="size-7" aria-hidden />}
              title="Charts appear after your first workout"
            >
              Volume, gym time, how you felt and body weight, week by week.
            </EmptyState>
          ) : (
            <WeeklyVolume weeks={s.weeks} />
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-bold text-[17px]">Body weight</h2>
            <WeighIn date={todayIn(me.timezone)} statsWeeks={8} />
            {s.bodyWeight.length > 1 && <WeightLine points={s.bodyWeight} />}
            {s.bodyWeight.length === 1 && (
              <p className="text-[14px] text-ink-muted">
                {formatWeight(s.bodyWeight[0]?.weightKg ?? 0)} kg on {s.bodyWeight[0]?.date}. Log
                again to see the trend.
              </p>
            )}
          </section>

          {s.records.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-bold text-[17px]">
                <Trophy className="size-5 text-sand-text" aria-hidden />
                Personal records
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {s.records.map((r) => (
                  <li
                    key={r.exerciseId}
                    className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold">{r.exerciseName}</span>
                    <span className="text-right">
                      <span className="tabular block font-bold font-display text-[20px]">
                        {formatWeight(r.bestWeightKg)} kg
                      </span>
                      {r.bestOneRepMax && (
                        <span className="font-semibold text-[12px] text-ink-muted">
                          est. 1-rep max {formatWeight(r.bestOneRepMax)} kg
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.recent.length > 0 && (
            <section>
              <h2 className="mb-3 font-bold text-[17px]">Recent workouts</h2>
              <ul className="flex flex-col gap-2">
                {s.recent.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenSession(r.id)}
                      className="flex w-full items-center gap-3 rounded-lg bg-surface p-4 text-left shadow-card transition hover:ring-2 hover:ring-brand active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{r.workoutName ?? 'Workout'}</p>
                        <p className="font-semibold text-[13px] text-ink-muted">
                          {new Intl.DateTimeFormat('en-ZA', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            timeZone: me.timezone,
                          }).format(new Date(r.startedAt))}
                          {r.feeling ? ` · felt ${FEELINGS[r.feeling]?.toLowerCase()}` : ''}
                        </p>
                      </div>
                      <span className="text-right font-semibold text-[13px] text-ink-muted">
                        <span className="tabular block font-bold text-[15px] text-ink">
                          {formatNumber(r.volumeKg)} kg
                        </span>
                        {formatDuration(r.durationSeconds ?? 0)} · {r.setCount}{' '}
                        {r.setCount === 1 ? 'set' : 'sets'}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <Sheet
        open={openSession !== null}
        onClose={() => setOpenSession(null)}
        label="Workout details"
      >
        {openSession !== null && (
          <div className="pb-4">
            <SessionDetails sessionId={openSession} timezone={me.timezone} />
          </div>
        )}
      </Sheet>
    </div>
  )
}

function WeeklyVolume({ weeks }: { weeks: MyStats['weeks'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.volumeKg))
  // Day on top; the month underneath only where it changes, so every label is the same height.
  const monthOf = (d: string) =>
    new Intl.DateTimeFormat('en-ZA', { month: 'short', timeZone: 'UTC' })
      .format(new Date(`${d}T00:00:00Z`))
      .slice(0, 3)
  return (
    <section className="rounded-lg bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-[17px]">Weekly volume</h2>
        <span className="font-semibold text-[13px] text-ink-muted">kg lifted per week</span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-2" role="img" aria-label="Volume per week">
        {weeks.map((w, i) => {
          const current = i === weeks.length - 1
          return (
            <div
              key={w.weekStart}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              {w.volumeKg > 0 && (
                <span className="tabular font-bold text-[11px] text-ink-muted">
                  {formatNumber(Math.round(w.volumeKg / 100) / 10)}k
                </span>
              )}
              <motion.div
                className={cn('w-full rounded-t-sm', current ? 'bg-clay' : 'bg-clay/45')}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(w.volumeKg ? 4 : 2, (w.volumeKg / max) * 100)}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
                title={`${formatNumber(w.volumeKg)} kg, ${w.workouts} workouts`}
              />
              <span
                className={cn(
                  'flex flex-col items-center whitespace-nowrap font-bold text-[10px] leading-3',
                  current ? 'text-ink' : 'text-ink-muted',
                )}
              >
                <span className="tabular">{Number(w.weekStart.slice(8))}</span>
                <span>
                  {i === 0 || monthOf(w.weekStart) !== monthOf(weeks[i - 1]?.weekStart ?? '')
                    ? monthOf(w.weekStart)
                    : '\u00a0'}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function WeightLine({ points }: { points: MyStats['bodyWeight'] }) {
  const recent = points.slice(-20)
  const values = recent.map((p) => p.weightKg)
  const min = Math.min(...values) - 0.5
  const max = Math.max(...values) + 0.5
  const w = 300
  const h = 90
  const x = (i: number) => (recent.length === 1 ? w / 2 : (i / (recent.length - 1)) * w)
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const path = recent
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.weightKg).toFixed(1)}`)
    .join(' ')
  const first = recent[0]
  const last = recent.at(-1)
  const change = first && last ? last.weightKg - first.weightKg : 0
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <span className="tabular font-bold font-display text-[24px]">
          {formatWeight(last?.weightKg ?? 0)} kg
        </span>
        <span className="font-semibold text-[13px] text-ink-muted">
          {change === 0
            ? 'No change'
            : `${change > 0 ? '+' : '−'}${formatWeight(Math.abs(change))} kg`}{' '}
          since {first?.date}
        </span>
      </div>
      <svg
        viewBox={`-6 -6 ${w + 12} ${h + 12}`}
        className="mt-3 h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Body weight trend"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--sand)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {recent.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.weightKg)}
            r="3.5"
            fill="var(--sand)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}
