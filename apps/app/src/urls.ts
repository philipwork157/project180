/** Where the admin dashboard lives. Set VITE_ADMIN_URL per environment (.env files). */
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174').replace(
  /\/$/,
  '',
)
