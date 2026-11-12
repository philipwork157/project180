// Claude Code hook: after Claude edits or writes a file, let Biome format it and sort its
// imports straight away, so `bun run check` never fails on style. Lint problems are left
// for `bun run check` to report.
const input = JSON.parse(await Bun.stdin.text()) as { tool_input?: { file_path?: string } }
const file = input.tool_input?.file_path
if (file && /\.(ts|tsx|js|json|jsonc)$/.test(file) && !file.includes('/drizzle/')) {
  Bun.spawnSync(['bunx', 'biome', 'check', '--write', '--no-errors-on-unmatched', file], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
}
