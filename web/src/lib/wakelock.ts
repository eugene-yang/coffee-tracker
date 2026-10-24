// Keep the screen on while brewing (and a while after). Re-acquired when the page becomes visible again.
let sentinel: WakeLockSentinel | null = null
let wanted = false
let releaseTimer: ReturnType<typeof setTimeout> | undefined

async function acquire(): Promise<void> {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => (sentinel = null))
  } catch {
    // Not allowed (battery saver, unsupported): the brew still works, the screen may dim
  }
}

document.addEventListener('visibilitychange', () => void acquire())

export function keepAwake(): void {
  clearTimeout(releaseTimer)
  wanted = true
  void acquire()
}

/** Let the screen sleep again after `ms` (10 minutes after a brew by default). */
export function allowSleepAfter(ms = 10 * 60_000): void {
  clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    wanted = false
    void sentinel?.release()
    sentinel = null
  }, ms)
}
