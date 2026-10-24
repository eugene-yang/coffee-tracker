import { expect, test } from '@playwright/test'

test('person added offline on the phone shows up on the station after sync', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await phone.newPage()
  await page.goto('/')
  await expect(page.getByText('Welcome')).toBeVisible()
  // Wait for the service worker to take control so the app loads without the server
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await phone.setOffline(true)
  await page.reload()
  await expect(page.getByText('Welcome')).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel("New person's name").fill('Eugene')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('button', { name: /Eugene.*this device/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Saved on this device · 1 to sync/ })).toBeVisible()

  await phone.setOffline(false)
  await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 15_000 })

  const station = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  const tablet = await station.newPage()
  await tablet.goto('/')
  await tablet.getByRole('button', { name: "Who's brewing?" }).click()
  await tablet.getByRole('dialog').getByRole('button', { name: 'Eugene' }).click()
  await expect(tablet.locator('header').getByText('Eugene')).toBeVisible()

  // A setting changed on the station reaches the phone
  await tablet.getByRole('link', { name: 'Settings' }).click()
  await tablet.getByRole('button', { name: 'Hot under plus one' }).click()
  await expect(tablet.getByText('11 min')).toBeVisible()
  await expect(tablet.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Synced', exact: true }).click()
  await expect(page.getByText('11 min')).toBeVisible()

  await phone.close()
  await station.close()
})
