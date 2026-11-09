import { createApp } from '@project180/api'

// One Worker: /api/* goes to Hono (see run_worker_first in wrangler.jsonc);
// everything else is the built React app, served as static assets.
export default createApp()
