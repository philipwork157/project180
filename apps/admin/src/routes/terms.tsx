import { buttonClasses, LegalPage, TERMS } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/terms')({
  component: () => (
    <LegalPage
      title="Terms of use"
      sections={TERMS}
      back={
        <Link to="/login" className={buttonClasses('ghost', 'sm')}>
          Back
        </Link>
      }
    />
  ),
})
