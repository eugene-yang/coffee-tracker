// Rating logic: pending-tasting cards (anyone rates any cup, as often as they like), scales and tags.
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

/** Unrated cups stay on the pending list this long. */
export const PENDING_MAX_MIN = 12 * 60
/**
 * A rated cup stays on the list, to rate again as it cools, until this long after brewing. Only the
 * list is limited: any cup can be rated or re-rated at any time from its bag or Tastings.
 */
export const RATED_SHOWN_MAX_MIN = 120

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, (now - Date.parse(iso)) / 60_000)
}

/** new: this person hasn't rated the cup yet · rated: they have (shows the latest, Edit · Rate again) */
export type CardState = 'new' | 'rated'

export interface PendingTasting {
  key: string // brew_id:user_id
  brew: Brew
  userId: string
  minutes: number
  suggested: TempBand
  state: CardState
  last: Tasting | undefined // this person's latest tasting of this brew
  count: number // how many times this person rated it
}

/** Each person's tastings per brew, keyed brew_id:user_id, oldest first. */
export function tastingsByCup(tastings: Tasting[]): Map<string, Tasting[]> {
  const out = new Map<string, Tasting[]>()
  for (const t of [...tastings].sort((a, b) => a.rated_at.localeCompare(b.rated_at))) {
    const key = `${t.brew_id}:${t.taster_id}`
    out.set(key, [...(out.get(key) ?? []), t])
  }
  return out
}

/** Each person's latest tasting per brew, keyed brew_id:user_id. */
export function latestTastings(tastings: Tasting[]): Map<string, Tasting> {
  return new Map([...tastingsByCup(tastings)].map(([k, list]) => [k, list[list.length - 1]]))
}

/**
 * Pending cards for one person: every recent cup, whoever brewed it (anyone can rate any cup).
 * Cups they haven't rated come first, then newest brew first.
 */
export function pendingTastings(brews: Brew[], tastings: Tasting[], now: number, thresholds: TempBandThresholds, userId: string): PendingTasting[] {
  const mine = tastingsByCup(tastings.filter((t) => t.taster_id === userId))
  const out: PendingTasting[] = []
  for (const brew of brews) {
    const minutes = minutesSince(brew.brewed_at, now)
    const key = `${brew.id}:${userId}`
    const list = mine.get(key) ?? []
    if (minutes > (list.length ? RATED_SHOWN_MAX_MIN : PENDING_MAX_MIN)) continue
    out.push({
      key,
      brew,
      userId,
      minutes,
      suggested: suggestTempBand(minutes, thresholds),
      state: list.length ? 'rated' : 'new',
      last: list[list.length - 1],
      count: list.length,
    })
  }
  const rated = (p: PendingTasting) => (p.state === 'rated' ? 1 : 0)
  return out.sort((a, b) => rated(a) - rated(b) || b.brew.brewed_at.localeCompare(a.brew.brewed_at))
}

export interface PendingCup {
  brew: Brew
  minutes: number
  suggested: TempBand
  latest: Map<string, Tasting> // each person's latest tasting, by user id
}

/** Station strip: recent cups, one each, with everyone's latest rating; shown as long as on a phone. */
export function pendingCups(brews: Brew[], tastings: Tasting[], now: number, thresholds: TempBandThresholds): PendingCup[] {
  const latest = latestTastings(tastings)
  const out: PendingCup[] = []
  for (const brew of brews) {
    const minutes = minutesSince(brew.brewed_at, now)
    const mine = new Map([...latest].filter(([k]) => k.startsWith(`${brew.id}:`)).map(([, t]) => [t.taster_id, t]))
    if (minutes > (mine.size ? RATED_SHOWN_MAX_MIN : PENDING_MAX_MIN)) continue
    out.push({ brew, minutes, suggested: suggestTempBand(minutes, thresholds), latest: mine })
  }
  return out.sort((a, b) => b.brew.brewed_at.localeCompare(a.brew.brewed_at))
}

// ---- Detail scales: all 1–5, words only at 1 / 3 / 5 --------------------------------

export type ScaleField =
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
