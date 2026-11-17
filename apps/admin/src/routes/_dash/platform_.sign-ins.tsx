import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import { SignInsCard } from '../../components/platform-records'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform_/sign-ins')({
  component: PlatformSignIns,
})

function PlatformSignIns() {
  return (
    <>
      <PageHeader
        title="Sign-ins"
        subtitle="Who is trying to sign in to the phone app and the admin, and what happened."
      />
      <div className="flex flex-col gap-5">
        <SignInsCard />
      </div>
    </>
  )
}
