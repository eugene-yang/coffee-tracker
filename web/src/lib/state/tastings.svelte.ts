// Pending tastings and rating writes. Every tap saves; there is no submit button.
import { getRow, mutate, nowIso, nowMs, remove } from '../db/local'
import { uuidv7 } from '../db/uuid'
import { cycleBand, minutesSince, overallLabel, pendingCups, pendingTastings, toggleTag, type PendingTasting } from '../domain/tasting'
import { DEFAULT_TEMP_BANDS, TEMP_BANDS_SETTING, suggestTempBand, type TempBand, type TempBandThresholds } from '../domain/tempBand'
import type { Brew, Tasting } from '../domain/types'
import { brews, settingValue, tastings } from './live.svelte'
import { showToast } from './toast.svelte'

export const TASTING_SCHEMA_VERSION = 1

class TastingState {
  // Minutes since brewing move the suggested band: tick every 15 s
  now = $state(nowMs())
  thresholds = $derived(settingValue<TempBandThresholds>(TEMP_BANDS_SETTING, DEFAULT_TEMP_BANDS))
  cups = $derived(pendingCups(brews.rows, tastings.rows, this.now, this.thresholds))

  constructor() {
    setInterval(() => (this.now = nowMs()), 15_000)
  }

  forUser(userId: string | null): PendingTasting[] {
    return userId ? pendingTastings(brews.rows, tastings.rows, this.now, this.thresholds, userId) : []
  }

  // Band picked before a star (keyed brew_id:user_id), shared by the cards and the sheet.
  // The times in Settings only suggest a band; the taster always has the last word.
  overrides = $state<Record<string, TempBand>>({})

  bandFor(brew: Brew, userId: string): TempBand {
    return this.overrides[`${brew.id}:${userId}`] ?? suggestTempBand(minutesSince(brew.brewed_at, this.now), this.thresholds)
  }

  cycle(brew: Brew, userId: string): void {
    this.overrides = { ...this.overrides, [`${brew.id}:${userId}`]: cycleBand(this.bandFor(brew, userId)) }
  }

  /** A new rating of this cup, at the band shown. Returns an undo. */
  async rate(brew: Brew, userId: string, overall: number) {
    const key = `${brew.id}:${userId}`
    const result = await rateCup(brew, userId, overall, this.bandFor(brew, userId), suggestTempBand(minutesSince(brew.brewed_at, this.now), this.thresholds))
    const { [key]: _, ...rest } = this.overrides
    this.overrides = rest
    return result
  }
}

export const tastingState = new TastingState()

/**
 * Tastings filters, kept for the session. `who` (rated by: mine — the default —, everyone's, or one
 * person's id) is shared with bag history; who brewed and with what apply to the Tastings tab.
 */
export const ratingFilter = $state<{ who: 'mine' | 'everyone' | string; brewedBy: string; brewer: string; grinder: string }>({
  who: 'mine',
  brewedBy: 'any',
  brewer: 'any',
  grinder: 'any',
})

export function clearRatingFilter(): void {
  Object.assign(ratingFilter, { who: 'mine', brewedBy: 'any', brewer: 'any', grinder: 'any' })
}


export function ratingMatches(t: Tasting, who: string, me: string | null): boolean {
  return who === 'everyone' || t.taster_id === (who === 'mine' ? me : who)
}

/**
 * Every rating is its own tasting, stamped with when it was given and how long after brewing, so
 * two ratings at the same temperature stay apart. Changing one is an explicit edit (updateTasting).
 */
export async function rateCup(
  brew: Brew,
  userId: string,
  overall: number,
  band: TempBand,
  suggested: TempBand,
): Promise<{ id: string; undo: () => Promise<unknown> }> {
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

/** Rating detail: a new rating of the cup, or (with a tasting) editing that one. */
export function rateLink(brewId: string, userId: string, tastingId?: string): string {
  return `/rate/${brewId}/${userId}${tastingId ? `/${tastingId}` : ''}`
}

/** Confirm whose rating it was, with undo (wrong person, wet-finger tap). */
export function ratedToast(name: string, overall: number, undo: () => Promise<unknown>): void {
  showToast(`${name ? `${name} · ` : ''}${'★'.repeat(overall)} ${overallLabel(overall)}`, () => void undo())
}
