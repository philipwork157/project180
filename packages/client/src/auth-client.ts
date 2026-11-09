import { createAuthClient } from 'better-auth/react'

// Same origin as the app, so no baseURL is needed. Calls /api/auth/*.
export const authClient = createAuthClient()
