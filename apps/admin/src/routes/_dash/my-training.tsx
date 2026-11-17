import { isStaff } from '@project180/shared'
import { Button, cn, Drawer } from '@project180/ui'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { PageHeader } from '../../components/page-header'
import { NutritionCard } from '../../components/person-nutrition'
import { PersonProgressPanel } from '../../components/person-progress'
import { PersonStats } from '../../components/person-stats'

const TABS = ['program', 'progress', 'food'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = { program: 'Program', progress: 'Progress', food: 'Food' }

/**
 * Your own training (staff do workouts they assign themselves in the phone app): your program,
 * progress and food, kept apart from the clients you coach.
 */
export const Route = createFileRoute('/_dash/my-training')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {},
  beforeLoad: ({ context }) => {
    if (!isStaff(context.me.role)) throw redirect({ to: '/' })
  },
  component: MyTrainingPage,
})

function MyTrainingPage() {
  const { me } = Route.useRouteContext()
  const { tab = 'program' } = Route.useSearch()
  const [assigning, setAssigning] = useState(false)
  return (
    <>
      <PageHeader
        title="My training"
        subtitle="Your own program, progress and food, as you see them in the phone app."
        action={
          <Button
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => setAssigning(true)}
          >
            Assign myself a program
          </Button>
        }
      />
      <nav
        aria-label="My training"
        className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto border-border border-b px-4 md:mx-0 md:px-0"
      >
        {TABS.map((t) => (
          <Link
            key={t}
            to="/my-training"
            search={t === 'program' ? {} : { tab: t }}
            aria-current={tab === t ? 'page' : undefined}
            className={cn(
              '-mb-px flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-bold text-[14px] transition',
              tab === t
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>
      {tab === 'program' && (
        <PersonProgressPanel userId={me.id} name={me.name} onAssign={() => setAssigning(true)} />
      )}
      {tab === 'progress' && <PersonStats userId={me.id} name={me.name} />}
      {tab === 'food' && <NutritionCard userId={me.id} name={me.name} />}
      <Drawer
        open={assigning}
        onClose={() => setAssigning(false)}
        title="Assign a program"
        description="For you"
      >
        {assigning && <AssignForm key={me.id} userId={me.id} />}
      </Drawer>
    </>
  )
}
