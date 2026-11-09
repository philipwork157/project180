import { ApiError, api, exercisesQuery, exerciseVideosQuery } from '@project180/client'
import {
  type Exercise,
  exerciseVideoSearchUrl,
  youtubeEmbedUrl,
  youtubeId,
} from '@project180/shared'
import { Button, cn, Input, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, PlayCircle, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

/**
 * The exercise's video in the edit drawer: watch it, pick one from YouTube results (previewed
 * right here), paste a link, or remove it. Saved straight away, separate from the form.
 */
export function ExerciseVideo({ exercise }: { exercise: Exercise }) {
  const queryClient = useQueryClient()
  const list = useQuery(exercisesQuery())
  const current = list.data?.find((e) => e.id === exercise.id) ?? exercise
  const currentId = youtubeId(current.videoUrl)
  const [choosing, setChoosing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const videos = useQuery({ ...exerciseVideosQuery(exercise.id), enabled: choosing })

  const save = useMutation({
    mutationFn: (videoUrl: string | null) =>
      api(`/exercises/${exercise.id}`, { method: 'PATCH', body: { videoUrl } }),
    onSuccess: async (_, videoUrl) => {
      await queryClient.invalidateQueries({ queryKey: ['exercises'] })
      setChoosing(false)
      setPreview(null)
      setLink('')
      toast({ title: videoUrl ? 'Video saved' : 'Video removed', description: current.name })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save the video',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })

  const results = videos.data?.results ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[13px]">Video</span>
        {!choosing && (
          <div className="flex gap-1">
            {current.videoUrl && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => save.mutate(null)}
              >
                Remove
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<Search className="size-4" aria-hidden />}
              onClick={() => setChoosing(true)}
            >
              {current.videoUrl ? 'Change' : 'Choose a video'}
            </Button>
          </div>
        )}
      </div>

      {!choosing &&
        (currentId ? (
          <iframe
            src={youtubeEmbedUrl(currentId).replace('autoplay=1', 'autoplay=0')}
            title={`${current.name} video`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full rounded-md bg-surface-raised"
          />
        ) : current.videoUrl ? (
          <a
            href={current.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[14px] text-brand-text hover:underline"
          >
            {current.videoUrl}
          </a>
        ) : (
          <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
            No video chosen. Clients can still look at YouTube results in the app; a video you
            choose shows first and is marked as yours.
          </p>
        ))}

      {choosing && (
        <div className="flex flex-col gap-3">
          {preview && (
            <iframe
              key={preview}
              src={youtubeEmbedUrl(preview)}
              title="Preview"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="aspect-video w-full rounded-md bg-surface-raised"
            />
          )}
          {videos.isPending && <div className="h-40 animate-pulse rounded-md bg-surface-raised" />}
          {videos.data && !videos.data.configured && (
            <p className="rounded-md bg-sand/15 p-3 text-[13px]">
              Searching inside the app needs a YouTube API key (see the README). Until then, search
              on YouTube and paste the link below.
            </p>
          )}
          {results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((v) => (
                <li
                  key={v.videoId}
                  className={cn(
                    'flex items-center gap-3 rounded-md p-1.5',
                    preview === v.videoId && 'bg-brand-soft',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreview(v.videoId)}
                    className="relative shrink-0"
                    aria-label={`Preview ${v.title}`}
                  >
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
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold text-[13px] leading-5">
                      {v.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-muted">{v.channel}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={save.isPending && save.variables?.includes(v.videoId)}
                    onClick={() => save.mutate(`https://www.youtube.com/watch?v=${v.videoId}`)}
                  >
                    Use this
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <span className="font-bold text-[12px] text-ink-muted">
              Or paste a link (YouTube or Vimeo)
            </span>
            <div className="flex gap-2">
              <Input
                compact
                className="min-w-0 flex-1"
                type="url"
                inputMode="url"
                placeholder="https://youtube.com/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!/^https?:\/\//.test(link.trim())}
                loading={save.isPending && save.variables === link.trim()}
                onClick={() => save.mutate(link.trim())}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <a
              href={exerciseVideoSearchUrl(current.name, current.muscleGroup)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-[13px] text-brand-text hover:underline"
            >
              Search on YouTube <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
