import { ApiError, api, clientWorkoutQuery, meQuery } from '@project180/client'
import { type SessionFeedback, timeAgo } from '@project180/shared'
import { Button, ConfirmDialog, cn, Field, IconButton, Textarea, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, MessageCircle, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'

type Data = { feedback: SessionFeedback[] }

/**
 * Like and comment on a client's workout (exerciseId null) or one exercise in it. Likes show
 * at once; the client gets a push and sees it on that workout in the app.
 */
export function FeedbackBar({
  userId,
  sessionId,
  exerciseId,
  items,
  clientName,
}: {
  userId: number
  sessionId: number
  exerciseId: number | null
  /** All of this session's feedback; the bar picks out its own. */
  items: SessionFeedback[]
  clientName: string
}) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery)
  const key = clientWorkoutQuery(userId, sessionId).queryKey
  const base = `/admin/users/${userId}/workouts/${sessionId}/feedback`
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [deleting, setDeleting] = useState<SessionFeedback | null>(null)
  const first = clientName.split(' ')[0] ?? clientName

  const mine = items.filter((f) => f.exerciseId === exerciseId)
  const likes = mine.filter((f) => f.kind === 'like')
  const comments = mine.filter((f) => f.kind === 'comment')
  const myLike = likes.find((f) => f.authorId === me?.id)

  const edit = (change: (list: SessionFeedback[]) => SessionFeedback[]) =>
    queryClient.setQueryData(key, (old) =>
      old ? { ...old, feedback: change((old as Data).feedback) } : old,
    )
  const failed = (title: string) => (err: unknown) =>
    toast({ tone: 'error', title, description: err instanceof ApiError ? err.message : undefined })

  const like = useMutation({
    mutationFn: () =>
      api<{ feedback: SessionFeedback }>(base, {
        method: 'POST',
        body: { exerciseId, kind: 'like' },
      }),
    onMutate: () => {
      const temp: SessionFeedback = {
        id: -Date.now(),
        sessionId,
        exerciseId,
        kind: 'like',
        body: null,
        authorId: me?.id ?? null,
        authorName: me?.name ?? null,
        createdAt: new Date().toISOString(),
        readAt: null,
      }
      edit((list) => [...list, temp])
      return temp.id
    },
    onSuccess: ({ feedback }, _v, tempId) =>
      edit((list) => [...list.filter((f) => f.id !== tempId && f.id !== feedback.id), feedback]),
    onError: (err, _v, tempId) => {
      edit((list) => list.filter((f) => f.id !== tempId))
      failed('Couldn’t send your like')(err)
    },
  })

  const unlike = useMutation({
    mutationFn: (f: SessionFeedback) => api(`${base}/${f.id}`, { method: 'DELETE' }),
    onMutate: (f) => edit((list) => list.filter((x) => x.id !== f.id)),
    onError: (err, f) => {
      edit((list) => [...list, f])
      failed('Couldn’t take the like back')(err)
    },
  })

  const comment = useMutation({
    mutationFn: (body: string) =>
      api<{ feedback: SessionFeedback }>(base, {
        method: 'POST',
        body: { exerciseId, kind: 'comment', body },
      }),
    onSuccess: ({ feedback }) => {
      edit((list) => [...list, feedback])
      setText('')
      setWriting(false)
      toast({ title: 'Comment sent', description: `${first} will see it on this workout.` })
    },
    onError: failed('Couldn’t send your comment'),
  })

  const remove = useMutation({
    mutationFn: (f: SessionFeedback) => api(`${base}/${f.id}`, { method: 'DELETE' }),
    onSuccess: (_r, f) => {
      edit((list) => list.filter((x) => x.id !== f.id))
      setDeleting(null)
      toast({ title: 'Comment deleted' })
    },
    onError: failed('Couldn’t delete the comment'),
  })

  const send = () => {
    const body = text.trim()
    if (body && !comment.isPending) comment.mutate(body)
  }
  const whatLabel = exerciseId === null ? 'this workout' : 'this exercise'

  return (
    <div className="flex flex-col gap-3">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-md bg-surface-raised p-3">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line break-words text-[14px]">{f.body}</p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {f.authorId === me?.id ? 'You' : (f.authorName ?? 'A coach')} ·{' '}
                  {timeAgo(f.createdAt).toLowerCase()}
                  {f.readAt ? ` · seen by ${first}` : ''}
                </p>
              </div>
              {f.authorId === me?.id && (
                <IconButton
                  label="Delete comment"
                  icon={<Trash2 aria-hidden />}
                  size="sm"
                  tone="danger"
                  className="-my-1"
                  onClick={() => setDeleting(f)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {writing && (
        <div className="flex flex-col gap-2">
          <Field label={`Comment on ${whatLabel}`}>
            {(id) => (
              <Textarea
                id={id}
                autoFocus
                value={text}
                maxLength={1000}
                placeholder={`Nice work, ${first}…`}
                className="min-h-20"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                }}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() => {
                setWriting(false)
                setText('')
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-11 sm:h-9"
              icon={<Send className="size-4" aria-hidden />}
              loading={comment.isPending}
              disabled={!text.trim()}
              onClick={send}
            >
              Send
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={myLike ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('h-11 sm:h-9', myLike && 'text-brand-text')}
          aria-pressed={!!myLike}
          icon={
            <Heart
              className={cn('size-4 transition', myLike && 'scale-110 fill-current')}
              aria-hidden
            />
          }
          onClick={() => (myLike ? unlike.mutate(myLike) : like.mutate())}
        >
          {myLike ? 'Liked' : 'Like'}
          {likes.length > 1 && <span className="tabular text-ink-muted">· {likes.length}</span>}
        </Button>
        {!writing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 sm:h-9"
            icon={<MessageCircle className="size-4" aria-hidden />}
            onClick={() => setWriting(true)}
          >
            Comment
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this comment?"
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      >
        {first} won’t see it any more.
      </ConfirmDialog>
    </div>
  )
}
