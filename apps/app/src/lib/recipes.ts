// Recipes on the phone: saving one (the heart, shown at once) and logging a serving to Fuel.
import { api, putRecipe, recipeQuery } from '@project180/client'
import {
  formatAmount,
  type Meal,
  type Recipe,
  type RecipePage,
  recipePortion,
} from '@project180/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAddFood } from './food'

/** Heart a recipe or take the heart off. Shows straight away; goes back if the server says no. */
export function useSaveRecipe() {
  const queryClient = useQueryClient()
  const setSaved = (id: number, saved: boolean) => {
    queryClient.setQueryData(recipeQuery(id).queryKey, (r) => (r ? { ...r, saved } : r))
    queryClient.setQueriesData<RecipePage>({ queryKey: ['recipes', 'page'] }, (page) =>
      page
        ? { ...page, recipes: page.recipes.map((r) => (r.id === id ? { ...r, saved } : r)) }
        : page,
    )
  }
  return useMutation({
    mutationFn: ({ id, saved }: { id: number; saved: boolean }) =>
      api<{ recipe: Recipe }>(`/recipes/${id}/save`, { method: saved ? 'PUT' : 'DELETE' }),
    onMutate: ({ id, saved }) => {
      navigator.vibrate?.(10)
      setSaved(id, saved)
    },
    onError: (_err, { id, saved }) => setSaved(id, !saved),
    onSuccess: ({ recipe }) => putRecipe(queryClient, recipe),
  })
}

/** What a logged portion is called in the food log: "Egg bagel", "Egg bagel (1½ servings)". */
export function portionName(title: string, servings: number) {
  return servings === 1 ? title : `${title} (${formatAmount(servings)} servings)`
}

/** Logs `servings` portions of a recipe to a meal on a day, as one food. */
export function useLogRecipe(onSaved?: () => void) {
  const add = useAddFood(onSaved)
  return {
    ...add,
    log: (input: {
      recipe: Recipe
      servings: number
      meal: Meal
      date: string
      clientUuid: string
    }) =>
      add.mutate({
        date: input.date,
        meal: input.meal,
        source: 'recipe',
        entries: [
          {
            clientUuid: input.clientUuid,
            name: portionName(input.recipe.title, input.servings),
            grams: null,
            ...recipePortion(input.recipe, input.servings),
          },
        ],
      }),
  }
}
