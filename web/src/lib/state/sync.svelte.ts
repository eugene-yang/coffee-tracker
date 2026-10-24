// When to sync and what the header dot shows. No Background Sync on iOS, so we sync on
// open, on return to the foreground, when the network comes back, after writes, and every minute.
import { onChange, pendingCount } from '../db/local'
import { syncOnce } from '../db/sync'

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'preview'

// Preview build (static hosting, no server): everything stays on this device
export const PREVIEW = import.meta.env.VITE_PREVIEW === '1'

export const syncState = $state({
  status: (PREVIEW ? 'preview' : 'synced') as SyncStatus,
  pending: 0,
  lastSyncAt: null as string | null,
  error: null as string | null,
})

const WRITE_DEBOUNCE_MS = 2000
const INTERVAL_MS = 60_000
const FAST_INTERVAL_MS = 10_000

// Poll faster while the server is working on something we're waiting for (label reading)
let waitingOnServer: () => boolean = () => false
export function syncFasterWhile(fn: () => boolean): void {
  waitingOnServer = fn
}
let lastTick = 0

let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

async function refreshPending(): Promise<void> {
  syncState.pending = await pendingCount()
  if (syncState.status !== 'syncing' && syncState.status !== 'offline' && syncState.status !== 'preview') {
    syncState.status = syncState.pending > 0 ? 'pending' : 'synced'
  }
}

export async function syncNow(): Promise<void> {
  if (PREVIEW) return
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      if (!navigator.onLine) {
        syncState.status = 'offline'
        break
      }
      syncState.status = 'syncing'
      try {
        await syncOnce()
        syncState.lastSyncAt = new Date().toISOString()
        syncState.error = null
        syncState.status = 'synced'
      } catch (e) {
        // Server unreachable (away from home) or a transient error: data stays queued locally
        syncState.error = e instanceof Error ? e.message : String(e)
        syncState.status = 'offline'
        break
      }
    } while (again)
  } finally {
    running = false
    await refreshPending()
  }
}

export function requestSync(delayMs = WRITE_DEBOUNCE_MS): void {
  clearTimeout(timer)
  timer = setTimeout(syncNow, delayMs)
}

export function startSync(): void {
  onChange((table) => {
    if (table !== 'outbox' && table !== 'photo_blob') return
    refreshPending()
    requestSync()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow()
  })
  window.addEventListener('online', () => syncNow())
  window.addEventListener('offline', () => (syncState.status = 'offline'))
  setInterval(() => {
    if (document.visibilityState !== 'visible') return
    const due = waitingOnServer() ? FAST_INTERVAL_MS : INTERVAL_MS
    if (Date.now() - lastTick >= due - 500) {
      lastTick = Date.now()
      syncNow()
    }
  }, FAST_INTERVAL_MS)
  refreshPending()
  syncNow()
}
