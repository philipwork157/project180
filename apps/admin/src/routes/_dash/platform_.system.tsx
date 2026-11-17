import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import { DatabaseCard, ErrorsCard } from '../../components/platform-records'
import { Health } from '../../components/platform-sections'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform_/system')({
  component: PlatformSystem,
})

function PlatformSystem() {
  return (
    <>
      <PageHeader
        title="System"
        subtitle="Errors, the database and how this site is set up: keys and email."
      />
      <div className="flex flex-col gap-5">
        <ErrorsCard />
        <DatabaseCard />
        <Health />
      </div>
    </>
  )
}
