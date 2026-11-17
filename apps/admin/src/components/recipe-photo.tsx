import { ApiError, putRecipe } from '@project180/client'
import { type Recipe, recipePhoto } from '@project180/shared'
import { Button, ConfirmDialog, cn, toast } from '@project180/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChefHat, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { APP_URL } from '../urls'
import { shrink } from './exercise-photo'

/** A recipe's photo as a small square in lists, or a quiet placeholder. */
export function RecipeThumb({
  imageKey,
  className,
}: {
  imageKey: string | null
  className?: string
}) {
  const src = recipePhoto(imageKey, APP_URL)
  return (
    <span
      className={cn(
        'grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-raised text-ink-muted',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ChefHat className="size-5" aria-hidden />
      )}
    </span>
  )
}

async function send(path: string, init: RequestInit): Promise<Recipe> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init })
  const data = (await res.json().catch(() => null)) as { recipe?: Recipe; error?: string } | null
  if (!res.ok || !data?.recipe) throw new ApiError(res.status, data?.error ?? res.statusText)
  return data.recipe
}

/**
 * The photo in the recipe drawer: clients see it on the recipe card and at the top of the
 * recipe. Uploading replaces a stock photo; removing keeps it gone (the seed won't add it back).
 */
export function RecipePhotoField({ recipe }: { recipe: Recipe }) {
  const queryClient = useQueryClient()
  const inputId = useId()
  const [imageKey, setImageKey] = useState(recipe.imageKey)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const src = recipePhoto(imageKey, APP_URL)
  const saved = (r: Recipe) => {
    setImageKey(r.imageKey)
    putRecipe(queryClient, r)
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.set('photo', await shrink(file))
      return send(`/recipes/${recipe.id}/photo`, { method: 'POST', body: form })
    },
    onSuccess: (r) => {
      saved(r)
      toast({ title: 'Photo saved', description: r.title })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save the photo',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const remove = useMutation({
    mutationFn: () => send(`/recipes/${recipe.id}/photo`, { method: 'DELETE' }),
    onSuccess: (r) => {
      saved(r)
      setConfirmRemove(false)
      toast({ title: 'Photo removed', description: r.title })
    },
  })

  return (
    <div className="flex flex-col gap-2">
      <span className="font-bold text-[13px]">Photo</span>
      <label
        htmlFor={inputId}
        className={cn(
          'relative flex aspect-[16/9] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md text-center text-ink-muted transition hover:text-ink',
          src
            ? 'bg-surface-raised'
            : 'border-[1.5px] border-border-strong border-dashed bg-surface-raised',
        )}
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <>
            <ImagePlus className="size-6" aria-hidden />
            <span className="font-bold text-[14px]">Add a photo</span>
            <span className="px-4 text-[12px]">
              Your own photo of the dish works best. JPG, PNG or WebP.
            </span>
          </>
        )}
        {upload.isPending && (
          <span className="absolute inset-0 grid place-items-center bg-scrim text-[#f5f3ed]">
            <LoaderCircle className="size-6 animate-spin" aria-label="Uploading" />
          </span>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            e.target.value = ''
          }}
        />
      </label>
      {src && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ImagePlus className="size-4" aria-hidden />}
            disabled={upload.isPending}
            onClick={() => document.getElementById(inputId)?.click()}
          >
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this photo?"
        confirmLabel="Remove photo"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmRemove(false)}
      >
        Clients see the recipe without a photo. You can add another any time.
      </ConfirmDialog>
    </div>
  )
}
