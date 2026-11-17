import { buttonClasses, LegalPage, PRIVACY } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: () => (
    <LegalPage
      title="Privacy policy"
      sections={PRIVACY}
      back={
        <Link to="/login" className={buttonClasses('ghost', 'sm')}>
          Back
        </Link>
      }
    />
  ),
})
