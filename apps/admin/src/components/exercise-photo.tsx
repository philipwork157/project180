import { ApiError, exercisesQuery, putExercise } from '@project180/client'
import { type Exercise, exercisePhotos } from '@project180/shared'
import { Button, ConfirmDialog, cn, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dumbbell, ImagePlus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { APP_URL } from '../urls'

/** The start photo of an exercise as a small square, or a quiet placeholder. */
export function ExerciseThumb({
  imageKey,
  className,
}: {
  imageKey: string | null
  className?: string
}) {
  const [src] = exercisePhotos(imageKey, APP_URL)
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-raised text-ink-muted',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Dumbbell className="size-4" aria-hidden />
      )}
    </span>
  )
}

/** Shrinks a photo in the browser (longest side 1200px, WebP) so uploads stay small and quick. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82))
    return blob
      ? new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
      : file
  } catch {
    return file
  }
}

async function send(path: string, init: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init })
  const data = (await res.json().catch(() => null)) as {
    exercise?: Exercise
    error?: string
  } | null
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText)
  return data?.exercise
}

function PhotoPick({
  label,
  file,
  onPick,
}: {
  label: string
  file: File | null
  onPick: (f: File | null) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border-[1.5px] border-border-strong border-dashed bg-surface-raised text-center text-ink-muted transition hover:text-ink"
    >
      {file ? (
        <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
      ) : (
        <>
          <ImagePlus className="size-6" aria-hidden />
          <span className="font-bold text-[13px]">{label}</span>
        </>
      )}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

/**
 * Photos in the edit drawer: shows the current start/finish photos and lets the coach upload
 * their own (replacing any stock photo) or remove them.
 */
export function ExercisePhotos({ exercise }: { exercise: Exercise }) {
  const queryClient = useQueryClient()
  const list = useQuery(exercisesQuery())
  const current = list.data?.find((e) => e.id === exercise.id) ?? exercise
  const photos = exercisePhotos(current.imageKey, APP_URL)
  const [picking, setPicking] = useState(false)
  const [start, setStart] = useState<File | null>(null)
  const [finish, setFinish] = useState<File | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['exercises'] })

  const upload = useMutation({
    mutationFn: async () => {
      if (!start) throw new ApiError(400, 'Choose a start photo')
      const form = new FormData()
      form.set('start', await shrink(start))
      if (finish) form.set('finish', await shrink(finish))
      return send(`/exercises/${exercise.id}/photos`, { method: 'POST', body: form })
    },
    onSuccess: (saved) => {
      if (saved) putExercise(queryClient, saved)
      void refresh()
      setPicking(false)
      setStart(null)
      setFinish(null)
      toast({ title: 'Photos saved', description: current.name })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save the photos',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const remove = useMutation({
    mutationFn: () => send(`/exercises/${exercise.id}/photos`, { method: 'DELETE' }),
    onSuccess: (saved) => {
      if (saved) putExercise(queryClient, saved)
      void refresh()
      setConfirmRemove(false)
      toast({ title: 'Photos removed', description: 'Clients see the form cue instead.' })
    },
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[13px]">Photos</span>
        {!picking && (
          <div className="flex gap-1">
            {photos.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus className="size-4" aria-hidden />}
              onClick={() => setPicking(true)}
            >
              {photos.length ? 'Replace' : 'Add photos'}
            </Button>
          </div>
        )}
      </div>

      {picking ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <PhotoPick label="Start position" file={start} onPick={setStart} />
            <PhotoPick label="Finish (optional)" file={finish} onPick={setFinish} />
          </div>
          <p className="text-[12px] text-ink-muted">
            Use your own photos (or ones you have permission to use). They’re shrunk before
            uploading.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={upload.isPending}
              disabled={!start}
              onClick={() => upload.mutate()}
            >
              Save photos
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : photos.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          No photo yet. Clients see the form cue instead.
        </p>
      ) : (
        <div className={photos.length > 1 ? 'grid grid-cols-2 gap-3' : 'grid'}>
          {photos.map((src, i) => (
            <figure key={src} className="flex flex-col gap-1.5">
              <img
                src={src}
                alt={`${current.name}: ${i === 0 ? 'start' : 'finish'}`}
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

      <ConfirmDialog
        open={confirmRemove}
        title="Remove these photos?"
        confirmLabel="Remove photos"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmRemove(false)}
      >
        Clients will see the form cue instead. You can add photos again any time.
      </ConfirmDialog>
    </div>
  )
}
