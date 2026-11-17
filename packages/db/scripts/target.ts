// Which business a seed script fills: `--business "Name"` (exact name), or else the first
// owner's business. Every business has its own library, so the starter library is filled with
// `bun run db:seed -- --business "Starter library"` (and db:recipes the same way).
const q = (v: string) => `'${v.replaceAll("'", "''")}'`

export function seedTarget(argv: string[]) {
  const i = argv.indexOf('--business')
  const name = i >= 0 ? argv[i + 1]?.trim() : undefined
  if (i >= 0 && !name) throw new Error('--business needs a name, e.g. --business "Starter library"')
  if (name) {
    const business = `(SELECT id FROM businesses WHERE name = ${q(name)} ORDER BY id LIMIT 1)`
    const staff = `role IN ('owner', 'admin') AND business_id = ${business}`
    return {
      label: `the business "${name}"`,
      business,
      // Rows are owned by that business's first owner (or coach).
      admin: `(SELECT id FROM users WHERE ${staff} ORDER BY role = 'owner' DESC, id LIMIT 1)`,
      hasAdmin: `EXISTS (SELECT 1 FROM users WHERE ${staff})`,
      inBusiness: `business_id = ${business}`,
      /** Library workouts made by staff of that business. */
      workoutsOfBusiness: `client_id IS NULL AND created_by IN (SELECT id FROM users WHERE ${staff})`,
    }
  }
  const admin = `(SELECT id FROM users WHERE role IN ('owner', 'admin') ORDER BY role = 'owner' DESC, id LIMIT 1)`
  const business = `(SELECT business_id FROM users WHERE id = ${admin})`
  return {
    label: "the first owner's business",
    business,
    admin,
    hasAdmin: `EXISTS (SELECT 1 FROM users WHERE role IN ('owner', 'admin'))`,
    inBusiness: `business_id = ${business}`,
    workoutsOfBusiness: `client_id IS NULL AND created_by IN (SELECT id FROM users WHERE role IN ('owner', 'admin') AND business_id = ${business})`,
  }
}
