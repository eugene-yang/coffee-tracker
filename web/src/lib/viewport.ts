// TEMPORARY: the full-height tab bar experiment (see app.css), switched from the preview's screen
// readout and remembered on this device. Remove with the readout once the bar is settled.
const KEY = 'coffee.barMode'

export function barFull(): boolean {
  try {
    return localStorage.getItem(KEY) === 'full'
  } catch {
    return false
  }
}

export function setBarFull(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'full')
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable: the switch lasts until the app reloads
  }
  document.documentElement.classList.toggle('bar-full', on)
}

export function applyBarMode(): void {
  document.documentElement.classList.toggle('bar-full', barFull())
}
