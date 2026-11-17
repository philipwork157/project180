import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import { Businesses, Coaches, StarterLibrary } from '../../components/platform-sections'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform_/businesses')({
  component: PlatformBusinesses,
})

function PlatformBusinesses() {
  return (
    <>
      <PageHeader
        title="Businesses"
        subtitle="Every coaching business and its coaches, and the starter library new coaches get a copy of."
      />
      <div className="flex flex-col gap-5">
        <Businesses />
        <Coaches />
        <StarterLibrary />
      </div>
    </>
  )
}
