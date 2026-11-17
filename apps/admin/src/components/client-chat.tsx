// The chat with one client, on their client page (Chat tab). Clients only ever reach their own
// conversation; staff reach it through the client (managedPerson on the API).
import { adminChatsQuery, adminChatUnreadQuery, adminThreadQuery, api } from '@project180/client'
import type { ChatMessage, ChatSummary, ChatThread, Me } from '@project180/shared'
import { Card, ChatView, useChat } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useCallback } from 'react'

export function ClientChat({ clientId, name, me }: { clientId: number; name: string; me: Me }) {
  const queryClient = useQueryClient()
  const query = useQuery(adminThreadQuery(clientId))
  const first = name.split(' ')[0] ?? name

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
    <Card className="flex h-[min(72dvh,760px)] min-h-[420px] flex-col p-0 md:p-0">
      <header className="flex items-center gap-3 border-border border-b px-4 py-3 md:px-5">
        <MessageCircle className="size-5 shrink-0 text-brand-text" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
          Private to {first} and their coach. Your messages reach {first}’s phone as a notification.
        </p>
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
