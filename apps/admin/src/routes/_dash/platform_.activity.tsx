import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import { ActivityRecord } from '../../components/platform-records'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform_/activity')({
  component: PlatformActivity,
})

function PlatformActivity() {
  return (
    <>
      <PageHeader
        title="Who did what"
        subtitle="Sign-ups, invitations, account changes and platform settings, newest first."
      />
      <div className="flex flex-col gap-5">
        <ActivityRecord />
      </div>
    </>
  )
}
