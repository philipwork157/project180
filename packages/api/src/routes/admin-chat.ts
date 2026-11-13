import { isClient, messageInput, messageReadInput } from '@project180/shared'
import { Hono } from 'hono'
import { managedPerson } from '../access'
import { inbox, loadThread, markRead, postMessage, unreadForStaff } from '../chat'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { requireAdmin, requireUser } from '../middleware'

/** A client you manage, by id; anyone else (or anyone who isn't a client) is 404. */
async function managedClient(c: { var: AppEnv['Variables'] }, id: string) {
  const person = await managedPerson(c.var.db, c.var.user, parseId(id))
  if (!isClient(person.role)) notFound('User not found')
  return person
}

const before = (value: string | undefined) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * Staff side of chat. A coach reaches only the clients they coach; an owner reaches every
 * client. Each person keeps their own read position.
 */
export const adminChatRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** Every conversation you can open, with unread counts and the latest message. */
  .get('/', async (c) => c.json({ chats: await inbox(c.var.db, c.var.user) }))
  /** Unread messages across all your clients (the sidebar badge). */
  .get('/unread', async (c) => c.json({ unread: await unreadForStaff(c.var.db, c.var.user) }))
  .get('/:clientId', async (c) => {
    const client = await managedClient(c, c.req.param('clientId'))
    const thread = await loadThread(
      c.var.db,
      client.id,
      c.var.user.id,
      before(c.req.query('before')),
    )
    return c.json({ thread, client: { id: client.id, name: client.name } })
  })
  .post('/:clientId', async (c) => {
    const client = await managedClient(c, c.req.param('clientId'))
    const input = await parseBody(c.req.raw, messageInput)
    return c.json({ message: await postMessage(c, client.id, input) }, 201)
  })
  .post('/:clientId/read', async (c) => {
    const client = await managedClient(c, c.req.param('clientId'))
    const { upTo } = await parseBody(c.req.raw, messageReadInput)
    return c.json({ readUpTo: await markRead(c.var.db, client.id, c.var.user.id, upTo) })
  })
