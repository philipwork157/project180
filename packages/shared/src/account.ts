// Creating your own account, confirming your email, and resetting a forgotten password.
import { z } from 'zod'

const name = z.string().trim().min(1, 'Enter your name').max(80)
const password = z.string().min(8, 'At least 8 characters').max(128)
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))
/** A one-time link's token: 43 URL-safe characters (32 random bytes). */
const token = z.string().regex(/^[\w-]{43}$/, 'This link isn’t valid')
/** Cloudflare Turnstile's answer from the page (checked on the server when keys are set). */
const turnstileToken = z.string().max(2048).optional()

/** Someone creates their own account (phone app), or a coach starts a business (admin). */
export const signUpInput = z.object({
  name,
  email,
  password,
  /** Ticked "I agree to the terms and privacy policy". Required. */
  acceptTerms: z.literal(true, { error: 'Agree to the terms and privacy policy to continue' }),
  /** Coach sign-up only: the name of their coaching business. */
  businessName: z.string().trim().min(2, 'Name your business').max(80).optional(),
  turnstileToken,
})
export type SignUpInput = z.input<typeof signUpInput>

export const emailOnlyInput = z.object({ email, turnstileToken })
export const verifyEmailInput = z.object({ token })
export const resetPasswordWithTokenInput = z.object({ token, password })

/** How long a link works. */
export const VERIFY_LINK_HOURS = 48
export const RESET_LINK_MINUTES = 60

/** A ready-made program anyone without a coach can start (from the starter library). */
export interface StarterProgram {
  id: number
  name: string
  description: string | null
  durationWeeks: number
  /** Training days a week (week 1). */
  daysPerWeek: number
}

export const startStarterProgramInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** The platform admin's starter library: which business it is, and what's in it. */
export interface StarterLibrary {
  businessId: number | null
  businesses: Array<{
    id: number
    name: string
    exercises: number
    recipes: number
    programs: number
  }>
}

export const starterLibraryInput = z.object({ businessId: z.number().int().positive().nullable() })

/** Deleting your own account (app): your password, to be sure it's you. */
export const deleteMyAccountInput = z.object({ password: z.string().min(1, 'Enter your password') })

/** The version of the terms and privacy policy people agree to at sign-up. */
export const TERMS_UPDATED = '2026-11-17'
