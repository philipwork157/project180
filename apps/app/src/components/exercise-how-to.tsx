import { exercisePhotos, MUSCLE_GROUP_LABELS, type WorkoutExerciseItem } from '@project180/shared'
import { Chip, cn, MUSCLE_GROUP_TONE } from '@project180/ui'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { ExerciseVideos } from './exercise-videos'
import { Sheet } from './sheet'

/**
 * "How do I do this?" for one exercise. Two ways in, one sheet:
 * - the thumbnail: the start photo, or a play tile when there's no photo (videos first);
 * - `WatchButton`: "Watch how", which opens straight onto the videos.
 */
export function useExerciseHowTo(ex: WorkoutExerciseItem) {
  const [open, setOpen] = useState<false | 'photos' | 'videos'>(false)
  const photos = exercisePhotos(ex.imageKey)
  const videosFirst = open === 'videos' || photos.length === 0

  const thumbnail = (
    <button
      type="button"
      onClick={() => setOpen(photos[0] ? 'photos' : 'videos')}
      aria-label={photos[0] ? `How to do ${ex.exerciseName}` : `Watch how to do ${ex.exerciseName}`}
      className={cn(
        'relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md transition active:scale-95',
        photos[0] ? 'bg-surface-raised' : 'bg-brand-soft text-brand-text',
      )}
    >
      {photos[0] ? (
        <img src={photos[0]} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Play className="size-5 translate-x-px fill-current" aria-hidden />
      )}
    </button>
  )

  const watchButton = (
    <button
      type="button"
      onClick={() => setOpen('videos')}
      className="-mx-1 inline-flex h-8 items-center gap-1.5 rounded-pill px-2 font-bold text-[13px] text-brand-text transition hover:bg-brand-soft active:scale-95"
    >
      <Play className="size-3.5 fill-current" aria-hidden />
      Watch how
    </button>
  )

  const videos = <ExerciseVideos exercise={ex} autoSearch={videosFirst} />

  const sheet = (
    <Sheet
      open={open !== false}
      onClose={() => setOpen(false)}
      label={`How to do ${ex.exerciseName}`}
    >
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-extrabold text-[24px] leading-7">{ex.exerciseName}</h2>
          <Chip tone={MUSCLE_GROUP_TONE[ex.muscleGroup]} className="h-6 self-start text-[12px]">
            {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
          </Chip>
        </div>
        {videosFirst && videos}
        {photos.length > 0 && (
          <div className={photos.length > 1 ? 'grid grid-cols-2 gap-3' : 'grid'}>
            {photos.map((src, i) => (
              <figure key={src} className="flex flex-col gap-1.5">
                <img
                  src={src}
                  alt={`${ex.exerciseName}: ${i === 0 ? 'start' : 'finish'} position`}
                  className="aspect-[4/3] w-full rounded-md bg-surface-raised object-cover"
                />
                {photos.length > 1 && (
                  <figcaption className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                    {i === 0 ? 'Start' : 'Finish'}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
        {!videosFirst && videos}
        {ex.instructions && (
          <div className="flex flex-col gap-1">
            <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              How to do it
            </p>
            <p className="text-[15px] leading-6">{ex.instructions}</p>
          </div>
        )}
        {ex.notes && (
          <div className="flex flex-col gap-1 rounded-md bg-sand/15 p-3">
            <p className="font-extrabold text-[11px] text-sand-text uppercase tracking-[0.08em]">
              From your coach
            </p>
            <p className="text-[15px]">{ex.notes}</p>
          </div>
        )}
      </div>
    </Sheet>
  )

  return { thumbnail, watchButton, sheet }
}
