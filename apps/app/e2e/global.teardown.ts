import { rmSync } from 'node:fs'
import { test as teardown } from '@playwright/test'
import { sweepE2eData } from '@project180/api/e2e'
import { BASE_URL, RUN_FILE } from './support'

// Removes what the run made (the client with their copies, sessions and weigh-ins, the library
// workout and program, any exercises it had to add), so a local database doesn't fill up.
teardown('remove the test client and their program', async () => {
  await sweepE2eData(BASE_URL)
  rmSync(RUN_FILE, { force: true })
})
