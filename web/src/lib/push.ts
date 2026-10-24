// Web Push on this device: "How's the cup?" reminders. Subscriptions are per person × device;
// the server sends them (see server/app/push.py). The push handler lives in public/push-sw.js.
const API = `${import.meta.env.BASE_URL}api`

export type PushSupport = 'ok' | 'needs-install' | 'unsupported'

export function pushSupport(): PushSupport {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (ok) return 'ok'
  // iOS only offers push to Home Screen apps; in a Safari tab PushManager is missing
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'needs-install' : 'unsupported'
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // No service worker in dev / unsupported setups: don't wait forever
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const x = new Uint8Array(a)
  return x.every((v, i) => v === b[i])
}

async function post(path: string, method: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `server said ${res.status}`)
  return res
}

/** Tell the server which person this device's subscription belongs to (idempotent). */
export async function register(sub: PushSubscription, userId: string): Promise<void> {
  const json = sub.toJSON()
  await post('/push/subscribe', 'POST', {
    user_id: userId,
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    device_label: navigator.userAgent.slice(0, 100),
  })
}

/** Ask for permission (must run from a tap on iOS), subscribe and register. */
export async function enablePush(userId: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed')
  const reg = await registration()
  if (!reg) throw new Error('The app needs to be installed and loaded from the home server')
  const res = await fetch(`${API}/push/vapid-key`)
  if (!res.ok) throw new Error('The home server is not reachable')
  const key = keyBytes((await res.json()).key)
  let sub = await reg.pushManager.getSubscription()
  // A subscription made for another server key (e.g. a new server) can't be reused
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await register(sub, userId)
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await post('/push/subscribe', 'DELETE', { endpoint: sub.endpoint }).catch(() => {}) // server forgets it on the next failed send anyway
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) throw new Error('Not subscribed on this device')
  await post('/push/test', 'POST', { endpoint: sub.endpoint })
}

/** On start and when the device's person changes: keep the server's record of this subscription current. */
export async function refreshPushOwner(userId: string | null): Promise<void> {
  if (import.meta.env.VITE_PREVIEW === '1' || !userId || pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  const sub = await currentSubscription().catch(() => null)
  if (sub) await register(sub, userId).catch(() => {}) // offline: try again next start
}
