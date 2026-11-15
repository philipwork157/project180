import { expect, test } from '@playwright/test'

test('adding food by hand shows it under its meal and in the day’s totals', async ({ page }) => {
  await page.goto('/fuel')
  await expect(page.getByRole('heading', { level: 1, name: 'Fuel' })).toBeVisible()

  const lunch = page.getByRole('region', { name: 'Lunch' })
  await lunch.getByRole('button', { name: 'Add to Lunch' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add food' })
  await expect(sheet.getByRole('radio', { name: 'Lunch' })).toBeChecked()
  await sheet.getByRole('button', { name: 'Type it in' }).click()

  await sheet.getByLabel('Food').fill('Chicken wrap')
  await sheet.getByLabel('Calories (kcal)').fill('450')
  await sheet.getByLabel('Protein (g)').fill('32')
  await sheet.getByRole('button', { name: 'Save food' }).click()

  await expect(sheet).toBeHidden()
  await expect(lunch.getByText('Chicken wrap')).toBeVisible()
  const totals = page.getByRole('region', { name: 'Totals' })
  await expect(totals.getByText(/^450\s*kcal$/)).toBeVisible()
  await expect(totals.getByText(/Protein\s*32 g/)).toBeVisible()

  await page.reload()
  await expect(lunch.getByText('Chicken wrap')).toBeVisible()
})
