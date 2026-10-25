// Deleting a bag, brew or rating: confirmed first, then hidden while the undo toast shows and only
// deleted (with everything that belongs to it) once the toast closes.
import { remove } from '../db/local'
import { bagCascade, brewCascade, type Cascade, type CascadeRows, type RowRef } from '../domain/deletes'
import { bagEvents, brewTasters, brews, extractions, pendingDeletes, photos, tastings } from './live.svelte'
import { showToast } from './toast.svelte'

function rows(): CascadeRows {
  return {
    bagEvents: bagEvents.rows,
    photos: photos.rows,
    extractions: extractions.rows,
    brews: brews.rows,
    brewTasters: brewTasters.rows,
    tastings: tastings.rows,
  }
}

export const bagDeletion = (bagId: string): Cascade => bagCascade(bagId, rows())
export const brewDeletion = (brewId: string): Cascade => brewCascade(brewId, rows())

// Deletes still waiting on their toast are also written to localStorage right away (a synchronous
// write): if the app goes away within those 5 s (switched away, closed, reloaded), the next start
// carries them out, so a confirmed delete never comes back. Leaving the app also runs them at once.
const KEY = 'coffee.pendingDeletes'
type Pending = { id: string; refs: RowRef[] }

function stored(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pending[]
  } catch {
    return []
  }
}
function store(list: Pending[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable: the delete still happens when the toast closes
  }
}

async function carryOut(p: Pending): Promise<void> {
  for (const r of p.refs) await remove(r.table, r.id)
  store(stored().filter((x) => x.id !== p.id))
}

const waiting = new Map<string, () => void>()
const flush = () => {
  for (const run of [...waiting.values()]) run()
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
window.addEventListener('pagehide', flush)

// Left over from a previous visit: the undo toast is long gone
for (const p of stored()) {
  pendingDeletes.keys = new Set([...pendingDeletes.keys, ...p.refs.map((r) => `${r.table}:${r.id}`)])
  void carryOut(p)
}

/**
 * Hide the rows now and delete them when the undo toast closes. Deleted ids never come back, so they
 * stay in the hidden set (no flicker while the tables reload). `onundo` runs if the user takes it back.
 */
export function deleteWithUndo(message: string, refs: RowRef[], onundo?: () => void, ms = 5000): void {
  const keys = refs.map((r) => `${r.table}:${r.id}`)
  pendingDeletes.keys = new Set([...pendingDeletes.keys, ...keys])
  const pending: Pending = { id: `${Date.now()}:${keys[keys.length - 1]}`, refs }
  store([...stored(), pending])
  const run = () => {
    clearTimeout(timer)
    waiting.delete(pending.id)
    void carryOut(pending)
  }
  const timer = setTimeout(run, ms)
  waiting.set(pending.id, run)
  showToast(
    message,
    () => {
      clearTimeout(timer)
      waiting.delete(pending.id)
      store(stored().filter((x) => x.id !== pending.id))
      const next = new Set(pendingDeletes.keys)
      for (const k of keys) next.delete(k)
      pendingDeletes.keys = next
      onundo?.()
    },
    ms,
  )
}
