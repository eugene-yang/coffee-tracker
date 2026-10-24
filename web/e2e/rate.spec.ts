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

test('rating: inline stars, temperature chip, more detail, edit window, re-rate as it cools; station strip and sheet', async ({ browser, request }) => {
  const bag = (key: string, name: string, extra: Record<string, unknown> = {}) => [
    op('coffee', `c-${key}`, { name, origin: 'Kenya', process: 'Washed', ...extra }),
    op('bag', `b-${key}`, { coffee_id: `c-${key}`, roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
  ]
  const brew = (key: string, minAgo: number, drinkers: string[]) => [
    op('brew', `br-${key}`, { bag_id: `b-${key}`, brewer_user_id: 'u-bo', method: 'pour_over', dose_g: 15, water_g: 250, brewed_at: ago(minAgo), started_from: 'freestyle' }),
    ...drinkers.map((u) => op('brew_taster', `br-${key}:${u}`, { brew_id: `br-${key}`, user_id: u })),
  ]
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-ana', { name: 'Ana', color: '#e39aa8' }),
        op('user', 'u-bo', { name: 'Bo', color: '#8fc2a0' }),
        ...bag('warm', 'Warm Kii', { tasting_notes: ['blueberry', 'cocoa nib'], flavor_tags: ['blueberry', 'cocoa'] }),
        ...bag('again', 'Again Gesha'),
        ...bag('wait', 'Wait Sidra'),
        ...brew('warm', 14, ['u-ana', 'u-bo']),
        ...brew('again', 16, ['u-ana']),
        ...brew('wait', 7, ['u-ana']),
        // Rated hot a while ago: one is now warm (comes back), one is still hot (muted)
        op('tasting', 't-again', { brew_id: 'br-again', taster_id: 'u-ana', rated_at: ago(12), minutes_after_brew: 4, temp_band: 'hot', temp_band_suggested: 'hot', overall: 3 }),
        op('tasting', 't-wait', { brew_id: 'br-wait', taster_id: 'u-ana', rated_at: ago(6), minutes_after_brew: 1, temp_band: 'hot', temp_band_suggested: 'hot', overall: 4 }),
      ],
    },
  })

  // ---- Phone (Ana): pending cards on Home
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-ana'))
  const page = await phone.newPage()
  await page.goto('/')
  const warm = page.getByRole('article', { name: 'Cup: Warm Kii' })
  await expect(warm.getByRole('button', { name: 'Warm · 14 min' })).toBeVisible()
  await expect(warm).toContainText('brewed by Bo')
  await expect(page.getByRole('article', { name: 'Cup: Again Gesha' }).getByRole('button', { name: 'Warm now · 16 min' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Cup: Wait Sidra' })).toContainText('Rate again when Warm')

  // Chip cycles by feel, then one tap on a star rates (no navigation)
  await warm.getByRole('button', { name: 'Warm · 14 min' }).click()
  await expect(warm.getByRole('button', { name: 'Cool · 14 min' })).toBeVisible()
  await warm.getByRole('radio', { name: '4 stars: Great' }).click()
  await expect(warm.getByRole('radio', { name: '4 stars: Great' })).toHaveAttribute('aria-checked', 'true')
  await expect(warm).toContainText('Great')
  await expect(page).toHaveURL(/\/$/)

  // More detail: compass → flavors (roaster notes as confirm chips) → note → profile → quality
  await warm.getByRole('link', { name: 'More detail ›' }).click()
  await expect(page).toHaveURL(/\/rate\/br-warm\/u-ana\/.+/)
  await expect(page.getByRole('radiogroup', { name: 'Overall' }).getByRole('radio', { name: '4 stars: Great' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radiogroup', { name: 'Sour ↔ Bitter' }).getByRole('radio', { name: 'Sour' }).click()
  await expect(page.getByText(/^Sour: grind finer/)).toBeVisible()
  await page.getByRole('group', { name: 'Roaster says' }).getByRole('button', { name: 'Blueberry' }).click()
  await page.getByRole('button', { name: 'Floral' }).click()
  await page.getByRole('group', { name: 'Floral' }).getByRole('button', { name: 'Jasmine' }).click()
  await expect(page.getByRole('button', { name: 'Floral · 1' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Note' }).fill('Juicy, like jam')
  await page.getByRole('radiogroup', { name: 'Acidity' }).getByRole('radio', { name: 'High' }).click()
  await page.getByRole('radiogroup', { name: 'Body' }).getByRole('radio', { name: '2 of 5' }).click()
  await page.getByRole('radiogroup', { name: 'Cleanness' }).getByRole('radio', { name: 'Clean' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/$/)

  // Within 5 minutes another tap edits the same tasting
  await warm.getByRole('radio', { name: '5 stars: Memorable' }).click()
  await expect(page.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => (await serverTastings(request, 'br-warm', 'u-ana')).map((t) => t.overall), { timeout: 10_000 }).toEqual([5])
  const [t] = await serverTastings(request, 'br-warm', 'u-ana')
  expect(t).toMatchObject({
    temp_band: 'cool',
    temp_band_suggested: 'warm',
    compass_sour_bitter: 1,
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
  expect(t.minutes_after_brew).toBeGreaterThanOrEqual(14)

  // Re-rating the cooled cup is a new tasting; the earlier hot one stays
  const again = page.getByRole('article', { name: 'Cup: Again Gesha' })
  await again.getByRole('radio', { name: '4 stars: Great' }).click()
  await expect(again.getByRole('radio', { name: '4 stars: Great' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await serverTastings(request, 'br-again', 'u-ana')).map((r) => `${r.temp_band}:${r.overall}`).sort(), { timeout: 10_000 })
    .toEqual(['hot:3', 'warm:4'])
  await phone.close()

  // ---- Station: pending strip with everyone's cups; inline star with undo, then the stars sheet
  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  await station.addInitScript(() => localStorage.setItem('coffee.userId', 'u-bo'))
  const tablet = await station.newPage()
  await tablet.goto('/')
  const strip = tablet.getByRole('region', { name: 'Pending tastings' })
  const bosStars = strip.getByRole('radiogroup', { name: 'Bo: Warm Kii' })
  await bosStars.getByRole('radio', { name: '3 stars: Good' }).click()
  await expect(tablet.getByRole('status')).toContainText('Bo · ★★★ Good')
  await expect(bosStars.getByRole('radio', { name: '3 stars: Good' })).toHaveAttribute('aria-checked', 'true')
  await tablet.getByRole('button', { name: 'Undo' }).click()
  await expect(bosStars.getByRole('radio', { name: '3 stars: Good' })).toHaveAttribute('aria-checked', 'false')

  await strip.getByRole('button', { name: 'Rate as Bo' }).click()
  const sheet = tablet.getByRole('dialog', { name: "Bo's rating" })
  await expect(sheet.getByText('Bo', { exact: true })).toBeVisible()
  await sheet.getByRole('radio', { name: '5 stars: Memorable' }).click()
  await expect(tablet.getByRole('status')).toContainText('Bo · ★★★★★ Memorable')
  await expect(sheet).toBeHidden({ timeout: 3000 })
  await expect(bosStars.getByRole('radio', { name: '5 stars: Memorable' })).toHaveAttribute('aria-checked', 'true')

  await expect(tablet.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await serverTastings(request, 'br-warm', 'u-bo')).map((r) => `${r.overall}:${r.deleted_at ? 'deleted' : 'live'}`).sort(), { timeout: 10_000 })
    .toEqual(['3:deleted', '5:live'])
  await station.close()
})
