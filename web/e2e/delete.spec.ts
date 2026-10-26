import { expect, test, type APIRequestContext } from '@playwright/test'

const op = (table: string, id: string, patch: Record<string, unknown>) => ({
  op_id: `${table}-${id}-${Math.random()}`,
  table,
  id,
  kind: 'upsert',
  patch,
})
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

async function serverRow(request: APIRequestContext, table: string, id: string) {
  const rows: { table: string; row: Record<string, unknown> }[] = []
  for (let since = 0, more = true; more; ) {
    const data = await (await request.get(`/api/sync/pull?since=${since}&limit=2000`)).json()
    rows.push(...data.rows)
    since = data.next
    more = data.has_more
  }
  return rows.find((r) => r.table === table && r.row.id === id)?.row
}

test('delete a rating, a brew and a bag with confirmation; everything that belongs to them goes too', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-del', { name: 'Dee', color: '#86b3d9' }),
        op('coffee', 'c-del', { name: 'Delete Test' }),
        op('bag', 'b-del', { coffee_id: 'c-del', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
        op('brew', 'br-del1', { bag_id: 'b-del', brewer_user_id: 'u-del', method: 'pour_over', dose_g: 15, water_g: 250, brewed_at: ago(60) }),
        op('brew', 'br-del2', { bag_id: 'b-del', brewer_user_id: 'u-del', method: 'pour_over', dose_g: 16, water_g: 250, brewed_at: ago(30) }),
        op('tasting', 't-del1', { brew_id: 'br-del1', taster_id: 'u-del', rated_at: ago(55), temp_band: 'hot', overall: 4 }),
        op('tasting', 't-del2', { brew_id: 'br-del1', taster_id: 'u-del', rated_at: ago(40), temp_band: 'warm', overall: 5 }),
        op('tasting', 't-del3', { brew_id: 'br-del2', taster_id: 'u-del', rated_at: ago(25), temp_band: 'hot', overall: 3 }),
      ],
    },
  })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-del'))
  const page = await phone.newPage()
  await page.goto('/bag/b-del')
  await expect(page.getByText('~13 cups · 219 g left')).toBeVisible()
  const history = page.getByRole('region', { name: 'Brews and ratings' })
  await expect(history.locator('.brew')).toHaveCount(2)

  // A rating: confirm, then it's gone (deleted for real once the undo toast closes)
  await history.locator('.rating').filter({ hasText: 'Good' }).click()
  await page.getByRole('button', { name: 'Delete this rating' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Dee’s ★★★ rating')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('status')).toContainText('Rating deleted')

  await expect(page).toHaveURL(/\/bag\/b-del$/)
  await expect(history.locator('.rating').filter({ hasText: 'Good' })).toHaveCount(0)

  // A brew: the confirmation names its ratings and the grams that go back; Undo brings it all back
  const older = history.locator('.brew').nth(1)
  await older.getByRole('button', { name: /^Delete brew/ }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('This also deletes its 2 ratings. Its 15 g goes back to the bag.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(history.locator('.brew')).toHaveCount(2)
  await older.getByRole('button', { name: /^Delete brew/ }).click()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(history.locator('.brew')).toHaveCount(1)
  await expect(page.getByText('~14 cups · 234 g left')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(history.locator('.brew')).toHaveCount(2)
  await older.getByRole('button', { name: /^Delete brew/ }).click()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(history.locator('.brew')).toHaveCount(1)

  // Leaving the app right away still carries the delete out
  await page.reload()
  await expect(history.locator('.brew')).toHaveCount(1)
  await expect
    .poll(async () => [(await serverRow(request, 'brew', 'br-del1'))?.deleted_at != null, (await serverRow(request, 'tasting', 't-del2'))?.deleted_at != null, (await serverRow(request, 'tasting', 't-del3'))?.deleted_at != null], { timeout: 20_000 })
    .toEqual([true, true, true])

  // The bag: everything left with it
  await page.getByRole('button', { name: 'Delete bag' }).click()
  await expect(dialog).toContainText('Delete Delete Test?')
  await expect(dialog).toContainText('This also deletes its 1 brew.')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/inventory$/)
  await expect(page.getByRole('button', { name: /Delete Test/ })).toHaveCount(0)
  await expect
    .poll(async () => [(await serverRow(request, 'bag', 'b-del'))?.deleted_at != null, (await serverRow(request, 'brew', 'br-del2'))?.deleted_at != null], { timeout: 20_000 })
    .toEqual([true, true])
  await phone.close()
})

test('equipment is hidden, not deleted: off the brew screen, back with Unhide', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-hide', { name: 'Hal', color: '#8fc2a0' }),
        op('coffee', 'c-hide', { name: 'Hide Test' }),
        op('bag', 'b-hide', { coffee_id: 'c-hide', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
      ],
    },
  })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-hide'))
  const page = await phone.newPage()
  await page.goto('/settings/equipment')
  await page.getByRole('button', { name: /^Siphon/ }).click()
  await page.getByRole('button', { name: 'Hide' }).click()
  const hidden = page.getByRole('region', { name: 'Hidden equipment' })
  await expect(hidden).toContainText('Siphon')
  await page.goto('/brew/b-hide')
  await expect(page.getByRole('radiogroup', { name: 'Brewer' }).getByRole('radio', { name: /Kadou/ })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Brewer' }).getByRole('radio', { name: /Siphon/ })).toHaveCount(0)
  await page.goto('/settings/equipment')
  await hidden.getByRole('button', { name: 'Unhide' }).click()
  await expect(page.getByRole('region', { name: 'Hidden equipment' })).toHaveCount(0)
  await expect.poll(async () => (await serverRow(request, 'brewer', 'seed:siphon'))?.hidden_at ?? null, { timeout: 20_000 }).toBeNull()
  await phone.close()
})

test('tab bar: at the bottom of the page in a browser tab, with no strip allowance', async ({ browser }) => {
  // The iOS Home Screen strip (100lvh − 100dvh, installed app only) can't be emulated in Chromium;
  // here it must resolve to 0 so a browser tab keeps the standard layout.
  const ctx = await browser.newContext({ viewport: { width: 393, height: 793 } })
  const page = await ctx.newPage()
  await page.goto('/inventory')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  const m = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Sections"]')!.getBoundingClientRect()
    const dock = document.querySelector('.dock')!.getBoundingClientRect()
    return { bottom: nav.bottom, top: nav.top, dockBottom: dock.bottom, inner: innerHeight, gap: getComputedStyle(document.documentElement).getPropertyValue('--viewport-gap').trim() }
  })
  expect(m.bottom).toBe(m.inner)
  expect(m.dockBottom).toBe(m.top)
  expect(m.gap).toBe('0px')
  await ctx.close()
})
