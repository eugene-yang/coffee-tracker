import { expect, test } from '@playwright/test'

const ENDPOINT = 'https://push.example.test/e2e-device'

test('notifications: turn on and off in Settings; the service worker shows a pushed reminder', async ({ browser, request, baseURL }) => {
  await request.post('/api/sync/push', {
    data: { ops: [{ op_id: `user-u-nia-${Math.random()}`, table: 'user', id: 'u-nia', kind: 'upsert', patch: { name: 'Nia', color: '#86b3d9' } }] },
  })

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await phone.grantPermissions(['notifications'], { origin: baseURL })
  await phone.addInitScript((endpoint) => {
    localStorage.setItem('coffee.userId', 'u-nia')
    // Headless Chromium has no push service: stand in for the browser's subscription
    let sub: unknown = null
    const fake = {
      endpoint,
      options: { applicationServerKey: null },
      toJSON: () => ({ endpoint, keys: { p256dh: 'BPfakeKey', auth: 'fakeAuth' } }),
      unsubscribe: async () => ((sub = null), true),
    }
    PushManager.prototype.getSubscription = async () => sub as PushSubscription
    PushManager.prototype.subscribe = async () => ((sub = fake), fake as unknown as PushSubscription)
  }, ENDPOINT)
  const page = await phone.newPage()
  await page.goto('/settings')

  const subscribed = page.waitForRequest((r) => r.url().endsWith('/api/push/subscribe') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Turn on “How’s the cup?”' }).click()
  expect((await subscribed).postDataJSON()).toMatchObject({ user_id: 'u-nia', endpoint: ENDPOINT, keys: { p256dh: 'BPfakeKey', auth: 'fakeAuth' } })
  await expect(page.getByText('On for Nia on this device.')).toBeVisible()
  // The server knows the subscription now (sending to the fake endpoint fails, but not with "not subscribed")
  expect((await request.post('/api/push/test', { data: { endpoint: ENDPOINT } })).status()).not.toBe(404)

  // Delay is a synced setting
  await page.getByRole('button', { name: 'Remind later' }).click()
  await expect(page.getByText('6 min')).toBeVisible()

  // A push arriving at the service worker becomes a notification
  const cdp = await phone.newCDPSession(page)
  const registrationId = new Promise<string>((resolve) =>
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
      const reg = e.registrations.find((r) => !r.isDeleted)
      if (reg) resolve(reg.registrationId)
    }),
  )
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(baseURL!).origin,
    registrationId: await registrationId,
    data: JSON.stringify({ title: "How's the cup?", body: 'Kii AA — tap to rate', url: '/', tag: 'tasting:b:u' }),
  })
  await expect
    .poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title} | ${n.body}`)))
    .toEqual(["How's the cup? | Kii AA — tap to rate"])

  const unsubscribed = page.waitForRequest((r) => r.url().endsWith('/api/push/subscribe') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Turn off' }).click()
  await unsubscribed
  await expect(page.getByRole('button', { name: 'Turn on “How’s the cup?”' })).toBeVisible()
  expect((await request.post('/api/push/test', { data: { endpoint: ENDPOINT } })).status()).toBe(404)
  await phone.close()
})
