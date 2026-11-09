// SQL that creates (or promotes) an admin with a password, outside the API.
// Used by scripts/create-admin.ts (via wrangler d1 execute) and by the tests,
// so both run exactly the same statements.

export interface AdminRow {
  name: string
  email: string
  /** owner = sees every client; admin = a coach who sees only their own. Default owner. */
  role?: 'owner' | 'admin'
  /** A Better Auth password hash (better-auth/crypto hashPassword), never the password. */
  passwordHash: string
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * Creates the user as staff (owner or coach), or makes an existing user staff with this name.
 * Replaces their password (theirs to keep, not a temporary one) and signs them out everywhere.
 * Safe to run again.
 */
export function adminStatements(
  { name, email, passwordHash, role = 'owner' }: AdminRow,
  now = Date.now(),
): string[] {
  const r = role === 'admin' ? `'admin'` : `'owner'`
  const e = q(email.trim().toLowerCase())
  const user = `(SELECT id FROM users WHERE email = ${e})`
  return [
    `INSERT INTO users (name, email, email_verified, role, timezone, weight_unit, created_at, updated_at)
     VALUES (${q(name.trim())}, ${e}, 1, ${r}, 'Africa/Johannesburg', 'kg', ${now}, ${now})
     ON CONFLICT (email) DO UPDATE SET role = ${r}, name = excluded.name, coach_id = NULL, must_change_password = 0, updated_at = excluded.updated_at;`,
    `DELETE FROM accounts WHERE provider_id = 'credential' AND user_id = ${user};`,
    `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
     SELECT id, CAST(id AS TEXT), 'credential', ${q(passwordHash)}, ${now}, ${now} FROM users WHERE email = ${e};`,
    `DELETE FROM sessions WHERE user_id = ${user};`,
  ]
}
