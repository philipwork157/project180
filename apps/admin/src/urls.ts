/** Where the phone app lives. Set VITE_APP_URL per environment (.env files). */
export const APP_URL = (import.meta.env.VITE_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
