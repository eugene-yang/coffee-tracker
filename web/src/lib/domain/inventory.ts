// Derived inventory: bag state, freshness and amount left are computed from synced rows, never stored.
import { familyOf } from './flavors'
import { daysBetween } from './parse'
import type { Bag, BagEvent, Coffee, Photo, Roaster } from './types'

export interface RestWindow {
  rest_days: number // resting before this many days off roast
  peak_days: number // peak until this many days, fading after
}

export const REST_WINDOW_SETTING = 'rest_window'
export const DEFAULT_REST_WINDOW: RestWindow = { rest_days: 7, peak_days: 35 }
export const DEFAULT_DOSE_G = 15

export type BagState = 'open' | 'ready' | 'resting' | 'frozen' | 'finished'
export type Freshness = 'resting' | 'peak' | 'fading'

export interface BagView {
  id: string
  bag: Bag
  coffee: Coffee | undefined
  roaster: Roaster | undefined
  photoIds: string[]
  needsReview: boolean
  state: BagState
  title: string
  roasterName: string
  subtitle: string // "Kenya · Washed"
  country: string | null
  flavorTags: string[]
  families: string[]
  ageDays: number | null // effective: days off roast minus time in the freezer
  freshness: Freshness | null
  readyInDays: number | null
  frozenDays: number | null
  gramsLeft: number | null
  cupsLeft: number | null
  lastCup: boolean // less than two doses left
  askFinished: boolean // less than one dose left: ask, never auto-finish
  addedAt: string
}

export interface InventoryRows {
  bags: Bag[]
  coffees: Coffee[]
  roasters: Roaster[]
  events: BagEvent[]
  photos: Photo[]
}

export interface InventoryOptions {
  now: Date
  rest: RestWindow
  doseG: number
  /** grams used per bag (sum of brew doses) */
  usedG?: Map<string, number>
  /** last dose per bag, for "cups left" (falls back to doseG) */
  lastDoseG?: Map<string, number>
}

function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (k == null) continue
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function country(origin: string | null | undefined): string | null {
  const c = origin?.split(/[,/–-]/)[0].trim()
  return c || null
}

export function buildBagViews(rows: InventoryRows, opts: InventoryOptions): BagView[] {
  const coffees = new Map(rows.coffees.map((c) => [c.id, c]))
  const roasters = new Map(rows.roasters.map((r) => [r.id, r]))
  const eventsByBag = groupBy(rows.events, (e) => e.bag_id)
  const photosByBag = groupBy(rows.photos, (p) => p.bag_id)

  return rows.bags.map((bag) => {
    const coffee = bag.coffee_id ? coffees.get(bag.coffee_id) : undefined
    const roaster = coffee?.roaster_id ? roasters.get(coffee.roaster_id) : undefined
    const events = [...(eventsByBag.get(bag.id) ?? [])].sort((a, b) => a.at.localeCompare(b.at))

    let opened = false
    let frozen = false
    let finished = false
    let frozenSince: string | null = null
    let frozenMs = 0
    let adjustG = 0
    for (const e of events) {
      if (e.kind === 'opened') opened = true
      else if (e.kind === 'finished') finished = true
      else if (e.kind === 'frozen' && !frozen) {
        frozen = true
        frozenSince = e.at
      } else if (e.kind === 'thawed' && frozen) {
        frozen = false
        frozenMs += Date.parse(e.at) - Date.parse(frozenSince!)
        frozenSince = null
      } else if (e.kind === 'adjust') adjustG += e.grams_delta ?? 0
    }
    const frozenDays = frozen && frozenSince ? daysBetween(frozenSince, opts.now) : null
    if (frozen && frozenSince) frozenMs += opts.now.getTime() - Date.parse(frozenSince)

    const ageDays = bag.roast_date ? daysBetween(bag.roast_date, opts.now) - Math.floor(frozenMs / 86_400_000) : null
    const freshness: Freshness | null =
      ageDays == null || frozen
        ? null
        : ageDays < opts.rest.rest_days
          ? 'resting'
          : ageDays < opts.rest.peak_days
            ? 'peak'
            : 'fading'
    const state: BagState = finished
      ? 'finished'
      : frozen
        ? 'frozen'
        : opened
          ? 'open'
          : freshness === 'resting'
            ? 'resting'
            : 'ready'

    const gramsLeft = bag.weight_g == null ? null : Math.max(0, bag.weight_g - (opts.usedG?.get(bag.id) ?? 0) + adjustG)
    const dose = opts.lastDoseG?.get(bag.id) ?? opts.doseG
    const cupsLeft = gramsLeft == null ? null : Math.floor(gramsLeft / dose)
    const needsReview = bag.review_state === 'needs_review'
    const flavorTags = coffee?.flavor_tags ?? []

    return {
      id: bag.id,
      bag,
      coffee,
      roaster,
      photoIds: (photosByBag.get(bag.id) ?? [])
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at))
        .map((p) => p.id),
      needsReview,
      state,
      title: coffee?.name || (needsReview ? `Untitled · ${shortDate(bag.created_at)}` : 'Untitled'),
      roasterName: roaster?.name ?? '',
      subtitle: [coffee?.origin && country(coffee.origin), coffee?.process].filter(Boolean).join(' · '),
      country: country(coffee?.origin),
      flavorTags,
      families: [...new Set(flavorTags.map(familyOf).filter((f): f is string => !!f))],
      ageDays,
      freshness,
      readyInDays: freshness === 'resting' && ageDays != null ? opts.rest.rest_days - ageDays : null,
      frozenDays,
      gramsLeft,
      cupsLeft,
      lastCup: gramsLeft != null && state !== 'finished' && gramsLeft < 2 * dose,
      askFinished: gramsLeft != null && state !== 'finished' && gramsLeft < dose,
      addedAt: bag.created_at,
    }
  })
}

export type SectionId = 'needs_review' | 'open' | 'ready' | 'resting' | 'frozen'

export const SECTION_LABELS: Record<SectionId, string> = {
  needs_review: 'Needs review',
  open: 'Open',
  ready: 'Ready',
  resting: 'Resting',
  frozen: 'Frozen',
}

/** Which section a bag lives in; finished bags only appear in search results. */
export function sectionOf(v: BagView, layout: 'phone' | 'station'): SectionId | null {
  if (v.state === 'finished') return null
  if (v.needsReview && layout === 'phone') return 'needs_review'
  return v.state
}

export type SortKey = 'smart' | 'recent' | 'roast_date' | 'roaster'

export const SORT_LABELS: Record<SortKey, string> = {
  smart: 'Brew next',
  recent: 'Recently added',
  roast_date: 'Roast date',
  roaster: 'Roaster A–Z',
}

const nullsLast = (a: number | null, b: number | null) => (a == null ? 1 : b == null ? -1 : a - b)

/** "Brew next" order within a section: finish open bags, then oldest ready, then soonest ready. */
export function compareSmart(section: SectionId, a: BagView, b: BagView): number {
  switch (section) {
    case 'open':
      return nullsLast(a.gramsLeft, b.gramsLeft)
    case 'ready':
      return nullsLast(b.ageDays, a.ageDays)
    case 'resting':
      return nullsLast(a.readyInDays, b.readyInDays)
    case 'frozen':
      return nullsLast(b.frozenDays, a.frozenDays)
    default:
      return b.addedAt.localeCompare(a.addedAt)
  }
}

export function compareBy(sort: Exclude<SortKey, 'smart'>, a: BagView, b: BagView): number {
  switch (sort) {
    case 'recent':
      return b.addedAt.localeCompare(a.addedAt)
    case 'roast_date':
      return (b.bag.roast_date ?? '').localeCompare(a.bag.roast_date ?? '')
    case 'roaster':
      return a.roasterName.localeCompare(b.roasterName) || a.title.localeCompare(b.title)
  }
}
