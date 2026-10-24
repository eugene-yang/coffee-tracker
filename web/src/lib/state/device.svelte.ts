// Per-device preferences: never synced, kept in localStorage (may be unavailable, so guarded).
export type LayoutChoice = 'auto' | 'phone' | 'station'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode / blocked storage: preference lasts for this session only
  }
}

export const device = $state({
  userId: read('coffee.userId'),
  layout: (read('coffee.layout') as LayoutChoice | null) ?? 'auto',
})

export function setDeviceUser(id: string | null): void {
  device.userId = id
  write('coffee.userId', id)
}

export function setLayoutChoice(choice: LayoutChoice): void {
  device.layout = choice
  write('coffee.layout', choice === 'auto' ? null : choice)
}

// Station when the screen is wide and landscape (tablet), phone otherwise
const viewport = $state({ width: window.innerWidth, height: window.innerHeight })
window.addEventListener('resize', () => {
  viewport.width = window.innerWidth
  viewport.height = window.innerHeight
})

export function currentLayout(): 'phone' | 'station' {
  if (device.layout !== 'auto') return device.layout
  return viewport.width >= 900 && viewport.width > viewport.height ? 'station' : 'phone'
}
