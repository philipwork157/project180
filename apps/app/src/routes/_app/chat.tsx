import { api, myChatQuery, myChatUnreadQuery } from '@project180/client'
import type { ChatMessage, ChatThread } from '@project180/shared'
import { ChatView, useChat } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'
import { useCallback } from 'react'
import { closeChatNotifications } from '../../lib/push'

/**
 * Chat with your coach: a tab like the others (the tab bar stays; it tucks away while you type).
 * Messages fill the screen above the box to write in.
 */
export const Route = createFileRoute('/_app/chat')({
  component: ChatPage,
})

function ChatPage() {
  const { me } = Route.useRouteContext()
  const queryClient = useQueryClient()
  // New messages show up within a few seconds while you're here.
  const query = useQuery({ ...myChatQuery, refetchInterval: 4_000 })
  const coach = query.data?.coach?.name ?? null
  const coachFirst = coach?.split(' ')[0] ?? 'your coach'

  const chat = useChat({
    thread: query.data?.thread,
    meId: me.id,
    meName: me.name,
    loadOlder: useCallback(
      async (before: number) =>
        (await api<{ thread: ChatThread }>(`/me/chat?before=${before}`)).thread,
      [],
    ),
    post: useCallback(
      async (input: { clientUuid: string; body: string }) =>
        (await api<{ message: ChatMessage }>('/me/chat', { method: 'POST', body: input })).message,
      [],
    ),
    markRead: useCallback(
      (upTo: number) => {
        // The badge clears at once; the server catches up in the background.
        queryClient.setQueryData(myChatUnreadQuery.queryKey, { unread: 0, latest: null })
        // Read here, so the phone's own notification for the chat goes too.
        void closeChatNotifications()
        void api('/me/chat/read', { method: 'POST', body: { upTo } }).catch(() => undefined)
      },
      [queryClient],
    ),
  })

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <header className="flex items-center gap-3 border-border border-b pt-4 pb-3">
        <div className="min-w-0">
          <h1 className="truncate font-display font-extrabold text-[24px] leading-7 tracking-tight">
            {coach ?? 'Your coach'}
          </h1>
          <p className="text-[13px] text-ink-muted">Only you and your coach see this chat</p>
        </div>
      </header>

      <ChatView
        chat={chat}
        meId={me.id}
        composerLabel={`Message ${coachFirst}`}
        placeholder={`Message ${coachFirst}…`}
        composerClassName="pb-3"
        empty={
          <div className="flex flex-col items-center gap-2">
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
              <MessageCircle className="size-6" aria-hidden />
            </span>
            <p className="mt-2 font-bold text-[17px]">Say hi to {coachFirst}</p>
            <p className="text-[14px] text-ink-muted">
              Ask about a workout, tell them how you’re feeling, or share a win.
            </p>
          </div>
        }
      />
    </div>
  )
}
