import { Hono } from 'hono'
import { emailMode, escapeHtml, sendEmail } from '../email'
import type { AppEnv } from '../env'
import { requirePlatform, requireUser } from '../middleware'

/** Where this site's email goes, and a test email to yourself. Platform admin only. */
export const adminEmailRoutes = new Hono<AppEnv>()
  .use(requireUser, requirePlatform)
  .get('/', (c) => c.json({ email: emailMode(c.env) }))
  .post('/test', async (c) => {
    const me = c.var.user
    const result = await sendEmail(c.env, {
      to: me.email,
      subject: 'Project 180 test email',
      html: `<p style="font:500 15px/23px Helvetica,Arial,sans-serif">Hi ${escapeHtml(me.name.split(' ')[0] ?? '')}, email from Project 180 is working.</p>`,
      text: `Hi ${me.name.split(' ')[0]}, email from Project 180 is working.`,
    })
    return c.json({ email: result })
  })
