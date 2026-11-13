import { api, meQuery, myChatQuery, myChatUnreadQuery } from '@project180/client'
import type { ChatMessage, ChatThread } from '@project180/shared'
import { ChatView, IconButton, useChat } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback } from 'react'
import { useHeartbeat } from '../lib/use-heartbeat'

/** Chat with your coach, full screen: messages, and the box to write in at the bottom. */
export const Route = createFileRoute('/chat')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    return { me }
  },
  component: ChatPage,
})

function ChatPage() {
  const { me } = Route.useRouteContext()
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useHeartbeat()
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
        queryClient.setQueryData(myChatUnreadQuery.queryKey, 0)
        void api('/me/chat/read', { method: 'POST', body: { upTo } }).catch(() => undefined)
      },
      [queryClient],
    ),
  })

  const back = () =>
    router.history.canGoBack() ? router.history.back() : void navigate({ to: '/', replace: true })

  return (
    <motion.main
      initial={{ opacity: 0.4, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-dvh w-full flex-col bg-bg px-4 pt-safe md:px-8 lg:px-12"
    >
      <header className="flex items-center gap-3 border-border border-b pt-4 pb-3">
        <IconButton label="Back" icon={<ArrowLeft aria-hidden />} size="lg" onClick={back} />
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
        composerClassName="pb-safe"
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
    </motion.main>
  )
}
