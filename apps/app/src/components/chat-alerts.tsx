import { meQuery, myChatQuery, myChatUnreadQuery } from '@project180/client'
import { type ChatMessage, isClient } from '@project180/shared'
import { IconButton } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { closeChatNotifications, setIconBadge } from '../lib/push'

/** How long the banner stays before it slides away by itself. */
const SHOW_MS = 6_000

/**
 * New messages from your coach while the app is open: a banner slides down from the top (tap to
 * open the chat, swipe up or ✕ to dismiss) on every screen except the chat itself. Also keeps
 * the number on the app icon in step, and refreshes at once when a push arrives.
 */
export function ChatAlerts() {
  const me = useQuery(meQuery).data
  const client = !!me && !me.mustChangePassword && isClient(me.role)
  useEffect(() => {
    // Signed out, or not a client: no number on the icon.
    if (!client) setIconBadge(0)
  }, [client])
  // A fresh start for each person (shared phones): someone else's messages never show.
  return client ? <ChatBanner key={me.id} /> : null
}

function ChatBanner() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const inChat = useLocation({ select: (l) => l.pathname === '/chat' })
  const news = useQuery(myChatUnreadQuery).data
  const [shown, setShown] = useState<ChatMessage | null>(null)
  // The newest message already known about; null until the first answer (no banner for old ones).
  const knownId = useRef<number | null>(null)

  // A push came in while the app is open: ask now instead of waiting for the next check.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'push' || event.data.tag !== 'chat') return
      void queryClient.invalidateQueries({ queryKey: myChatQuery.queryKey })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [queryClient])

  useEffect(() => {
    if (!news) return
    const latest = news.latest
    const id = latest?.id ?? 0
    const known = knownId.current
    knownId.current = Math.max(known ?? 0, id)
    if (known === null || !latest || id <= known) return
    if (inChat || document.visibilityState !== 'visible') return
    setShown(latest)
    // It's on screen here, so the copy in the phone's notification list can go.
    void closeChatNotifications()
  }, [news, inChat])

  const unread = news?.unread
  useEffect(() => {
    if (unread !== undefined) setIconBadge(unread)
  }, [unread])

  // Opening the chat (from anywhere) puts the banner away.
  useEffect(() => {
    if (inChat) setShown(null)
  }, [inChat])

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [shown])

  const name = shown?.senderName ?? 'Your coach'
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="status"
          aria-live="polite"
          initial={{ y: -140, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -140, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.7, bottom: 0.08 }}
          onDragEnd={(_, info) => {
            if (info.offset.y < -36 || info.velocity.y < -300) setShown(null)
          }}
          className="fixed inset-x-0 top-0 z-50 touch-none px-4 pt-safe md:left-auto md:w-[480px] md:px-8 lg:px-12"
        >
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface p-3 pr-2 shadow-float">
            <button
              type="button"
              onClick={() => {
                setShown(null)
                void navigate({ to: '/chat' })
              }}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left transition active:scale-[0.98]"
            >
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[17px] text-brand-text"
              >
                {name.trim().charAt(0).toUpperCase() || 'C'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold text-[15px]">{name}</span>
                  <span className="shrink-0 text-[12px] text-ink-muted">now</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block break-words text-[14px] text-ink-muted">
                  {shown.body}
                </span>
              </span>
            </button>
            <IconButton
              label="Dismiss"
              icon={<X aria-hidden />}
              size="lg"
              className="bg-transparent"
              onClick={() => setShown(null)}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
