import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const OTHER_COACH = { name: 'Coach Max', email: 'max@example.com', password: 'coach-password-2' }
const SAM = { name: 'Client Sam', email: 'sam@example.com', password: 'client-password-1' }
const LEE = { name: 'Client Lee', email: 'lee@example.com', password: 'client-password-2' }

/** Owner; coach Kim with clients Sam and Lee; coach Max with none; the owner's client (MEMBER). */
async function team() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  await call('/admin/users', {
    method: 'POST',
    cookie: owner,
    body: { ...OTHER_COACH, role: 'admin' },
  })
  const kim = await signIn(COACH.email, COACH.password)
  const max = await signIn(OTHER_COACH.email, OTHER_COACH.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
  await call('/admin/users', { method: 'POST', cookie: kim, body: SAM })
  await call('/admin/users', { method: 'POST', cookie: kim, body: LEE })
  const people = (await call<Json>('/admin/users', { cookie: owner })).data.users as Json[]
  const idOf = (email: string) => people.find((u) => u.email === email)?.id as number
  const sam = await signIn(SAM.email, SAM.password)
  const lee = await signIn(LEE.email, LEE.password)
  return { owner, kim, max, sam, lee, idOf }
}

const send = (path: string, cookie: string, body: string, clientUuid = crypto.randomUUID()) =>
  call<Json>(path, { method: 'POST', cookie, body: { clientUuid, body } })

describe('chat', () => {
  it('a client and their coach talk; unread counts and read positions follow', async () => {
    const { kim, sam, idOf } = await team()
    const samId = idOf(SAM.email)

    const first = await send('/me/chat', sam, 'Hi coach, my knee hurts on lunges')
    expect(first.status).toBe(201)
    expect(first.data.message).toMatchObject({ senderName: SAM.name })

    // Kim sees it unread in the inbox and the badge.
    expect((await call<Json>('/admin/chat/unread', { cookie: kim })).data.unread).toBe(1)
    const inbox = (await call<Json>('/admin/chat', { cookie: kim })).data.chats as Json[]
    expect(inbox[0]).toMatchObject({ clientId: samId, unread: 1, last: { fromClient: true } })

    const reply = await send(`/admin/chat/${samId}`, kim, 'Swap them for step-ups this week')
    expect(reply.status).toBe(201)
    // Replying means Kim has read the conversation.
    expect((await call<Json>('/admin/chat/unread', { cookie: kim })).data.unread).toBe(0)

    // Sam has one unread; the thread shows both, and that Kim has seen Sam's message.
    expect((await call<Json>('/me/chat/unread', { cookie: sam })).data.unread).toBe(1)
    const thread = (await call<Json>('/me/chat', { cookie: sam })).data
    expect(thread.coach).toEqual({ name: COACH.name })
    expect(thread.thread.messages.map((m: Json) => m.body)).toEqual([
      'Hi coach, my knee hurts on lunges',
      'Swap them for step-ups this week',
    ])
    expect(thread.thread.seenUpTo).toBeGreaterThanOrEqual(first.data.message.id)

    await call('/me/chat/read', {
      method: 'POST',
      cookie: sam,
      body: { upTo: reply.data.message.id },
    })
    expect((await call<Json>('/me/chat/unread', { cookie: sam })).data.unread).toBe(0)
    const kimView = (await call<Json>(`/admin/chat/${samId}`, { cookie: kim })).data.thread
    expect(kimView.seenUpTo).toBe(reply.data.message.id)
  })

  it('sending again with the same id posts once', async () => {
    const { sam } = await team()
    const uuid = crypto.randomUUID()
    const a = await send('/me/chat', sam, 'Hello', uuid)
    const b = await send('/me/chat', sam, 'Hello', uuid)
    expect(b.data.message.id).toBe(a.data.message.id)
    expect((await call<Json>('/me/chat', { cookie: sam })).data.thread.messages).toHaveLength(1)
  })

  it('nobody reads or writes a conversation that isn’t theirs', async () => {
    const { owner, kim, max, sam, lee, idOf } = await team()
    const samId = idOf(SAM.email)
    const wifeId = idOf(MEMBER.email)
    const secret = await send('/me/chat', sam, 'Private to Sam and Kim')

    // Lee, another of Kim's clients, only ever gets their own (empty) conversation.
    const leeThread = (await call<Json>('/me/chat', { cookie: lee })).data.thread
    expect(leeThread.messages).toEqual([])
    expect((await call(`/admin/chat/${samId}`, { cookie: lee })).status).toBe(403)
    expect((await send(`/admin/chat/${samId}`, lee, 'hi')).status).toBe(403)
    // Reading "up to" someone else's message changes nothing for anyone.
    await call('/me/chat/read', {
      method: 'POST',
      cookie: lee,
      body: { upTo: secret.data.message.id },
    })
    const samView = (await call<Json>(`/admin/chat/${samId}`, { cookie: kim })).data.thread
    // Still only Sam's own read position (up to the message Sam sent).
    expect(samView.seenUpTo).toBe(secret.data.message.id)

    // Reusing Sam's message id doesn't reveal it or post into Sam's chat.
    const reuse = await send('/me/chat', lee, 'gotcha', secret.data.message.clientUuid)
    expect(reuse.status).toBe(409)

    // Max coaches neither Sam nor the owner's client: 404, and they're not in his inbox.
    expect((await call(`/admin/chat/${samId}`, { cookie: max })).status).toBe(404)
    expect((await send(`/admin/chat/${samId}`, max, 'hi')).status).toBe(404)
    expect((await call<Json>('/admin/chat', { cookie: max })).data.chats).toEqual([])
    expect((await call(`/admin/chat/${wifeId}`, { cookie: kim })).status).toBe(404)

    // Staff aren't chat clients: no conversation with a coach's own id.
    const kimId = idOf(COACH.email)
    expect((await call(`/admin/chat/${kimId}`, { cookie: owner })).status).toBe(404)
    expect((await call('/me/chat', { cookie: kim })).status).toBe(404)

    // The owner sees every client, Sam included.
    const ownerView = await call<Json>(`/admin/chat/${samId}`, { cookie: owner })
    expect(ownerView.data.thread.messages[0].body).toBe('Private to Sam and Kim')
  })

  it('pages back through older messages', async () => {
    const { sam } = await team()
    for (let i = 1; i <= 55; i++) await send('/me/chat', sam, `Message ${i}`)
    const newest = (await call<Json>('/me/chat', { cookie: sam })).data.thread
    expect(newest.messages).toHaveLength(50)
    expect(newest.hasMore).toBe(true)
    expect(newest.messages[0].body).toBe('Message 6')
    const older = (await call<Json>(`/me/chat?before=${newest.messages[0].id}`, { cookie: sam }))
      .data.thread
    expect(older.messages.map((m: Json) => m.body)).toEqual([
      'Message 1',
      'Message 2',
      'Message 3',
      'Message 4',
      'Message 5',
    ])
    expect(older.hasMore).toBe(false)
  })
})
