// Pending tastings and rating writes. Every tap saves; there is no submit button.
import { getRow, mutate, nowIso, nowMs, remove } from '../db/local'
import { uuidv7 } from '../db/uuid'
import { cycleBand, minutesSince, overallLabel, pendingTastings, toggleTag, type PendingTasting } from '../domain/tasting'
import { DEFAULT_TEMP_BANDS, TEMP_BANDS_SETTING, type TempBand, type TempBandThresholds } from '../domain/tempBand'
import type { Brew, Tasting } from '../domain/types'
import { brews, brewTasters, settingValue, tastings } from './live.svelte'
import { showToast } from './toast.svelte'

export const TASTING_SCHEMA_VERSION = 1

class TastingState {
  // Minutes since brewing move the suggested band and the edit window: tick every 15 s
  now = $state(nowMs())
  thresholds = $derived(settingValue<TempBandThresholds>(TEMP_BANDS_SETTING, DEFAULT_TEMP_BANDS))
  all = $derived(pendingTastings(brews.rows, brewTasters.rows, tastings.rows, this.now, this.thresholds))

  constructor() {
    setInterval(() => (this.now = nowMs()), 15_000)
  }

  forUser(userId: string | null): PendingTasting[] {
    return pendingTastings(brews.rows, brewTasters.rows, tastings.rows, this.now, this.thresholds, userId)
  }

  // Band picked on a card before its first star (keyed brew_id:user_id), shared by the strip and the sheet
  overrides = $state<Record<string, TempBand>>({})

  /** The band a card shows: the tasting's while editing it, else the override or the suggestion. */
  bandOf(p: PendingTasting): TempBand {
    if (p.state === 'editing') return p.last?.temp_band ?? p.suggested
    return this.overrides[p.key] ?? p.suggested
  }

  async cycleBand(p: PendingTasting): Promise<void> {
    const next = cycleBand(this.bandOf(p))
    if (p.state === 'editing' && p.last) await updateTasting(p.last.id, { temp_band: next })
    else this.overrides = { ...this.overrides, [p.key]: next }
  }

  async rate(p: PendingTasting, overall: number) {
    const result = await rateOverall(p.brew, p.userId, overall, this.bandOf(p), p.suggested, p.state === 'editing' ? p.last : undefined)
    const { [p.key]: _, ...rest } = this.overrides
    this.overrides = rest
    return result
  }
}

export const tastingState = new TastingState()

/**
 * Overall stars from a card: updates the tasting still in its edit window, else starts a new one.
 * Returns an undo that deletes the new tasting or restores the previous values.
 */
export async function rateOverall(
  brew: Brew,
  userId: string,
  overall: number,
  band: TempBand,
  suggested: TempBand,
  editing: Tasting | undefined,
): Promise<{ id: string; undo: () => Promise<unknown> }> {
  if (editing) {
    const prev = { overall: editing.overall, temp_band: editing.temp_band }
    await mutate('tasting', editing.id, { overall, temp_band: band })
    return { id: editing.id, undo: () => mutate('tasting', editing.id, prev) }
  }
  const id = uuidv7()
  await mutate('tasting', id, {
    brew_id: brew.id,
    taster_id: userId,
    rated_at: nowIso(),
    minutes_after_brew: Math.round(minutesSince(brew.brewed_at, nowMs()) * 10) / 10,
    temp_band: band,
    temp_band_suggested: suggested,
    overall,
    schema_version: TASTING_SCHEMA_VERSION,
  })
  tastingState.now = nowMs()
  return { id, undo: () => remove('tasting', id) }
}

// Detail taps can come faster than a write + reload: apply them one after another, in order
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

export function updateTasting(id: string, patch: Partial<Tasting>): Promise<unknown> {
  // Values may come from reactive rows (proxies), which IndexedDB can't store
  const plain = $state.snapshot(patch)
  return serial(() => mutate('tasting', id, plain))
}

/** Add or remove a flavor tag, based on the stored row so quick taps don't overwrite each other. */
export function toggleTastingTag(id: string, tag: string, roasterTags: string[]): Promise<unknown> {
  return serial(async () => {
    const row = (await getRow('tasting', id)) as Tasting | undefined
    if (row) await mutate('tasting', id, { tags: toggleTag(row.tags, tag, roasterTags) })
  })
}

/** More detail for a card: the tasting it is showing (editing, or the last one while muted), else a new one. */
export function rateLink(p: PendingTasting): string {
  const base = `/rate/${p.brew.id}/${p.userId}`
  return p.last && (p.state === 'editing' || p.state === 'waiting') ? `${base}/${p.last.id}` : base
}

/** Station: confirm whose rating it was, with undo (wrong person, wet-finger tap). */
export function ratedToast(name: string, overall: number, undo: () => Promise<unknown>): void {
  showToast(`${name ? `${name} · ` : ''}${'★'.repeat(overall)} ${overallLabel(overall)}`, () => void undo())
}
