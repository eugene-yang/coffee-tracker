// "Brew again" shortcuts for whoever is using this device
import { brewAgainShortcuts } from '../domain/brew'
import { device } from './device.svelte'
import { inventory } from './inventory.svelte'
import { brews } from './live.svelte'

export function shortcutsFor(max = 3) {
  return brewAgainShortcuts(
    brews.rows,
    device.userId,
    (bagId) => {
      const v = inventory.byId.get(bagId)
      return !!v && v.state !== 'finished' && !inventory.hidden.has(bagId)
    },
    max,
  )
}

export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
