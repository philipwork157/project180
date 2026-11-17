// SQL that creates (or promotes) an admin with a password, outside the API.
// Used by scripts/create-admin.ts (via wrangler d1 execute) and by the tests,
// so both run exactly the same statements.

export interface AdminRow {
  name: string
  email: string
  /**
   * owner = sees every client; admin = a coach who sees only their own; platform = the
   * developer (Platform page only, sees no clients). Default owner.
   */
  role?: 'owner' | 'admin' | 'platform'
  /** A Better Auth password hash (better-auth/crypto hashPassword), never the password. */
  passwordHash: string
  /**
   * Owners and coaches: the business they belong to, by name. Made if no business has that
   * name yet. Ignored for the platform admin, who belongs to none. Default "Project 180".
   */
  business?: string
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * Creates the user as staff (owner or coach), or makes an existing user staff with this name.
 * Replaces their password (theirs to keep, not a temporary one) and signs them out everywhere.
 * Safe to run again.
 */
export function adminStatements(
  { name, email, passwordHash, role = 'owner', business = 'Project 180' }: AdminRow,
  now = Date.now(),
): string[] {
  const r = role === 'admin' ? `'admin'` : role === 'platform' ? `'platform'` : `'owner'`
  const e = q(email.trim().toLowerCase())
  const user = `(SELECT id FROM users WHERE email = ${e})`
  const b = q(business.trim() || 'Project 180')
  const businessId =
    role === 'platform'
      ? 'NULL'
      : `(SELECT id FROM businesses WHERE name = ${b} ORDER BY id LIMIT 1)`
  return [
    ...(role === 'platform'
      ? []
      : [
          `INSERT INTO businesses (name, created_at, updated_at)
     SELECT ${b}, ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE name = ${b});`,
        ]),
    `INSERT INTO users (name, email, email_verified, role, business_id, timezone, weight_unit, created_at, updated_at)
     VALUES (${q(name.trim())}, ${e}, 1, ${r}, ${businessId}, 'Africa/Johannesburg', 'kg', ${now}, ${now})
     ON CONFLICT (email) DO UPDATE SET role = ${r}, name = excluded.name, business_id = excluded.business_id, coach_id = NULL, must_change_password = 0, updated_at = excluded.updated_at;`,
    `DELETE FROM accounts WHERE provider_id = 'credential' AND user_id = ${user};`,
    `INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
     SELECT id, CAST(id AS TEXT), 'credential', ${q(passwordHash)}, ${now}, ${now} FROM users WHERE email = ${e};`,
    `DELETE FROM sessions WHERE user_id = ${user};`,
  ]
}
