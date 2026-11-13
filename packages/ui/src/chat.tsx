import type { ChatMessage, ChatThread } from '@project180/shared'
import { ArrowUp, RotateCcw } from 'lucide-react'
import { motion } from 'motion/react'
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cn } from './cn'
import { Textarea } from './field'
import { IconButton } from './icon-button'

export type ChatItem = ChatMessage & { status: 'sent' | 'sending' | 'failed' }

/**
 * The state of one conversation: the newest page from the server (refreshed by the caller),
 * older pages loaded on request, and messages being sent (shown at once, retried on failure).
 */
export function useChat({
  thread,
  meId,
  meName,
  loadOlder,
  post,
  markRead,
}: {
  /** The newest page, from the caller's query (polled while the chat is open). */
  thread: ChatThread | undefined
  meId: number
  meName: string
  loadOlder: (before: number) => Promise<ChatThread>
  post: (input: { clientUuid: string; body: string }) => Promise<ChatMessage>
  /** Called with the newest id from the other side once it's on screen. */
  markRead: (upTo: number) => void
}) {
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sent, setSent] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState<ChatItem[]>([])

  // Everything known, by id, oldest first; a pending message drops out once it's saved.
  const byId = new Map<number, ChatMessage>()
  for (const m of [...older, ...(thread?.messages ?? []), ...sent]) byId.set(m.id, m)
  const saved = [...byId.values()].sort((a, b) => a.id - b.id)
  const savedUuids = new Set(saved.map((m) => m.clientUuid))
  const items: ChatItem[] = [
    ...saved.map((m) => ({ ...m, status: 'sent' as const })),
    ...pending.filter((p) => !savedUuids.has(p.clientUuid)),
  ]
  const hasMore = olderHasMore ?? thread?.hasMore ?? false

  const first = saved[0]?.id
  const more = useCallback(async () => {
    if (!first || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await loadOlder(first)
      setOlder((list) => [...page.messages, ...list])
      setOlderHasMore(page.hasMore)
    } finally {
      setLoadingOlder(false)
    }
  }, [first, loadingOlder, loadOlder])

  const deliver = useCallback(
    async (item: ChatItem) => {
      setPending((list) => [
        ...list.filter((p) => p.clientUuid !== item.clientUuid),
        { ...item, status: 'sending' },
      ])
      try {
        const message = await post({ clientUuid: item.clientUuid, body: item.body })
        setSent((list) => [...list, message])
        setPending((list) => list.filter((p) => p.clientUuid !== item.clientUuid))
      } catch {
        setPending((list) =>
          list.map((p) => (p.clientUuid === item.clientUuid ? { ...p, status: 'failed' } : p)),
        )
      }
    },
    [post],
  )

  const send = (body: string) => {
    const text = body.trim()
    if (!text) return
    void deliver({
      id: Number.MAX_SAFE_INTEGER - pending.length,
      clientUuid: crypto.randomUUID(),
      senderId: meId,
      senderName: meName,
      body: text,
      createdAt: new Date().toISOString(),
      status: 'sending',
    })
  }

  // Read up to the newest message from the other side.
  const newestFromOthers = saved.filter((m) => m.senderId !== meId).at(-1)?.id ?? 0
  const readUpTo = thread?.readUpTo ?? 0
  const lastMarked = useRef(0)
  useEffect(() => {
    if (newestFromOthers > readUpTo && newestFromOthers > lastMarked.current) {
      lastMarked.current = newestFromOthers
      markRead(newestFromOthers)
    }
  }, [newestFromOthers, readUpTo, markRead])

  return {
    items,
    hasMore,
    loadingOlder,
    loadOlder: more,
    send,
    retry: (item: ChatItem) => void deliver(item),
    seenUpTo: thread?.seenUpTo ?? 0,
    loaded: thread !== undefined,
  }
}

const ZONE = 'Africa/Johannesburg'
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE })
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })

function dayLabel(iso: string) {
  const day = dayKey(iso)
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString())
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: ZONE,
  })
}

/**
 * A conversation: messages (yours on the right), day separators, "Seen" under your last read
 * message, and the composer at the bottom. Fills its parent's height; the list scrolls inside.
 */
export function ChatView({
  chat,
  meId,
  showSenderNames = false,
  empty,
  composerLabel,
  placeholder = 'Message',
  className,
  composerClassName,
}: {
  chat: ReturnType<typeof useChat>
  meId: number
  /** Name above other people's messages (staff: a client's chat can have several staff). */
  showSenderNames?: boolean
  /** Shown when there are no messages yet. */
  empty: ReactNode
  composerLabel: string
  placeholder?: string
  className?: string
  composerClassName?: string
}) {
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const prevHeight = useRef(0)
  const prevFirst = useRef<number | undefined>(undefined)
  const { items } = chat
  const lastId = items.at(-1)?.clientUuid
  const firstId = items[0]?.id

  // Keep the view pinned to the newest message while you're at the bottom (and on first load);
  // when older messages load above, keep what you were reading in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again whenever a message arrives or is sent, though it only reads the scroll position
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevFirst.current !== undefined && firstId !== prevFirst.current && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current
    } else if (nearBottom.current) {
      el.scrollTop = el.scrollHeight
    }
    prevHeight.current = el.scrollHeight
    prevFirst.current = firstId
  }, [lastId, firstId, items.length])

  const lastMine = [...items].reverse().find((m) => m.senderId === meId && m.status === 'sent')
  const coarse =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

  function submit() {
    if (!text.trim()) return
    nearBottom.current = true
    chat.send(text)
    setText('')
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-4"
        aria-live="polite"
      >
        {!chat.loaded ? (
          <div className="mt-auto flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-12 w-2/3 animate-pulse rounded-lg bg-surface-raised',
                  i === 1 && 'self-end',
                )}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="m-auto max-w-xs text-center">{empty}</div>
        ) : (
          <>
            {chat.hasMore && (
              <button
                type="button"
                onClick={() => void chat.loadOlder()}
                disabled={chat.loadingOlder}
                className="mx-auto mb-3 min-h-11 rounded-pill px-4 font-bold text-[13px] text-brand-text transition hover:bg-brand-soft disabled:opacity-60"
              >
                {chat.loadingOlder ? 'Loading…' : 'Show earlier messages'}
              </button>
            )}
            <ol className="mt-auto flex flex-col gap-1.5">
              {items.map((m, i) => {
                const prev = items[i - 1]
                const mine = m.senderId === meId
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
                const sameSender = !newDay && prev?.senderId === m.senderId
                return (
                  <Fragment key={m.clientUuid}>
                    {newDay && (
                      <li className="my-3 text-center font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                        {dayLabel(m.createdAt)}
                      </li>
                    )}
                    <motion.li
                      initial={m.status === 'sending' ? { opacity: 0, y: 8, scale: 0.98 } : false}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                      className={cn(
                        'flex max-w-[85%] flex-col gap-1 md:max-w-[70%]',
                        mine ? 'items-end self-end' : 'items-start self-start',
                        !sameSender && 'mt-2',
                      )}
                    >
                      {showSenderNames && !mine && !sameSender && (
                        <span className="px-1 font-bold text-[12px] text-ink-muted">
                          {m.senderName ?? 'Someone'}
                        </span>
                      )}
                      <div
                        className={cn(
                          'whitespace-pre-line break-words rounded-lg px-4 py-2.5 text-[15px] leading-[21px]',
                          mine
                            ? 'rounded-br-sm bg-brand text-on-brand'
                            : 'rounded-bl-sm bg-surface-raised text-ink',
                          m.status === 'sending' && 'opacity-70',
                          m.status === 'failed' && 'opacity-60',
                        )}
                      >
                        {m.body}
                      </div>
                      <span className="flex items-center gap-2 px-1 text-[11px] text-ink-muted">
                        {m.status === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => chat.retry(m)}
                            className="-my-3 inline-flex min-h-11 items-center gap-1 font-bold text-danger"
                          >
                            <RotateCcw className="size-3.5" aria-hidden />
                            Not sent · Tap to retry
                          </button>
                        ) : m.status === 'sending' ? (
                          'Sending…'
                        ) : (
                          <>
                            {time(m.createdAt)}
                            {m === lastMine && chat.seenUpTo >= m.id && (
                              <span className="font-bold">· Seen</span>
                            )}
                          </>
                        )}
                      </span>
                    </motion.li>
                  </Fragment>
                )
              })}
            </ol>
          </>
        )}
      </div>

      <form
        className={cn('flex items-end gap-2 border-border border-t pt-3', composerClassName)}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Textarea
          aria-label={composerLabel}
          value={text}
          rows={1}
          maxLength={2000}
          enterKeyHint="send"
          placeholder={placeholder}
          className="max-h-36 min-h-11 flex-1 resize-none py-2.5 [field-sizing:content]"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends on a computer; on a phone the return key makes a new line.
            if (e.key === 'Enter' && !e.shiftKey && !coarse) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <IconButton
          type="submit"
          label="Send"
          icon={<ArrowUp aria-hidden />}
          size="lg"
          disabled={!text.trim()}
          className="rounded-pill bg-brand text-on-brand hover:bg-brand hover:text-on-brand disabled:opacity-40"
        />
      </form>
    </div>
  )
}
