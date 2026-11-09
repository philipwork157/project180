import { ApiError, api, exercisesQuery, exerciseVideosQuery } from '@project180/client'
import {
  EQUIPMENT_LABELS,
  exercisePhotos,
  exerciseVideoSearchUrl,
  MUSCLE_GROUP_LABELS,
  youtubeEmbedUrl,
  youtubeId,
} from '@project180/shared'
import { Button, Chip, cn, IconButton, MUSCLE_GROUP_TONE, Tooltip, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, PlayCircle, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_URL } from '../urls'

/**
 * The play button on an exercise (exercise list, workout builder, exercise picker). Opens a
 * quick look in a pop-up instead of leaving the dashboard: the chosen video, YouTube results,
 * photos and how to do it.
 */
export function VideoButton({
  exerciseId,
  name,
  hasVideo,
}: {
  exerciseId: number
  name: string
  hasVideo?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip label={hasVideo ? 'Watch the video' : 'Find a video'}>
        <button
          type="button"
          aria-label={hasVideo ? `Watch the video for ${name}` : `Find a video for ${name}`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-sm transition hover:bg-surface-raised active:scale-95 [&_svg]:size-[18px]',
            hasVideo ? 'text-brand-text' : 'text-ink-muted hover:text-ink',
          )}
        >
          <PlayCircle aria-hidden />
        </button>
      </Tooltip>
      <ExerciseQuickLook exerciseId={open ? exerciseId : null} onClose={() => setOpen(false)} />
    </>
  )
}

export function ExerciseQuickLook({
  exerciseId,
  onClose,
}: {
  exerciseId: number | null
  onClose: () => void
}) {
  useEffect(() => {
    if (exerciseId === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [exerciseId, onClose])

  return createPortal(
    <AnimatePresence>
      {exerciseId !== null && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center p-3 md:p-6"
          role="dialog"
          aria-modal
        >
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface shadow-float"
          >
            <QuickLookBody exerciseId={exerciseId} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function QuickLookBody({ exerciseId, onClose }: { exerciseId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const exercise = useQuery(exercisesQuery()).data?.find((e) => e.id === exerciseId)
  const chosenId = youtubeId(exercise?.videoUrl)
  // What's in the player: the chosen video first, otherwise whatever result was clicked.
  const [playing, setPlaying] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const showResults = browsing || !exercise?.videoUrl
  const videos = useQuery({ ...exerciseVideosQuery(exerciseId), enabled: showResults })
  const results = (videos.data?.results ?? []).filter((v) => v.videoId !== chosenId)
  const current = playing ?? chosenId ?? null
  const photos = exercisePhotos(exercise?.imageKey, APP_URL)

  const save = useMutation({
    mutationFn: (videoId: string) =>
      api(`/exercises/${exerciseId}`, {
        method: 'PATCH',
        body: { videoUrl: `https://www.youtube.com/watch?v=${videoId}` },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exercises'] })
      setPlaying(null)
      setBrowsing(false)
      toast({
        title: 'Video saved',
        description: `Clients see it on ${exercise?.name ?? 'this exercise'}.`,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save the video',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })

  if (!exercise) return <div className="h-80 animate-pulse bg-surface-raised" />
  const isChosen = current !== null && current === chosenId

  return (
    <>
      <div className="flex items-start gap-3 border-border border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-extrabold text-[20px] leading-7">{exercise.name}</h2>
          <div className="mt-1 flex items-center gap-2">
            <Chip tone={MUSCLE_GROUP_TONE[exercise.muscleGroup]}>
              {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
            </Chip>
            <span className="truncate text-[13px] text-ink-muted">
              {EQUIPMENT_LABELS[exercise.equipment]}
            </span>
          </div>
        </div>
        <IconButton label="Close" icon={<X aria-hidden />} size="sm" onClick={onClose} />
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        {current ? (
          <div className="flex flex-col gap-2">
            <iframe
              key={current}
              src={youtubeEmbedUrl(current)}
              title={`${exercise.name} video`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="aspect-video w-full rounded-md bg-surface-raised"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-ink-muted">
                {isChosen
                  ? 'The video you chose. Clients see this one first.'
                  : 'From YouTube search. Not chosen yet.'}
              </span>
              {!isChosen && (
                <Button
                  size="sm"
                  icon={<Check className="size-4" aria-hidden />}
                  loading={save.isPending}
                  onClick={() => save.mutate(current)}
                >
                  Use this video
                </Button>
              )}
            </div>
          </div>
        ) : exercise.videoUrl ? (
          <a
            href={exercise.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-surface-raised p-4 font-bold text-[14px] text-brand-text hover:underline"
          >
            Open the chosen video <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={i === 0 ? 'Start position' : 'End position'}
                className="aspect-square w-full rounded-md bg-surface-raised object-cover"
              />
            ))}
          </div>
        ) : null}

        {!showResults && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setBrowsing(true)}
          >
            Show other videos
          </Button>
        )}

        {showResults && (
          <div className="flex flex-col gap-2">
            {videos.isPending && (
              <div className="h-28 animate-pulse rounded-md bg-surface-raised" />
            )}
            {videos.data && !videos.data.configured && (
              <p className="rounded-md bg-sand/15 p-3 text-[13px]">
                Showing YouTube results here needs a YouTube API key (see the README).{' '}
                <a
                  href={exerciseVideoSearchUrl(exercise.name, exercise.muscleGroup)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-brand-text hover:underline"
                >
                  Search on YouTube <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </p>
            )}
            {videos.data?.configured && results.length === 0 && (
              <p className="text-[13px] text-ink-muted">No other videos found.</p>
            )}
            {results.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {results.map((v) => (
                  <li key={v.videoId}>
                    <button
                      type="button"
                      onClick={() => setPlaying(v.videoId)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-1.5 text-left transition hover:bg-surface-raised',
                        current === v.videoId && 'bg-brand-soft hover:bg-brand-soft',
                      )}
                    >
                      <span className="relative shrink-0">
                        <img
                          src={v.thumbnail}
                          alt=""
                          loading="lazy"
                          className="aspect-video w-28 rounded-sm bg-surface-raised object-cover"
                        />
                        <PlayCircle
                          className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-7 text-white drop-shadow"
                          aria-hidden
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-semibold text-[13px] leading-5">
                          {v.title}
                        </span>
                        <span className="block truncate text-[12px] text-ink-muted">
                          {v.channel}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {exercise.instructions && (
          <div className="flex flex-col gap-1 border-border border-t pt-4">
            <span className="font-bold text-[13px]">How to do it</span>
            <p className="whitespace-pre-line text-[14px] text-ink-muted">
              {exercise.instructions}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
