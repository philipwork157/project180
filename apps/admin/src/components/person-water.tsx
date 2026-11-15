import { ApiError, api, personWaterQuery, personWaterSummaryQuery } from '@project180/client'
import {
  addDays,
  formatWater,
  litresToMl,
  MAX_WATER_GOAL_ML,
  MIN_WATER_GOAL_ML,
  todayIn,
  WATER_GOAL_PRESETS_ML,
} from '@project180/shared'
import { Button, ChoiceChips, Drawer, Field, Input, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplet } from 'lucide-react'
import { useState } from 'react'

const DAYS = 7

/**
 * A client's water on their Food card: their daily goal, today so far and the last week, and a
 * way to set the goal. They can change it themselves in the app too.
 */
export function WaterRow({ userId, name }: { userId: number; name: string }) {
  const today = todayIn('Africa/Johannesburg')
  const from = addDays(today, -(DAYS - 1))
  const day = useQuery(personWaterQuery(userId))
  const week = useQuery(personWaterSummaryQuery(userId, from, today))
  const [open, setOpen] = useState(false)
  const goalMl = day.data?.goalMl ?? week.data?.summary.goalMl ?? null
  const days = week.data?.summary.days ?? []
  const onTarget = goalMl === null ? 0 : days.filter((d) => d.ml >= goalMl).length
  const first = name.split(' ')[0]

  if (!day.data && !day.isError) return null
  const summary = day.isError
    ? 'Couldn’t load their water.'
    : [
        goalMl === null ? 'No daily goal yet.' : `Goal ${formatWater(goalMl)} a day.`,
        `${formatWater(day.data?.ml ?? 0)} today.`,
        goalMl === null
          ? `Logged on ${days.length} of the last ${DAYS} days.`
          : `Goal reached on ${onTarget} of the last ${DAYS} days.`,
      ].join(' ')

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-raised p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-steel/20 text-steel-text">
        <Droplet className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-[14px]">Water</span>
        <span className="text-[13px] text-ink-muted">{summary}</span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {goalMl === null ? 'Set goal' : 'Change'}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Daily water goal"
        description={`How much ${first} aims to drink a day. They see it on their Fuel tab and can change it there too.`}
      >
        {open && (
          <WaterGoalForm
            userId={userId}
            name={name}
            goalMl={goalMl}
            onDone={() => setOpen(false)}
          />
        )}
      </Drawer>
    </div>
  )
}

const PRESET_OPTIONS = WATER_GOAL_PRESETS_ML.map((ml) => ({
  value: String(ml),
  label: formatWater(ml),
}))

const litresText = (ml: number | null) => (ml === null ? '' : String(ml / 1000))

function WaterGoalForm({
  userId,
  name,
  goalMl,
  onDone,
}: {
  userId: number
  name: string
  goalMl: number | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(litresText(goalMl ?? 3000))
  const ml = litresToMl(text)
  const invalid = ml === null || ml < MIN_WATER_GOAL_ML || ml > MAX_WATER_GOAL_ML
  const preset =
    ml !== null && PRESET_OPTIONS.some((o) => o.value === String(ml)) ? String(ml) : null
  const save = useMutation({
    mutationFn: (next: number | null) =>
      api<{ goalMl: number | null }>(`/admin/users/${userId}/water/goal`, {
        method: 'PUT',
        body: { goalMl: next },
      }),
    onSuccess: ({ goalMl: saved }) => {
      queryClient.setQueryData(personWaterQuery(userId).queryKey, (day) =>
        day ? { ...day, goalMl: saved } : day,
      )
      void queryClient.invalidateQueries({ queryKey: ['admin', 'water', userId] })
      toast({
        title: saved === null ? 'Water goal removed' : 'Water goal saved',
        description: saved === null ? name : `${name}: ${formatWater(saved)} a day`,
      })
      onDone()
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) save.mutate(ml)
      }}
    >
      <ChoiceChips
        label="Pick a goal"
        options={PRESET_OPTIONS}
        value={preset}
        onChange={(v) => v && setText(litresText(Number(v)))}
        className="no-scrollbar flex-nowrap overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap"
      />
      <Field
        label="Litres a day"
        hint={`Between ${formatWater(MIN_WATER_GOAL_ML)} and ${formatWater(MAX_WATER_GOAL_ML)}.`}
        error={text !== '' && invalid ? 'Enter litres, e.g. 3 or 2.5' : undefined}
      >
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
            className="tabular"
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {goalMl !== null && (
          <Button
            variant="ghost"
            className="mr-auto text-danger hover:bg-danger/10"
            loading={save.isPending && save.variables === null}
            onClick={() => save.mutate(null)}
          >
            Remove goal
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={save.isPending && save.variables !== null}
          disabled={invalid}
        >
          Save goal
        </Button>
      </div>
    </form>
  )
}
