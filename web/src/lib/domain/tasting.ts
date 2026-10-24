// Rating logic: pending-tasting cards, the 5-minute edit window, re-rating as the cup cools, scales and tags.
import { suggestTempBand, type TempBand, type TempBandThresholds } from './tempBand'
import type { Brew, Tasting, TastingTag } from './types'

export const OVERALL_LABELS = ["Wouldn't finish", 'Meh', 'Good', 'Great', 'Memorable'] as const

export function overallLabel(n: number | null | undefined): string {
  return n ? (OVERALL_LABELS[Math.round(n) - 1] ?? '') : ''
}

export const TEMP_BANDS: TempBand[] = ['hot', 'warm', 'cool']
export const TEMP_BAND_LABELS: Record<TempBand, string> = { hot: 'Hot', warm: 'Warm', cool: 'Cool' }

/** The chip cycles Hot → Warm → Cool → Hot. */
export function cycleBand(b: TempBand): TempBand {
  return TEMP_BANDS[(TEMP_BANDS.indexOf(b) + 1) % TEMP_BANDS.length]
}

const rank = (b: TempBand) => TEMP_BANDS.indexOf(b)

/** Taps within this many minutes of a tasting update it instead of starting a new one. */
export const EDIT_WINDOW_MIN = 5
/** Unrated cups stay on the pending list this long. */
export const PENDING_MAX_MIN = 12 * 60
/** Rated cups come back for a re-rate as they cool, until this long after brewing. */
export const RERATE_MAX_MIN = 120

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, (now - Date.parse(iso)) / 60_000)
}

export function inEditWindow(t: Tasting, now: number): boolean {
  return now - Date.parse(t.rated_at) < EDIT_WINDOW_MIN * 60_000
}

const bandOf = (t: Tasting): TempBand => t.temp_band ?? t.temp_band_suggested ?? 'hot'

/**
 * - new: not rated yet
 * - editing: rated less than 5 min ago; taps change that tasting
 * - waiting: rated, muted until the cup reaches the next band ("Rate again when Warm")
 * - again: the cup moved to a cooler band since the last tasting ("Warm now · 18 min")
 */
export type CardState = 'new' | 'editing' | 'waiting' | 'again'

export interface PendingTasting {
  key: string // brew_id:user_id
  brew: Brew
  userId: string
  minutes: number
  suggested: TempBand
  state: CardState
  last: Tasting | undefined // this person's latest tasting of this brew
  nextBand: TempBand | null // waiting: the band that brings the card back
}

/** Each drinker's latest tasting per brew, keyed brew_id:user_id. */
export function latestTastings(tastings: Tasting[]): Map<string, Tasting> {
  const latest = new Map<string, Tasting>()
  for (const t of tastings) {
    const key = `${t.brew_id}:${t.taster_id}`
    const cur = latest.get(key)
    if (!cur || t.rated_at > cur.rated_at) latest.set(key, t)
  }
  return latest
}

/** Pending-tasting cards for everyone drinking a recent brew (or one person): ones to rate now first, newest brew first. */
export function pendingTastings(
  brews: Brew[],
  tasters: { brew_id: string; user_id: string }[],
  tastings: Tasting[],
  now: number,
  thresholds: TempBandThresholds,
  userId?: string | null,
): PendingTasting[] {
  const byId = new Map(brews.map((b) => [b.id, b]))
  const latest = latestTastings(tastings)
  const out: PendingTasting[] = []
  for (const bt of tasters) {
    if (userId !== undefined && bt.user_id !== userId) continue
    const brew = byId.get(bt.brew_id)
    if (!brew) continue
    const minutes = minutesSince(brew.brewed_at, now)
    const suggested = suggestTempBand(minutes, thresholds)
    const key = `${brew.id}:${bt.user_id}`
    const last = latest.get(key)
    const card = { key, brew, userId: bt.user_id, minutes, suggested, last, nextBand: null }
    if (!last) {
      if (minutes <= PENDING_MAX_MIN) out.push({ ...card, state: 'new' })
    } else if (inEditWindow(last, now)) {
      out.push({ ...card, state: 'editing' })
    } else if (minutes <= RERATE_MAX_MIN) {
      if (rank(suggested) > rank(bandOf(last))) out.push({ ...card, state: 'again' })
      else if (bandOf(last) !== 'cool') out.push({ ...card, state: 'waiting', nextBand: TEMP_BANDS[rank(bandOf(last)) + 1] })
    }
  }
  const muted = (p: PendingTasting) => (p.state === 'waiting' ? 1 : 0)
  return out.sort((a, b) => muted(a) - muted(b) || b.brew.brewed_at.localeCompare(a.brew.brewed_at))
}

/** Cards that want a tap now (not the muted "rate again later" ones). */
export const isActionable = (p: PendingTasting) => p.state !== 'waiting'

// ---- Detail scales: all 1–5, words only at 1 / 3 / 5 --------------------------------

export type ScaleField =
  | 'compass_sour_bitter'
  | 'compass_weak_strong'
  | 'aroma'
  | 'acidity'
  | 'sweetness'
  | 'body'
  | 'aftertaste'
  | 'balance'
  | 'cleanness'

export interface ScaleDef {
  field: ScaleField
  label: string
  words: [string, string, string] // at 1, 3 and 5
}

const LMH: [string, string, string] = ['Low', 'Medium', 'High']

export const COMPASS: ScaleDef[] = [
  { field: 'compass_sour_bitter', label: 'Sour ↔ Bitter', words: ['Sour', 'Balanced', 'Bitter'] },
  { field: 'compass_weak_strong', label: 'Weak ↔ Strong', words: ['Weak', 'Balanced', 'Strong'] },
]

export const PROFILE: ScaleDef[] = [
  { field: 'aroma', label: 'Aroma', words: LMH },
  { field: 'acidity', label: 'Acidity', words: LMH },
  { field: 'sweetness', label: 'Sweetness', words: LMH },
  { field: 'body', label: 'Body', words: LMH },
  { field: 'aftertaste', label: 'Aftertaste', words: LMH },
]

export const QUALITY: ScaleDef[] = [
  { field: 'balance', label: 'Balance', words: ['Unbalanced', 'OK', 'Harmonious'] },
  { field: 'cleanness', label: 'Cleanness', words: ['Muddy', 'OK', 'Clean'] },
]

/** Accessible name for one step: the word where there is one, else "2 of 5". */
export function stepName(def: ScaleDef, n: number): string {
  return n % 2 === 1 ? def.words[(n - 1) / 2] : `${n} of 5`
}

/** Dial-in hint from the compass, e.g. "Sour and weak: grind finer or brew longer". */
export function compassHint(sourBitter: number | null, weakStrong: number | null): string | null {
  const sb = sourBitter == null ? 0 : Math.sign(sourBitter - 3)
  const ws = weakStrong == null ? 0 : Math.sign(weakStrong - 3)
  if (sb < 0) return 'Sour: grind finer, brew hotter or longer'
  if (sb > 0) return 'Bitter: grind coarser, brew cooler or shorter'
  if (ws < 0) return 'Weak: use more coffee (or less water)'
  if (ws > 0) return 'Strong: use less coffee (or more water)'
  return null
}

// ---- Tags ----------------------------------------------------------------------------

/**
 * Add or remove a flavor tag. Source "roaster" when the roaster's notes list it (a confirmation),
 * "tasted" when the taster found it on their own — so roaster vs. tasted notes can be compared later.
 */
export function toggleTag(tags: TastingTag[] | null, tag: string, roasterTags: string[]): TastingTag[] {
  const cur = tags ?? []
  if (cur.some((t) => t.tag === tag)) return cur.filter((t) => t.tag !== tag)
  return [...cur, { tag, source: roasterTags.includes(tag) ? 'roaster' : 'tasted' }]
}
