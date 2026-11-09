import { exerciseVideosQuery } from '@project180/client'
import {
  exerciseVideoSearchUrl,
  type WorkoutExerciseItem,
  youtubeEmbedUrl,
  youtubeId,
} from '@project180/shared'
import { cn } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, PlayCircle } from 'lucide-react'
import { useState } from 'react'

const linkClass =
  'flex h-12 items-center justify-center gap-2 rounded-md bg-brand font-bold text-[15px] text-on-brand transition active:scale-[0.98]'

/**
 * Videos inside the "how to" sheet: the coach's own YouTube video plays right here; otherwise
 * a tap shows YouTube results for the exercise, and they play here too. Falls back to opening
 * YouTube when search isn't set up.
 */
export function ExerciseVideos({
  exercise: ex,
  autoSearch = false,
}: {
  exercise: WorkoutExerciseItem
  /** Opened from "Watch how": load the results straight away. */
  autoSearch?: boolean
}) {
  const coachVideo = youtubeId(ex.videoUrl)
  const [playing, setPlaying] = useState<string | null>(coachVideo)
  const [searching, setSearching] = useState(autoSearch)
  const videos = useQuery({
    ...exerciseVideosQuery(ex.exerciseId),
    enabled: searching && !coachVideo,
  })
  const fallback = ex.videoUrl ?? exerciseVideoSearchUrl(ex.exerciseName, ex.muscleGroup)

  // A coach's link that isn't YouTube (Vimeo…): open it.
  if (ex.videoUrl && !coachVideo) {
    return (
      <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <PlayCircle className="size-5" aria-hidden />
        Watch the video
      </a>
    )
  }

  const results = videos.data?.results ?? []
  const noSearch = videos.data && (!videos.data.configured || results.length === 0)

  return (
    <div className="flex flex-col gap-3">
      {playing && (
        <div className="flex flex-col gap-1.5">
          <iframe
            key={playing}
            src={youtubeEmbedUrl(playing)}
            title={`How to do ${ex.exerciseName}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full rounded-md bg-surface-raised"
          />
          <p className="font-semibold text-[12px] text-ink-muted">
            {playing === coachVideo
              ? 'Chosen by your coach'
              : 'From YouTube search, not checked by your coach'}
          </p>
        </div>
      )}

      {!coachVideo && !searching && (
        <button type="button" onClick={() => setSearching(true)} className={linkClass}>
          <PlayCircle className="size-5" aria-hidden />
          Show how-to videos
        </button>
      )}

      {!coachVideo && searching && videos.isPending && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-md bg-surface-raised" />
          ))}
        </div>
      )}

      {!coachVideo && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((v) => (
            <li key={v.videoId}>
              <button
                type="button"
                onClick={() => setPlaying(v.videoId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md p-1.5 text-left transition active:scale-[0.99]',
                  playing === v.videoId ? 'bg-brand-soft' : 'hover:bg-surface-raised',
                )}
              >
                <img
                  src={v.thumbnail}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-28 shrink-0 rounded-sm bg-surface-raised object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-semibold text-[14px] leading-5">
                    {v.title}
                  </span>
                  <span className="block truncate text-[12px] text-ink-muted">{v.channel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!coachVideo && (noSearch || videos.isError) && (
        <a href={fallback} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <ExternalLink className="size-5" aria-hidden />
          Search on YouTube
        </a>
      )}
    </div>
  )
}
