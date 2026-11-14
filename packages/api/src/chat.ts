// Chat between a client and the staff who look after them. One conversation per client.
// Who may open which conversation is decided by the routes (the client: only their own;
// staff: only clients they manage). Everything here is scoped by that client id.
import { type Db, messageReads, messages, users } from '@project180/db'
import type {
  ChatMessage,
  ChatSummary,
  ChatThread,
  ChatUnread,
  Me,
  MessageInput,
} from '@project180/shared'
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, max, ne, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { myClients } from './access'
import { inChunks } from './batch'
import type { AppEnv } from './env'
import { conflict } from './errors'
import { pushLater } from './push'
import { assertCanSend } from './rate-limit'

const PAGE = 50

const columns = {
  id: messages.id,
  clientUuid: messages.clientUuid,
  senderId: messages.senderId,
  senderName: users.name,
  body: messages.body,
  createdAt: messages.createdAt,
}

const toJson = (r: { createdAt: Date } & Omit<ChatMessage, 'createdAt'>): ChatMessage => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
})

/** Not sent by this person (messages from a removed account count as from someone else). */
const fromOthers = (userId: number) => or(isNull(messages.senderId), ne(messages.senderId, userId))

/**
 * A page of the conversation for `viewerId`, oldest first: the newest messages, or the ones
 * before `before`. Also how far each side has read.
 */
export async function loadThread(
  db: Db,
  clientId: number,
  viewerId: number,
  before?: number,
): Promise<ChatThread> {
  const inThread = eq(messages.clientId, clientId)
  const [rows, reads] = await Promise.all([
    db
      .select(columns)
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(before ? and(inThread, lt(messages.id, before)) : inThread)
      .orderBy(desc(messages.id))
      .limit(PAGE + 1),
    db
      .select({ userId: messageReads.userId, lastReadId: messageReads.lastReadId })
      .from(messageReads)
      .where(eq(messageReads.clientId, clientId)),
  ])
  const mine = reads.find((r) => r.userId === viewerId)?.lastReadId ?? 0
  // The client sees "Seen" once any of their staff has read it; staff see the client's.
  const others = reads.filter((r) =>
    viewerId === clientId ? r.userId !== clientId : r.userId === clientId,
  )
  return {
    messages: rows.slice(0, PAGE).reverse().map(toJson),
    hasMore: rows.length > PAGE,
    seenUpTo: Math.max(0, ...others.map((r) => r.lastReadId)),
    readUpTo: mine,
  }
}

/**
 * `me` posts in the client's conversation. Sending again with the same clientUuid answers with
 * the message already saved. Staff messages reach the client's phone as a push.
 */
export async function postMessage(
  c: Context<AppEnv>,
  clientId: number,
  input: MessageInput,
): Promise<ChatMessage> {
  const { db, user: me } = c.var
  await assertCanSend(c.env.SEND_LIMIT, me.id)
  const [created] = await db
    .insert(messages)
    .values({ clientUuid: input.clientUuid, clientId, senderId: me.id, body: input.body.trim() })
    .onConflictDoNothing({ target: messages.clientUuid })
    .returning({ id: messages.id })
  const id = created?.id
  const [row] = await db
    .select({ ...columns, clientId: messages.clientId })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(id ? eq(messages.id, id) : eq(messages.clientUuid, input.clientUuid))
  // A uuid already used for someone else's message: never reveal or reuse it.
  if (!row || row.clientId !== clientId || row.senderId !== me.id) conflict('Message id in use')
  const { clientId: _owner, ...message } = row
  if (created) {
    // You've read everything up to your own message.
    await markRead(db, clientId, me.id, row.id)
    if (me.id !== clientId) {
      await pushLater(c, [clientId], {
        title: me.name.split(' ')[0] || 'Your coach',
        body: message.body.slice(0, 140),
        url: '/chat',
        // One notification for the chat: a newer message replaces it.
        tag: 'chat',
        // The number on the app icon, where the phone shows one.
        badge: () => unreadForClient(db, clientId),
      })
    }
  }
  return toJson(message)
}

/** `userId` has read the conversation up to `upTo` (never past its newest message, never back). */
export async function markRead(db: Db, clientId: number, userId: number, upTo: number) {
  const [newest] = await db
    .select({ id: max(messages.id) })
    .from(messages)
    .where(eq(messages.clientId, clientId))
  const lastReadId = Math.min(upTo, newest?.id ?? 0)
  if (lastReadId <= 0) return 0
  await db
    .insert(messageReads)
    .values({ clientId, userId, lastReadId })
    .onConflictDoUpdate({
      target: [messageReads.clientId, messageReads.userId],
      set: {
        lastReadId: sql`max(${messageReads.lastReadId}, excluded.last_read_id)`,
        updatedAt: new Date(),
      },
    })
  return lastReadId
}

/** Messages in the client's own conversation they haven't read yet. */
export async function unreadForClient(db: Db, clientId: number): Promise<number> {
  return (await chatNewsForClient(db, clientId)).unread
}

/**
 * How many messages the client hasn't read, and the newest of them (for the bell and the
 * in-app banner). Two small reads after the read position, both on the (client_id, id) index.
 */
export async function chatNewsForClient(db: Db, clientId: number): Promise<ChatUnread> {
  const [read] = await db
    .select({ id: messageReads.lastReadId })
    .from(messageReads)
    .where(and(eq(messageReads.clientId, clientId), eq(messageReads.userId, clientId)))
  const unreadOnly = and(
    eq(messages.clientId, clientId),
    gt(messages.id, read?.id ?? 0),
    fromOthers(clientId),
  )
  const [[row], [latest]] = await Promise.all([
    db.select({ n: count() }).from(messages).where(unreadOnly),
    db
      .select(columns)
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(unreadOnly)
      .orderBy(desc(messages.id))
      .limit(1),
  ])
  return { unread: row?.n ?? 0, latest: latest ? toJson(latest) : null }
}

/** Unread client messages across everyone `me` manages, in one query (the sidebar badge). */
export async function unreadForStaff(db: Db, me: Me): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.clientId))
    .leftJoin(
      messageReads,
      and(eq(messageReads.clientId, messages.clientId), eq(messageReads.userId, me.id)),
    )
    .where(
      and(
        myClients(me),
        gt(messages.id, sql`coalesce(${messageReads.lastReadId}, 0)`),
        fromOthers(me.id),
      ),
    )
  return row?.n ?? 0
}

/**
 * The coach's inbox: every client they manage, with unread messages and the latest one.
 * Conversations with news first, then the most recent, then by name.
 */
export async function inbox(db: Db, me: Me): Promise<ChatSummary[]> {
  const clients = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(myClients(me))
    .orderBy(asc(users.name))
  const ids = clients.map((u) => u.id)
  const [unread, lastIds] = await Promise.all([
    inChunks(ids, (slice) =>
      db
        .select({ clientId: messages.clientId, n: count() })
        .from(messages)
        .leftJoin(
          messageReads,
          and(eq(messageReads.clientId, messages.clientId), eq(messageReads.userId, me.id)),
        )
        .where(
          and(
            inArray(messages.clientId, slice),
            gt(messages.id, sql`coalesce(${messageReads.lastReadId}, 0)`),
            fromOthers(me.id),
          ),
        )
        .groupBy(messages.clientId),
    ),
    inChunks(ids, (slice) =>
      db
        .select({ id: max(messages.id) })
        .from(messages)
        .where(inArray(messages.clientId, slice))
        .groupBy(messages.clientId),
    ),
  ])
  const lastRows = await inChunks(
    lastIds.map((r) => r.id ?? 0).filter((id) => id > 0),
    (slice) =>
      db
        .select({
          clientId: messages.clientId,
          senderId: messages.senderId,
          body: messages.body,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.id, slice)),
  )
  const unreadOf = new Map(unread.map((r) => [r.clientId, r.n]))
  const lastOf = new Map(lastRows.map((r) => [r.clientId, r]))
  return clients
    .map((u): ChatSummary => {
      const last = lastOf.get(u.id)
      return {
        clientId: u.id,
        name: u.name,
        unread: unreadOf.get(u.id) ?? 0,
        last: last
          ? {
              body: last.body.slice(0, 140),
              createdAt: last.createdAt.toISOString(),
              fromClient: last.senderId === u.id,
              fromMe: last.senderId === me.id,
            }
          : null,
      }
    })
    .sort(
      (a, b) =>
        Number(b.unread > 0) - Number(a.unread > 0) ||
        (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? ''),
    )
}
