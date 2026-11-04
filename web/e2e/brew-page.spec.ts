import { expect, test } from '@playwright/test'

const op = (table: string, id: string, patch: Record<string, unknown>) => ({
  op_id: `${table}-${id}-${Math.random()}`,
  table,
  id,
  kind: 'upsert',
  patch,
})
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

test('brew page: recipe, laps and ratings; rate a dismissed cup; linked from Home, bag, rating and Tastings', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-pg-a', { name: 'Pat', color: '#e39aa8' }),
        op('user', 'u-pg-b', { name: 'Quin', color: '#8fc2a0' }),
        op('grinder', 'g-pg', { name: 'Comandante' }),
        op('coffee', 'c-pg', { name: 'Page Test' }),
        op('bag', 'b-pg', { coffee_id: 'c-pg', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
        op('recipe', 'rec-pg', {
          root_id: 'rec-pg', version: 1, name: 'Two pours', method: 'pour_over', brewer_id: 'seed:kadou', dose_g: 15, water_g: 250, temp_c: 94,
          steps: [{ label: 'Bloom', at_s: 0, to_g: 50 }, { label: 'Pour', at_s: 40, to_g: 250 }],
        }),
        op('brew', 'br-pg', {
          bag_id: 'b-pg', brewer_user_id: 'u-pg-b', method: 'pour_over', brewer_id: 'seed:kadou', grinder_id: 'g-pg', grind_setting: '24',
          dose_g: 15, water_g: 250, temp_c: 94, time_s: 170, laps: [40, 95.5], recipe_id: 'rec-pg', recipe_version: 1,
          steps: [{ label: 'Bloom', at_s: 0, to_g: 50 }, { label: 'Pour', at_s: 40, to_g: 250 }], started_from: 'recipe', brewed_at: ago(20),
        }),
        op('tasting', 't-pg', { brew_id: 'br-pg', taster_id: 'u-pg-b', rated_at: ago(15), minutes_after_brew: 5, temp_band: 'hot', temp_band_suggested: 'hot', overall: 4 }),
      ],
    },
  })

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-pg-a'))
  const page = await phone.newPage()
  await page.goto('/')

  // Dismiss the cup from Home: it can still be rated from its brew page
  const card = page.getByRole('article', { name: 'Cup: Page Test' })
  await card.getByRole('button', { name: /^Dismiss Page Test/ }).click()
  await expect(card).toHaveCount(0)
  await page.locator('.brew').filter({ hasText: 'Page Test' }).click() // Recent
  await expect(page).toHaveURL(/\/brews\/br-pg$/)

  // What it was made with, and the laps clicked
  const recipe = page.getByRole('region', { name: 'Recipe' })
  await expect(recipe).toContainText('Two pours')
  await expect(recipe).toContainText('Kadou')
  await expect(recipe).toContainText('Comandante · 24')
  await expect(recipe).toContainText('1:16.7')
  await expect(recipe).toContainText('Bloom · 0:00 · → 50 g')
  const laps = page.getByRole('region', { name: 'Laps' })
  await expect(laps.getByRole('row')).toHaveCount(4) // header, two laps, Done
  await expect(laps.getByRole('row', { name: /Lap 2/ })).toContainText('1:35')
  await expect(laps.getByRole('row', { name: /Done/ })).toContainText('2:50')

  // Every rating of the cup; one tap rates it
  const ratings = page.getByRole('region', { name: 'Ratings' })
  await expect(ratings.getByRole('link')).toHaveCount(1)
  await expect(ratings).toContainText('Quin')
  await page.getByRole('region', { name: 'Rate this cup' }).getByRole('radio', { name: /^5/ }).click()
  await expect(ratings.getByRole('link')).toHaveCount(2)
  await expect(ratings.getByRole('link', { name: /Pat's rating/ })).toContainText('Memorable')

  // Brew → rating → back to the brew
  await ratings.getByRole('link', { name: /Pat's rating/ }).click()
  await expect(page).toHaveURL(/\/rate\/br-pg\/u-pg-a\/.+/)
  await page.getByRole('link', { name: /^Page Test ›/ }).click()
  await expect(page).toHaveURL(/\/brews\/br-pg$/)

  // Bag → brew
  await page.getByRole('link', { name: 'Page Test ›' }).click()
  await expect(page).toHaveURL(/\/bag\/b-pg$/)
  await page.getByRole('region', { name: 'Brews and ratings' }).getByRole('link', { name: /Kadou ›/ }).click()
  await expect(page).toHaveURL(/\/brews\/br-pg$/)

  // Tastings → brew
  await page.getByRole('link', { name: 'Tastings', exact: true }).click()
  await page.getByRole('link', { name: /^Brew: Kadou/ }).first().click()
  await expect(page).toHaveURL(/\/brews\/br-pg$/)
  await phone.close()
})
