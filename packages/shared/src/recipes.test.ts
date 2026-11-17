import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  ingredientLabel,
  ingredientLine,
  matchesRecipe,
  minutesLabel,
  parseIngredientLine,
  parseIngredientLines,
  parseStepLines,
  proteinShare,
  recipeInput,
  recipePhoto,
  recipePortion,
} from './recipes'

describe('parseIngredientLine', () => {
  it('reads an amount, a unit and the name', () => {
    expect(parseIngredientLine('200 g chicken breast')).toEqual({
      amount: 200,
      unit: 'g',
      name: 'chicken breast',
    })
    expect(parseIngredientLine('200g lean beef mince')).toEqual({
      amount: 200,
      unit: 'g',
      name: 'lean beef mince',
    })
    expect(parseIngredientLine('2 Tbsp soy sauce')).toEqual({
      amount: 2,
      unit: 'tbsp',
      name: 'soy sauce',
    })
    expect(parseIngredientLine('- 1 cup jasmine rice')).toEqual({
      amount: 1,
      unit: 'cup',
      name: 'jasmine rice',
    })
  })

  it('reads fractions written every way', () => {
    expect(parseIngredientLine('1/2 avocado')?.amount).toBe(0.5)
    expect(parseIngredientLine('1 1/2 cups oats')).toEqual({
      amount: 1.5,
      unit: 'cup',
      name: 'oats',
    })
    expect(parseIngredientLine('1½ cups oats')?.amount).toBe(1.5)
    expect(parseIngredientLine('½ onion')).toEqual({ amount: 0.5, unit: null, name: 'onion' })
    expect(parseIngredientLine('2,5 ml vanilla')?.amount).toBe(2.5)
  })

  it('keeps counted things and lines with no amount as they are', () => {
    expect(parseIngredientLine('3 eggs')).toEqual({ amount: 3, unit: null, name: 'eggs' })
    expect(parseIngredientLine('salt and pepper')).toEqual({
      amount: null,
      unit: null,
      name: 'salt and pepper',
    })
    // A unit word with nothing after it is the food itself.
    expect(parseIngredientLine('2 cloves')).toEqual({ amount: 2, unit: null, name: 'cloves' })
    expect(parseIngredientLine('   ')).toBeNull()
  })

  it('reads a whole text box, skipping blank lines', () => {
    expect(parseIngredientLines('2 eggs\n\n1 bagel\n')).toHaveLength(2)
  })
})

describe('parseStepLines', () => {
  it('drops numbering and bullets and blank lines', () => {
    expect(parseStepLines('1. Cook the rice.\n\n2) Fry the mince\n- Serve')).toEqual([
      'Cook the rice.',
      'Fry the mince',
      'Serve',
    ])
  })
})

describe('formatAmount', () => {
  it('rounds grams and ml to 5 once they are big enough', () => {
    expect(formatAmount(233, 'g')).toBe('235')
    expect(formatAmount(12.4, 'ml')).toBe('12')
  })

  it('shows small amounts as halves, thirds and quarters', () => {
    expect(formatAmount(1.5)).toBe('1½')
    expect(formatAmount(0.25, 'cup')).toBe('¼')
    expect(formatAmount(2 / 3)).toBe('⅔')
    expect(formatAmount(3)).toBe('3')
    expect(formatAmount(2.96)).toBe('3')
    expect(formatAmount(12.4)).toBe('12.4')
  })
})

describe('ingredientLabel', () => {
  it('scales the amount and pluralises counted units', () => {
    const rice = { amount: 1, unit: 'cup', name: 'jasmine rice' }
    expect(ingredientLabel(rice)).toBe('1 cup jasmine rice')
    expect(ingredientLabel(rice, 2)).toBe('2 cups jasmine rice')
    expect(ingredientLabel({ amount: 3, unit: null, name: 'eggs' }, 0.5)).toBe('1½ eggs')
    expect(ingredientLabel({ amount: null, unit: null, name: 'salt' }, 3)).toBe('salt')
  })

  it('turns back into the line the coach typed', () => {
    const line = '1½ cup jasmine rice'
    expect(ingredientLine(parseIngredientLine(line)!)).toBe(line)
  })
})

describe('numbers on a recipe', () => {
  it('works out the share of calories from protein', () => {
    expect(proteinShare(400, 40)).toBe(40)
    expect(proteinShare(0, 10)).toBeNull()
    expect(proteinShare(100, 40)).toBe(100)
  })

  it('adds up a portion', () => {
    expect(recipePortion({ kcal: 450, proteinG: 42, carbsG: 40, fatG: null }, 1.5)).toEqual({
      kcal: 675,
      proteinG: 63,
      carbsG: 60,
      fatG: null,
    })
  })

  it('labels minutes', () => {
    expect(minutesLabel(25)).toBe('25 min')
    expect(minutesLabel(60)).toBe('1 h')
    expect(minutesLabel(70)).toBe('1 h 10 min')
  })
})

describe('matchesRecipe', () => {
  const recipe = {
    title: 'Chicken burrito bowl',
    summary: null,
    ingredients: [{ amount: 1, unit: 'cup', name: 'jasmine rice' }],
  }
  it('finds by name and by ingredient', () => {
    expect(matchesRecipe(recipe, 'chicken rice')).toBe(true)
    expect(matchesRecipe(recipe, 'bowls')).toBe(true)
    expect(matchesRecipe(recipe, 'tuna')).toBe(false)
    expect(matchesRecipe(recipe, '  ')).toBe(true)
  })
})

describe('recipeInput', () => {
  const valid = {
    title: 'Egg bagel',
    meal: 'breakfast',
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 5,
    kcal: 420,
    proteinG: 32,
    carbsG: null,
    fatG: null,
    ingredients: [{ amount: 2, unit: null, name: 'eggs' }],
    steps: ['Toast the bagel.'],
    sourceUrl: '',
  }
  it('accepts a recipe and empties blank optional text', () => {
    const parsed = recipeInput.parse({ ...valid, summary: '  ' })
    expect(parsed.summary).toBeNull()
    expect(parsed.sourceUrl).toBeNull()
  })
  it('needs ingredients, steps and a safe link', () => {
    expect(recipeInput.safeParse({ ...valid, ingredients: [] }).success).toBe(false)
    expect(recipeInput.safeParse({ ...valid, steps: [] }).success).toBe(false)
    expect(recipeInput.safeParse({ ...valid, sourceUrl: 'http://x.com' }).success).toBe(false)
  })
})

describe('recipePhoto', () => {
  it('builds the URL for bundled photos and uploads, and nothing for none', () => {
    expect(recipePhoto('recipe-images/tuna-bagel.webp')).toBe('/recipe-images/tuna-bagel.webp')
    expect(recipePhoto('recipe-images/tuna-bagel.webp', 'https://project180.co.za/')).toBe(
      'https://project180.co.za/recipe-images/tuna-bagel.webp',
    )
    expect(recipePhoto('uploads/recipes/3/abc:1')).toBe('/api/media/uploads/recipes/3/abc/0')
    expect(recipePhoto('https://images.unsplash.com/photo-1518310532637-f5225f94f3c3')).toBe(
      'https://images.unsplash.com/photo-1518310532637-f5225f94f3c3?w=1200&q=75&auto=format&fit=crop',
    )
    expect(recipePhoto('none')).toBeNull()
    expect(recipePhoto(null)).toBeNull()
  })
})
