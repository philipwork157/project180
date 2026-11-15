import { test as teardown } from '@playwright/test'
import { sweepE2eData } from '@project180/api/e2e'
import { BASE_URL } from './support'

// Removes the clients, workouts, programs and exercises the run made.
teardown('remove what the tests made', async () => {
  await sweepE2eData(BASE_URL)
})
