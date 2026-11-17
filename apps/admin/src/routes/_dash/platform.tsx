import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import { ErrorsCard } from '../../components/platform-records'
import { PeopleSummary, Signups, SpendSummary } from '../../components/platform-sections'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform')({
  component: PlatformOverview,
})

function PlatformOverview() {
  return (
    <>
      <PageHeader
        title="Platform"
        subtitle="What needs your attention: people, errors, spend and sign-ups at a glance."
      />
      <div className="flex flex-col gap-5">
        <PeopleSummary />
        <ErrorsCard compact />
        <SpendSummary />
        <Signups />
      </div>
    </>
  )
}
