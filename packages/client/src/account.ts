// Your own account, before signing in: sign up, confirm your email, reset your password.
import { api } from './api'

export const signUp = (input: {
  name: string
  email: string
  password: string
  businessName?: string
  turnstileToken?: string
  acceptTerms: true
}) => api<{ email: string; link?: string }>('/account/signup', { method: 'POST', body: input })

export const verifyEmail = (token: string) =>
  api<{ email: string | null }>('/account/verify', { method: 'POST', body: { token } })

export const resendVerifyEmail = (email: string, turnstileToken?: string) =>
  api<{ ok: true; link?: string }>('/account/resend', {
    method: 'POST',
    body: { email, turnstileToken },
  })

export const forgotPassword = (email: string, turnstileToken?: string) =>
  api<{ ok: true; link?: string }>('/account/forgot', {
    method: 'POST',
    body: { email, turnstileToken },
  })

export const resetPassword = (token: string, password: string) =>
  api<{ ok: true }>('/account/reset', { method: 'POST', body: { token, password } })
