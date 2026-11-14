import type { Db } from '@project180/db'
import type { Me } from '@project180/shared'
import type { AppKind, Auth } from './auth'

/** Worker bindings: see apps/app/wrangler.jsonc, apps/admin/wrangler.jsonc and .dev.vars. */
export interface Bindings {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  /** Extra origins allowed to sign in, comma-separated (local admin dev server). */
  TRUSTED_ORIGINS?: string
  /** The phone app's address, for links in emails. */
  APP_URL?: string
  /** Amazon SES. Without the key pair, emails are written to the log instead of sent. */
  AWS_REGION?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  /** Sender, e.g. "Project 180 <hello@project180.co.za>" (a verified SES identity). */
  EMAIL_FROM?: string
  /** Dev and test: every email goes here instead of to the real person. */
  EMAIL_REDIRECT_TO?: string
  /** YouTube Data API v3 key, for "how to" video search inside the app. Optional. */
  YOUTUBE_API_KEY?: string
  /** Claude API key, for food photo estimates (phone app only). Without it the photo button hides. */
  ANTHROPIC_API_KEY?: string
  /** Which Claude model reads food photos (default in food-photo.ts). */
  FOOD_MODEL?: string
  /**
   * Barcode providers to try, in order, comma-separated (barcode/index.ts). Default
   * "openfoodfacts"; e.g. "openfoodfacts,usda" to fall back to USDA.
   */
  FOOD_BARCODE_PROVIDERS?: string
  /** USDA FoodData Central key (free from api.data.gov), for the "usda" barcode provider. */
  USDA_API_KEY?: string
  /** Open Food Facts address; their staging server for testing. Default world.openfoodfacts.org. */
  OPEN_FOOD_FACTS_URL?: string
  /** Contact sent to food-data providers with every lookup (they ask apps to identify themselves). */
  FOOD_LOOKUP_CONTACT?: string
  /**
   * Push notifications (Web Push "VAPID" key pair, from `bunx web-push generate-vapid-keys`).
   * Without both, nothing is pushed and the app hides the switch.
   */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  /** Who the push services can contact about our pushes, e.g. "mailto:hello@project180.co.za". */
  VAPID_SUBJECT?: string
  /** Uploaded photos (R2). Without it, uploading answers 503. */
  MEDIA?: R2Bucket
  /** "1" on the admin Worker: its own sign-in cookie, and only owners and coaches may sign in. */
  STAFF_ONLY?: string
  /** Days without use before a sign-in expires (renewed while in use). App 30, admin 7. */
  SESSION_DAYS?: string
  /**
   * Seconds a sign-in is trusted from its signed cookie before the database is asked again
   * (Better Auth's cookie cache). 0 or unset: always ask (local dev and tests).
   */
  SESSION_CACHE_SECONDS?: string
  /** Every API call, per person (Workers rate limiting). Unset locally and in tests. */
  API_LIMIT?: RateLimit
  /** Sending chat messages and coach feedback, per person. */
  SEND_LIMIT?: RateLimit
}

export interface Variables {
  auth: Auth
  /** Which app this call is for: the admin has its own sign-in and lets only staff in. */
  appKind: AppKind
  db: Db
  user: Me
  /** The current Better Auth session's id. */
  sessionId: number
}

export interface AppEnv {
  Bindings: Bindings
  Variables: Variables
}
