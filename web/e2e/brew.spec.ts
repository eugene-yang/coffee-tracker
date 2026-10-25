import { expect, test } from '@playwright/test'

const op = (table: string, id: string, patch: Record<string, unknown>) => ({
  op_id: `${table}-${id}-${Math.random()}`,
  table,
  id,
  kind: 'upsert',
  patch,
})

test('station brew: setup, timer, save, grams left, save as recipe, brew again; phone sees it', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-bruno', { name: 'Bruno', color: '#86b3d9' }),
        op('user', 'u-dana', { name: 'Dana', color: '#e6c36a' }),
        op('roaster', 'r-brew', { name: 'Test Roasters' }),
        op('coffee', 'c-brew', { roaster_id: 'r-brew', name: 'Brew Test Kii', origin: 'Kenya', process: 'Washed' }),
        op('bag', 'b-brew', { coffee_id: 'c-brew', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
      ],
    },
  })

  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  await station.addInitScript(() => localStorage.setItem('coffee.userId', 'u-bruno'))
  const tablet = await station.newPage()
  await tablet.goto('/')
  await tablet.getByRole('button', { name: /Brew Test Kii/ }).click()
  const panel = tablet.getByRole('complementary', { name: 'Bag details' })
  await panel.getByRole('button', { name: 'Brew', exact: true }).click()
  await expect(tablet).toHaveURL(/\/brew\/b-brew$/)

  // Setup: only the household's own brewers (no generic method list), params summary, steppers
  const kit = tablet.getByRole('radiogroup', { name: 'Brewer' })
  await expect(kit.getByRole('radio', { name: /AeroPress/ })).toBeVisible()
  await expect(tablet.getByRole('radio', { name: 'Pour-over' })).toHaveCount(0)
  await kit.getByRole('radio', { name: /Kadou/ }).click()
  await tablet.getByRole('button', { name: /15 g · 250 g · 94°/ }).click()
  await tablet.getByRole('button', { name: 'Dose plus' }).click()
  await expect(tablet.getByRole('button', { name: /15\.5 g · 250 g/ })).toBeVisible()

  // Timer, then save — no "who's drinking" step: anyone can rate the cup afterwards
  await tablet.getByRole('button', { name: 'Start' }).click()
  await expect(tablet.getByText(/^0:0\d$/)).toBeVisible()
  await tablet.waitForTimeout(1200)
  await tablet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(tablet.getByRole('group', { name: "Who's drinking" })).toHaveCount(0)
  await tablet.getByRole('button', { name: 'Save brew' }).click()

  // Saved → save as recipe (name prefilled)
  await expect(tablet.getByRole('heading', { name: 'Saved' })).toBeVisible()
  await tablet.getByRole('button', { name: 'Save as recipe' }).click()
  await expect(tablet.getByPlaceholder('e.g. Daily V60')).toHaveValue('Brew Test Kii · Kadou')
  await tablet.getByRole('button', { name: 'Save recipe' }).click()
  await expect(tablet.getByRole('status')).toContainText('Recipe saved')
  await tablet.getByRole('button', { name: 'Back to inventory' }).click()

  // Inventory: grams left went down by the dose; Brew again shortcut + panel button
  await tablet.getByRole('button', { name: /Test Roasters.*Brew Test Kii/ }).click()
  await expect(panel).toContainText('235 g left')
  await expect(panel.getByRole('button', { name: /Brew again/ })).toContainText('Kadou · 15.5 g · 250 g · 94°')
  await tablet.getByRole('button', { name: 'Brew again: Brew Test Kii' }).click()
  await expect(tablet.getByRole('button', { name: '↻ Brew again' })).toBeVisible()
  await expect(tablet.getByRole('button', { name: /15\.5 g · 250 g · 94°/ })).toBeVisible()
  await expect(tablet.getByRole('radio', { name: /Kadou/ })).toHaveAttribute('aria-checked', 'true')

  // Logging without the timer
  await tablet.getByRole('button', { name: 'Log without timer' }).click()
  await tablet.getByRole('button', { name: 'Save brew' }).click()
  await expect(tablet.getByRole('heading', { name: 'Saved' })).toBeVisible()
  await expect(tablet.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })

  // The recipe exists in Settings → Equipment with the brew's parameters
  await tablet.goto('/settings/equipment')
  await expect(tablet.getByRole('button', { name: /Brew Test Kii · Kadou/ })).toContainText('15.5 g · 250 g · 94°')

  // Phone (Dana): both of Bruno's cups are hers to rate too; both brews in Recent; no Brew again
  // shortcut since Dana brewed nothing; no Brew tab
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-dana'))
  const page = await phone.newPage()
  await page.goto('/')
  await expect(page.getByRole('article', { name: 'Cup: Brew Test Kii' })).toHaveCount(2)
  await expect(page.locator('.brew').filter({ hasText: 'Brew Test Kii' })).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'Brew again' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Brew', exact: true })).toHaveCount(0)
  await page.goto('/brew')
  await expect(page).toHaveURL(/\/$/)

  await station.close()
  await phone.close()
})

test('phone: recipe steps drive the timer cues, and the timer survives a reload', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-pia', { name: 'Pia', color: '#b9a3e3' }),
        op('coffee', 'c-steps', { name: 'Steps Test', origin: 'Ethiopia' }),
        op('bag', 'b-steps', { coffee_id: 'c-steps', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
        op('recipe', 'rec-steps', {
          root_id: 'rec-steps', version: 1, name: 'Quick steps', method: 'pour_over', dose_g: 15, water_g: 250, temp_c: 94,
          steps: [{ label: 'Bloom', at_s: 0, to_g: 50 }, { label: 'Pour', at_s: 2, to_g: 150 }, { label: 'Finish', at_s: 60, to_g: 250 }],
        }),
      ],
    },
  })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-pia'))
  const page = await phone.newPage()
  await page.goto('/bag/b-steps')
  await page.getByRole('button', { name: 'Brew', exact: true }).click()
  await expect(page).toHaveURL(/\/brew\/b-steps$/)
  await page.getByRole('button', { name: 'Recipe…' }).click()
  await page.getByRole('button', { name: 'Quick steps' }).click()
  await expect(page.getByText('Bloom · 0:00 · → 50 g')).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('Bloom → 50 g')).toBeVisible()
  await expect(page.getByText('Next: Pour → 150 g')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Pour → 150 g', { exact: true })).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('Next: Finish → 250 g')).toBeVisible()
  await expect(page.getByRole('link', { name: /Brew in progress/ })).toHaveCount(0) // not on its own screen
  await page.getByRole('link', { name: 'Inventory', exact: true }).click()
  // Away from the brew screen, the running timer is one tap away
  await page.getByRole('link', { name: /Brew in progress · Steps Test/ }).click()
  await expect(page).toHaveURL(/\/brew\/b-steps$/)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Save brew' }).click()
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()

  // Recipes belong to one of the household's own brewers: an older one saved with only a method asks for one
  await page.goto('/settings/equipment')
  await page.getByRole('button', { name: /Quick steps/ }).click()
  await expect(page.getByText(/isn't tied to a brewer yet/)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pour-over' })).toHaveCount(0) // no generic method list
  const save = page.getByRole('button', { name: 'Save new version' })
  await expect(save).toBeDisabled()
  await page.getByRole('radiogroup', { name: 'Brewer' }).getByRole('radio', { name: /Kadou/ }).click()
  await save.click()
  await expect(page.getByRole('button', { name: /Quick steps/ })).toContainText('Kadou · 15 g · 250 g')
  // A new recipe starts on the brewer this person used last
  await page.getByRole('button', { name: '+ New recipe' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Brewer' }).locator('[aria-checked="true"]')).toHaveCount(1)
  await phone.close()
})

test('phone: no brewing or rating until the device has a person', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('coffee', 'c-nobody', { name: 'Nobody Test' }),
        op('bag', 'b-nobody', { coffee_id: 'c-nobody', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
        op('brew', 'br-nobody', { bag_id: 'b-nobody', brewer_user_id: 'u-bruno', method: 'pour_over', brewed_at: new Date().toISOString() }),
      ],
    },
  })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await phone.newPage()
  await page.goto('/brew/b-nobody')
  await expect(page.getByText(/Add yourself in Settings first/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Log without timer' })).toBeDisabled()
  await page.goto('/rate/br-nobody/u-bruno')
  await expect(page.getByText("Who's tasting?")).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Overall' })).toHaveCount(0)
  await phone.close()
})
