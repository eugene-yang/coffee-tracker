import { expect, test, type APIRequestContext } from '@playwright/test'

const op = (table: string, id: string, patch: Record<string, unknown>) => ({
  op_id: `${table}-${id}-${Math.random()}`,
  table,
  id,
  kind: 'upsert',
  patch,
})

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

type TastingRow = Record<string, unknown> & { overall: number; temp_band: string; deleted_at: string | null; minutes_after_brew: number }

async function serverTastings(request: APIRequestContext, brewId: string, userId: string): Promise<TastingRow[]> {
  const rows: { table: string; row: Record<string, unknown> }[] = []
  for (let since = 0, more = true; more; ) {
    const data = await (await request.get(`/api/sync/pull?since=${since}&limit=2000`)).json()
    rows.push(...data.rows)
    since = data.next
    more = data.has_more
  }
  return rows.filter((r) => r.table === 'tasting' && r.row.brew_id === brewId && r.row.taster_id === userId).map((r) => r.row as TastingRow)
}

test('rating: anyone rates any cup, every tap a new rating, explicit edit, no compass; Tastings tab; station strip and sheet', async ({ browser, request }) => {
  const bag = (key: string, name: string, extra: Record<string, unknown> = {}) => [
    op('coffee', `c-${key}`, { name, origin: 'Kenya', process: 'Washed', ...extra }),
    op('bag', `b-${key}`, { coffee_id: `c-${key}`, roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
  ]
  // Bo brews; nobody is marked as drinking — anyone can rate
  const brew = (key: string, minAgo: number) =>
    op('brew', `br-${key}`, { bag_id: `b-${key}`, brewer_user_id: 'u-bo', method: 'pour_over', dose_g: 15, water_g: 250, brewed_at: ago(minAgo), started_from: 'freestyle' })
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-ana', { name: 'Ana', color: '#e39aa8' }),
        op('user', 'u-bo', { name: 'Bo', color: '#8fc2a0' }),
        ...bag('warm', 'Warm Kii', { tasting_notes: ['blueberry', 'cocoa nib'], flavor_tags: ['blueberry', 'cocoa'] }),
        ...bag('again', 'Again Gesha'),
        brew('warm', 14),
        brew('again', 16),
        op('tasting', 't-again', { brew_id: 'br-again', taster_id: 'u-ana', rated_at: ago(12), minutes_after_brew: 4, temp_band: 'hot', temp_band_suggested: 'hot', overall: 3 }),
      ],
    },
  })

  // ---- Phone (Ana): every recent cup is on Home, whoever brewed it
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-ana'))
  const page = await phone.newPage()
  await page.goto('/')
  const warm = page.getByRole('article', { name: 'Cup: Warm Kii' })
  await expect(warm.getByRole('button', { name: 'Warm · 14 min' })).toBeVisible()
  await expect(warm).toContainText('brewed by Bo')
  const again = page.getByRole('article', { name: 'Cup: Again Gesha' })
  await expect(again).toContainText('Good · Hot')

  // The chip is a suggestion: cycle it by feel, then one tap on a star rates (no navigation)
  await warm.getByRole('button', { name: 'Warm · 14 min' }).click()
  await expect(warm.getByRole('button', { name: 'Cool · 14 min' })).toBeVisible()
  await warm.getByRole('radio', { name: '4 stars: Great' }).click()
  await expect(page.getByRole('status')).toContainText('★★★★ Great')
  await expect(warm).toContainText('Great · Cool')
  await expect(page).toHaveURL(/\/$/)

  // No waiting for the next temperature: Rate again right away is a second rating, kept apart
  await warm.getByRole('button', { name: 'Rate again' }).click()
  await warm.getByRole('radio', { name: '5 stars: Memorable' }).click()
  await expect(warm).toContainText('Memorable · Warm')
  await expect(warm).toContainText('2 ratings')

  // Edit is explicit: profile, flavors (roaster notes as confirm chips), note — and no compass
  await warm.getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/rate\/br-warm\/u-ana\/.+/)
  await expect(page.getByText(/^Editing the rating from/)).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Overall' }).getByRole('radio', { name: '5 stars: Memorable' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radiogroup', { name: 'Sour ↔ Bitter' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Compass' })).toHaveCount(0)
  await page.getByRole('group', { name: 'Roaster says' }).getByRole('button', { name: 'Blueberry' }).click()
  await page.getByRole('button', { name: 'Floral' }).click()
  await page.getByRole('group', { name: 'Floral' }).getByRole('button', { name: 'Jasmine' }).click()
  await expect(page.getByRole('button', { name: 'Floral · 1' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Note' }).fill('Juicy, like jam')
  await page.getByRole('radiogroup', { name: 'Acidity' }).getByRole('radio', { name: 'High' }).click()
  await page.getByRole('radiogroup', { name: 'Body' }).getByRole('radio', { name: '2 of 5' }).click()
  await page.getByRole('radiogroup', { name: 'Cleanness' }).getByRole('radio', { name: 'Clean' }).click()
  await expect(page.getByRole('region', { name: 'Ratings of this cup' }).locator('.rating')).toHaveCount(2)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/$/)

  await expect(page.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await serverTastings(request, 'br-warm', 'u-ana')).map((t) => `${t.temp_band}:${t.overall}`).sort(), { timeout: 10_000 })
    .toEqual(['cool:4', 'warm:5'])
  const edited = (await serverTastings(request, 'br-warm', 'u-ana')).find((t) => t.overall === 5)!
  expect(edited).toMatchObject({
    temp_band_suggested: 'warm',
    acidity: 5,
    body: 2,
    cleanness: 5,
    note: 'Juicy, like jam',
    tags: [
      { tag: 'blueberry', source: 'roaster' },
      { tag: 'jasmine', source: 'tasted' },
    ],
    schema_version: 1,
  })
  expect(edited.minutes_after_brew).toBeGreaterThanOrEqual(14)

  // Rating a cup again at any time adds to the earlier rating
  await again.getByRole('button', { name: 'Rate again' }).click()
  await again.getByRole('radio', { name: '4 stars: Great' }).click()
  await expect(page.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await serverTastings(request, 'br-again', 'u-ana')).map((r) => `${r.temp_band}:${r.overall}`).sort(), { timeout: 10_000 })
    .toEqual(['hot:3', 'warm:4'])

  // Tastings tab: mine by default; a rating opens to edit, the bag name opens the bag and its history
  await page.getByRole('link', { name: 'Tastings', exact: true }).click()
  await expect(page.getByLabel('Rated by')).toHaveValue('mine')
  await expect(page.locator('.entry')).toHaveCount(4)
  // One row of dropdowns: who rated, who brewed, brewer, grinder; temperature as an icon only
  await expect(page.locator('.entry').first().getByRole('img', { name: /^(Hot|Warm|Cool)$/ })).toBeVisible()
  await page.getByLabel('Brewed by').selectOption({ label: 'Brewed: Bo' })
  await expect(page.locator('.entry')).toHaveCount(4)
  await page.getByLabel('Brewed by').selectOption({ label: 'Brewed: Me' })
  await expect(page.getByText('No ratings match these filters.')).toBeVisible()
  await expect(page.getByText('0 ratings')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByLabel('Brewed by')).toHaveValue('any')
  await expect(page.locator('.entry')).toHaveCount(4)
  await page.locator('.entry').filter({ hasText: 'Warm Kii' }).first().getByRole('link', { name: 'Warm Kii', exact: true }).click()
  await expect(page).toHaveURL(/\/bag\/b-warm$/)
  const history = page.getByRole('region', { name: 'Brews and ratings' })
  await expect(history.locator('.brew')).toHaveCount(1)
  await expect(history.locator('.rating')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Brew again/ })).toContainText('Pour-over · 15 g · 250 g')
  await phone.close()

  // ---- Station (Bo): one card per cup with everyone's avatars; the sheet rates as that person, with undo
  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  await station.addInitScript(() => localStorage.setItem('coffee.userId', 'u-bo'))
  const tablet = await station.newPage()
  await tablet.goto('/')
  const strip = tablet.getByRole('region', { name: 'Pending tastings' })
  const cup = strip.getByRole('group', { name: 'Cup: Warm Kii' })
  await expect(cup.getByRole('button', { name: 'Rate Warm Kii as Ana' })).toContainText('★5')
  await cup.getByRole('button', { name: 'Rate Warm Kii as Bo' }).click()
  const sheet = tablet.getByRole('dialog', { name: "Bo's rating" })
  await expect(sheet.getByText('Bo', { exact: true })).toBeVisible()
  await sheet.getByRole('radio', { name: '3 stars: Good' }).click()
  await expect(tablet.getByRole('status')).toContainText('Bo · ★★★ Good')
  await tablet.getByRole('button', { name: 'Undo' }).click()
  await expect(cup.getByRole('button', { name: 'Rate Warm Kii as Bo' })).toContainText('Rate')
  await cup.getByRole('button', { name: 'Rate Warm Kii as Bo' }).click()
  await tablet.getByRole('dialog', { name: "Bo's rating" }).getByRole('radio', { name: '5 stars: Memorable' }).click()
  await expect(tablet.getByRole('status')).toContainText('Bo · ★★★★★ Memorable')
  await expect(tablet.getByRole('dialog', { name: "Bo's rating" })).toBeHidden({ timeout: 3000 })
  await expect(cup.getByRole('button', { name: 'Rate Warm Kii as Bo' })).toContainText('★5')

  await expect(tablet.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await serverTastings(request, 'br-warm', 'u-bo')).map((r) => `${r.overall}:${r.deleted_at ? 'deleted' : 'live'}`).sort(), { timeout: 10_000 })
    .toEqual(['3:deleted', '5:live'])
  await station.close()
})
