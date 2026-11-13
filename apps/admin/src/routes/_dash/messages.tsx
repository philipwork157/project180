import { adminChatsQuery, adminChatUnreadQuery, adminThreadQuery, api } from '@project180/client'
import { type ChatMessage, type ChatSummary, type ChatThread, timeAgo } from '@project180/shared'
import { Card, ChatView, cn, Tooltip, useChat } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ChartLine, MessageCircle } from 'lucide-react'
import { useCallback } from 'react'
import { PageHeader } from '../../components/page-header'

/** Chat with clients: the conversations you can open, and the one that's open (?client=). */
export const Route = createFileRoute('/_dash/messages')({
  validateSearch: (search: Record<string, unknown>): { client?: number } => {
    const id = Number(search.client)
    return Number.isInteger(id) && id > 0 ? { client: id } : {}
  },
  component: MessagesPage,
})

function MessagesPage() {
  const { client } = Route.useSearch()
  const chats = useQuery(adminChatsQuery)
  const list = chats.data ?? []

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Private chats with your clients. Only you and the people who coach them see each one."
      />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className={cn('p-0 md:p-0', client !== undefined && 'hidden lg:block')}>
          {chats.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-surface-raised" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="p-5 text-[14px] text-ink-muted">
              No clients yet. Once you add one, you can chat with them here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {list.map((c) => (
                <ChatRow key={c.clientId} chat={c} active={c.clientId === client} />
              ))}
            </ul>
          )}
        </Card>

        {client ? (
          <Conversation key={client} clientId={client} name={nameOf(list, client)} />
        ) : (
          <Card className="hidden h-[min(70dvh,720px)] place-items-center lg:grid">
            <div className="flex max-w-xs flex-col items-center gap-2 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
                <MessageCircle className="size-6" aria-hidden />
              </span>
              <p className="mt-2 font-bold text-[17px]">Pick a client</p>
              <p className="text-[14px] text-ink-muted">
                Their messages show up here. They get a notification on their phone when you write.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

const nameOf = (list: ChatSummary[], id: number) =>
  list.find((c) => c.clientId === id)?.name ?? null

function ChatRow({ chat: c, active }: { chat: ChatSummary; active: boolean }) {
  return (
    <li>
      <Link
        to="/messages"
        search={{ client: c.clientId }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-16 items-center gap-3 px-4 py-3 transition active:scale-[0.99]',
          active ? 'bg-brand-soft' : 'hover:bg-surface-raised',
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-[15px] text-brand-text">
          {c.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[15px]',
                c.unread ? 'font-extrabold' : 'font-bold',
              )}
            >
              {c.name}
            </span>
            {c.last && (
              <span className="shrink-0 text-[12px] text-ink-muted">
                {timeAgo(c.last.createdAt)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px]',
                c.unread ? 'font-semibold text-ink' : 'text-ink-muted',
              )}
            >
              {c.last ? `${c.last.fromMe ? 'You: ' : ''}${c.last.body}` : 'No messages yet'}
            </span>
            {c.unread > 0 && (
              <span className="tabular grid h-5 min-w-5 shrink-0 place-items-center rounded-pill bg-clay px-1.5 font-extrabold text-[11px] text-on-clay">
                {c.unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}

function Conversation({ clientId, name }: { clientId: number; name: string | null }) {
  const { me } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const query = useQuery(adminThreadQuery(clientId))
  const who = query.data?.client.name ?? name ?? 'Client'
  const first = who.split(' ')[0] ?? who

  const chat = useChat({
    thread: query.data?.thread,
    meId: me.id,
    meName: me.name,
    loadOlder: useCallback(
      async (before: number) =>
        (await api<{ thread: ChatThread }>(`/admin/chat/${clientId}?before=${before}`)).thread,
      [clientId],
    ),
    post: useCallback(
      async (input: { clientUuid: string; body: string }) => {
        const { message } = await api<{ message: ChatMessage }>(`/admin/chat/${clientId}`, {
          method: 'POST',
          body: input,
        })
        // Move this chat to the top of the list with the new preview.
        void queryClient.invalidateQueries({ queryKey: adminChatsQuery.queryKey, exact: true })
        return message
      },
      [clientId, queryClient],
    ),
    markRead: useCallback(
      (upTo: number) => {
        // Badges clear at once; the server catches up in the background.
        let cleared = 0
        queryClient.setQueryData<ChatSummary[]>(adminChatsQuery.queryKey, (list) =>
          list?.map((c) => {
            if (c.clientId !== clientId) return c
            cleared = c.unread
            return { ...c, unread: 0 }
          }),
        )
        queryClient.setQueryData<number>(adminChatUnreadQuery.queryKey, (n) =>
          n === undefined ? n : Math.max(0, n - cleared),
        )
        void api(`/admin/chat/${clientId}/read`, { method: 'POST', body: { upTo } }).catch(
          () => undefined,
        )
      },
      [clientId, queryClient],
    ),
  })

  return (
    <Card className="flex h-[min(78dvh,760px)] min-h-[420px] flex-col p-0 md:p-0">
      <header className="flex items-center gap-3 border-border border-b px-4 py-3 md:px-5">
        <Link
          to="/messages"
          aria-label="All messages"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-sm text-ink-muted transition hover:bg-surface-raised hover:text-ink lg:hidden"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-[15px] text-brand-text">
          {who.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-[17px]">{who}</h2>
          <p className="truncate text-[13px] text-ink-muted">
            Messages reach {first}’s phone as a notification
          </p>
        </div>
        <Tooltip label={`${first}’s progress`}>
          <Link
            to="/users/$userId"
            params={{ userId: String(clientId) }}
            aria-label={`${first}’s progress`}
            className="grid size-11 shrink-0 place-items-center rounded-sm bg-surface-raised text-ink-muted transition hover:text-ink active:scale-95"
          >
            <ChartLine className="size-[18px]" aria-hidden />
          </Link>
        </Tooltip>
      </header>
      {query.isError ? (
        <p className="m-auto p-5 text-[14px] text-ink-muted">This chat couldn’t be loaded.</p>
      ) : (
        <ChatView
          chat={chat}
          meId={me.id}
          showSenderNames
          composerLabel={`Message ${first}`}
          placeholder={`Message ${first}…`}
          className="px-4 md:px-5"
          composerClassName="pb-4"
          empty={
            <div className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
                <MessageCircle className="size-6" aria-hidden />
              </span>
              <p className="mt-2 font-bold text-[17px]">No messages yet</p>
              <p className="text-[14px] text-ink-muted">Start the conversation with {first}.</p>
            </div>
          }
        />
      )}
    </Card>
  )
}
