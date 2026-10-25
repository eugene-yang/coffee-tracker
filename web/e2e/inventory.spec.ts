import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const BAG_PHOTO = fileURLToPath(new URL('./fixtures/bag.jpg', import.meta.url))

async function syncNow(page: Page) {
  await page.getByRole('button', { name: /Synced|to sync|Syncing|unreachable|Saved/ }).first().click()
}

test('capture a bag, review the label, browse and search on phone and station', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await phone.newPage()
  await page.goto('/settings')
  await page.getByLabel("New person's name").fill('Ana')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  // Snap: one tap opens the camera; the bag exists immediately
  await page.getByRole('link', { name: 'Inventory', exact: true }).click()
  await page.getByLabel('Photograph a new bag').setInputFiles(BAG_PHOTO)
  await expect(page).toHaveURL(/\/capture\//)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/bag\//)

  // The label reader fills the form; fields read from the label are marked until checked
  await expect(page.getByLabel('Roaster')).toHaveValue('Onyx Coffee Lab', { timeout: 30_000 })
  await expect(page.getByLabel('Coffee')).toHaveValue('Kii AA')
  await expect(page.getByLabel('Roast date')).toHaveValue('2026-10-03')
  await expect(page.getByLabel('Weight (g)')).toHaveValue('250')
  await expect(page.getByTitle('Read from the label — check it')).toHaveCount(4)
  await page.getByLabel('Coffee').fill('Kii AA Top Lot') // a correction
  await page.getByRole('button', { name: 'More details' }).click()
  await expect(page.getByLabel('Process')).toHaveValue('Washed') // alias → canonical
  await page.getByRole('button', { name: 'Looks right' }).click()
  await expect(page.getByRole('heading', { name: 'Kii AA Top Lot' })).toBeVisible()
  await expect(page.getByText('~16 cups · 250 g left')).toBeVisible()
  // New bags go straight into the freezer by default (Settings → Beans); take this one out
  await page.getByRole('button', { name: 'Thaw' }).click()
  await expect(page.getByRole('status')).toContainText('Out of the freezer')

  // Browse and search
  await page.getByRole('link', { name: 'Inventory', exact: true }).click()
  await expect(page.getByRole('button', { name: /Kii AA Top Lot/ })).toBeVisible()
  const search = page.getByLabel('Search beans')
  await search.fill('gesha')
  await expect(page.getByText('Nothing matches “gesha”.')).toBeVisible()
  await search.fill('sl28')
  await expect(page.getByText('variety: SL28')).toBeVisible()
  await search.fill('blackcurant') // one typo
  await expect(page.getByRole('button', { name: /Kii AA Top Lot/ })).toBeVisible()
  await search.fill('')
  await page.getByRole('button', { name: 'Floral', exact: true }).click()
  await expect(page.getByText('No bags match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Fruity', exact: true }).click()
  await expect(page.getByRole('button', { name: /Kii AA Top Lot/ })).toBeVisible()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()

  // The label reader's corrections are recorded for the per-field correction rate
  await syncNow(page)
  await expect
    .poll(async () => {
      const pulled = await page.request.get('/api/sync/pull?since=0&limit=2000').then((r) => r.json())
      return pulled.rows.find((r: { table: string }) => r.table === 'extraction')?.row.corrected_fields
    })
    .toEqual(['name'])

  // Station: tile with freshness and amount; tap → side panel; freeze collapses into Frozen
  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  const tablet = await station.newPage()
  await tablet.goto('/')
  const tile = tablet.getByRole('button', { name: /Kii AA Top Lot/ })
  await expect(tile).toBeVisible()
  await expect(tile).toContainText('Onyx Coffee Lab')
  await expect(tile).toContainText('Kenya · Washed')
  await tile.click()
  const panel = tablet.getByRole('complementary', { name: 'Bag details' })
  await panel.getByRole('button', { name: 'Freeze' }).click()
  await expect(tablet.getByRole('button', { name: /Frozen · 1/ })).toBeVisible()
  await expect(tablet.getByRole('status')).toContainText('Moved to freezer')

  // Offline capture on the phone: saved locally, uploaded when back online
  await phone.setOffline(true)
  await page.getByLabel('Photograph a new bag').setInputFiles(BAG_PHOTO)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('link', { name: 'Inventory', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Needs review (1)' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Saved on this device/ })).toBeVisible()
  await phone.setOffline(false)
  await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 15_000 })
  const after = await page.request.get('/api/sync/pull?since=0&limit=2000').then((r) => r.json())
  const uploaded = after.rows.filter((r: { table: string; row: { uploaded: string | null } }) => r.table === 'photo' && r.row.uploaded)
  expect(uploaded).toHaveLength(2)

  await phone.close()
  await station.close()
})

test('phone: add a bag from the photo library onto the shelf; the page frame never scrolls', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await phone.newPage()
  await page.goto('/settings')
  await page.getByRole('radiogroup', { name: 'New bags go to' }).getByRole('radio', { name: 'Shelf' }).click()
  await expect(page.getByRole('radio', { name: 'Shelf' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('link', { name: 'Inventory', exact: true }).click()
  await page.getByLabel('Choose photos of a new bag').setInputFiles([BAG_PHOTO, BAG_PHOTO])
  await expect(page).toHaveURL(/\/capture\//)
  await expect(page.locator('.shot')).toHaveCount(2)
  await page.getByLabel('Add from photos').setInputFiles([BAG_PHOTO, BAG_PHOTO]) // only one more fits
  await expect(page.locator('.shot')).toHaveCount(3)
  await expect(page.getByLabel('Add from photos')).toHaveCount(0)
  const bagId = page.url().split('/').pop()
  await page.getByRole('button', { name: 'Done' }).click()
  // On the shelf: no "frozen" event was recorded for it
  const events = await page.evaluate(
    (id) =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('coffee')
        open.onsuccess = () => {
          const all = open.result.transaction('bag_event').objectStore('bag_event').getAll()
          all.onsuccess = () => resolve(all.result.filter((e) => e.bag_id === id).map((e) => e.kind))
        }
      }),
    bagId,
  )
  expect(events).toEqual([])

  // Only the content area scrolls, so iOS can't drag the bottom bars around on short pages
  for (const path of ['/', '/inventory', '/brew', '/settings']) { // settings is taller than the screen
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  }
  await phone.close()
})
