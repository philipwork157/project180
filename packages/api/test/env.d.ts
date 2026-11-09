import type { D1Migration } from 'cloudflare:test'
import type { Bindings } from '../src/env'

// `env` from cloudflare:test / cloudflare:workers is typed as Cloudflare.Env.
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
