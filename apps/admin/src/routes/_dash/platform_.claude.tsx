import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../../components/page-header'
import {
  ClaudeFeatures,
  Failures,
  SpendSummary,
  TopUsers,
} from '../../components/platform-sections'

/** Platform admin only (the dashboard layout sends anyone else away). */
export const Route = createFileRoute('/_dash/platform_/claude')({
  component: PlatformClaude,
})

function PlatformClaude() {
  return (
    <>
      <PageHeader
        title="Claude"
        subtitle="What Claude costs, and each feature’s switch, model and daily limit."
      />
      <div className="flex flex-col gap-5">
        <SpendSummary />
        <ClaudeFeatures />
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          <TopUsers />
          <Failures />
        </div>
      </div>
    </>
  )
}
