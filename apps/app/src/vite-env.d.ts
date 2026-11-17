/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key for the sign-up and email forms; unset = no check. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
