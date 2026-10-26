import { expect, test } from '@playwright/test'

const op = (table: string, id: string, patch: Record<string, unknown>) => ({
  op_id: `${table}-${id}-${Math.random()}`,
  table,
  id,
  kind: 'upsert',
  patch,
})
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

test('dismiss cups from pending tastings: one with undo, or all; synced per person, off the station strip', async ({ browser, request }) => {
  await request.post('/api/sync/push', {
    data: {
      ops: [
        op('user', 'u-dis-a', { name: 'Dot', color: '#e39aa8' }),
        op('user', 'u-dis-b', { name: 'Dex', color: '#8fc2a0' }),
        op('coffee', 'c-dis', { name: 'Dismiss Test' }),
        op('bag', 'b-dis', { coffee_id: 'c-dis', roast_date: '2026-10-01', weight_g: 250, review_state: 'reviewed' }),
        op('brew', 'br-dis1', { bag_id: 'b-dis', brewer_user_id: 'u-dis-b', method: 'pour_over', dose_g: 15, water_g: 250, brewed_at: ago(6) }),
        op('brew', 'br-dis2', { bag_id: 'b-dis', brewer_user_id: 'u-dis-b', method: 'pour_over', dose_g: 15, water_g: 250, brewed_at: ago(3) }),
      ],
    },
  })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.addInitScript(() => localStorage.setItem('coffee.userId', 'u-dis-a'))
  const page = await phone.newPage()
  await page.goto('/')
  const cards = page.getByRole('article', { name: 'Cup: Dismiss Test' })
  await expect(cards).toHaveCount(2)

  // One cup, with undo
  await cards.first().getByRole('button', { name: /^Dismiss Dismiss Test/ }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(cards).toHaveCount(2)
  await cards.first().getByRole('button', { name: /^Dismiss Dismiss Test/ }).click()
  await expect(cards).toHaveCount(1)

  // The station: Dot's avatar is off that cup, still offered on the other
  await expect(page.getByRole('button', { name: /Synced/ })).toBeVisible({ timeout: 15_000 })
  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  await station.addInitScript(() => localStorage.setItem('coffee.userId', 'u-dis-b'))
  const tablet = await station.newPage()
  await tablet.goto('/')
  const strip = tablet.getByRole('region', { name: 'Pending tastings' })
  await expect(strip.getByRole('button', { name: 'Rate Dismiss Test as Dot' })).toHaveCount(1)
  await expect(strip.getByRole('button', { name: 'Rate Dismiss Test as Dex' })).toHaveCount(2)
  await station.close()

  // All at once (other specs' recent cups are on the list too)
  const all = page.getByRole('region', { name: 'Pending tastings' }).getByRole('article')
  const n = await all.count()
  expect(n).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: 'Dismiss all' }).click()
  await expect(all).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText(`${n} cups dismissed`)
  await expect(page.getByRole('button', { name: 'Dismiss all' })).toHaveCount(0)
  await phone.close()
})
