// In-memory inventory search and filters. Everything is synchronous: the whole inventory is local.
import { flavorTag } from './flavors'
import type { BagView, BagState } from './inventory'
import type { Alias } from './types'

export type SearchField = 'roaster' | 'name' | 'origin' | 'producer' | 'variety' | 'process' | 'flavor' | 'notes'

// Fields already visible on a tile don't need a "why it matched" line
const SHOWN_ON_TILE = new Set<SearchField>(['roaster', 'name', 'origin', 'process'])
const PRIMARY = new Set<SearchField>(['roaster', 'name'])

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function tokenize(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Expands a value with its alias variants in both directions (Geisha ↔ Gesha). */
export class AliasIndex {
  private variants = new Map<string, Set<string>>()

  constructor(aliases: Pick<Alias, 'alias' | 'canonical'>[]) {
    for (const a of aliases) {
      const alias = normalize(a.alias)
      const canonical = normalize(a.canonical)
      this.link(alias, canonical)
      this.link(canonical, alias)
    }
  }

  private link(from: string, to: string) {
    const set = this.variants.get(from) ?? new Set()
    set.add(to)
    this.variants.set(from, set)
  }

  expand(value: string): string[] {
    const n = normalize(value).trim()
    return [n, ...(this.variants.get(n) ?? [])]
  }
}

/** Canonical spelling for a value if it's a known alias of that kind ("fully washed" → "Washed"). */
export function canonicalize(value: string, aliases: Pick<Alias, 'alias' | 'canonical' | 'kind'>[], kind: Alias['kind']): string {
  const n = normalize(value).trim()
  return aliases.find((a) => a.kind === kind && normalize(a.alias) === n)?.canonical ?? value.trim()
}

interface IndexedToken {
  field: SearchField
  token: string
  text: string // original value, for the "why it matched" line
}

export interface SearchIndex {
  docs: Map<string, IndexedToken[]>
}

export function buildIndex(views: BagView[], aliases: AliasIndex): SearchIndex {
  const docs = new Map<string, IndexedToken[]>()
  for (const v of views) {
    const c = v.coffee
    const values: [SearchField, string | null | undefined][] = [
      ['roaster', v.roasterName],
      ['name', c?.name],
      ['origin', c?.origin],
      ['producer', c?.producer],
      ['variety', c?.variety],
      ['process', c?.process],
      ['notes', c?.notes],
      ...(c?.tasting_notes ?? []).map((n): [SearchField, string] => ['flavor', n]),
      ...v.flavorTags.map((t): [SearchField, string | undefined] => ['flavor', flavorTag(t)?.label]),
    ]
    const tokens: IndexedToken[] = []
    for (const [field, text] of values) {
      if (!text) continue
      // Multi-value fields ("Gesha, Caturra") expand aliases per part
      for (const part of text.split(/[,/&+]/)) {
        for (const variant of aliases.expand(part)) {
          for (const token of tokenize(variant)) tokens.push({ field, token, text: part.trim() })
        }
      }
    }
    docs.set(v.id, tokens)
  }
  return { docs }
}

/** Levenshtein distance, early exit when it exceeds max. */
export function editDistance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

export interface SearchHit {
  score: number
  why: { field: SearchField; text: string } | null
}

function tokenScore(q: string, t: IndexedToken): number {
  if (t.token.startsWith(q)) return PRIMARY.has(t.field) ? 3 : 2
  // One typo allowed for longer words, against the token or its same-length prefix
  if (q.length >= 5 && (editDistance(q, t.token) <= 1 || editDistance(q, t.token.slice(0, q.length)) <= 1)) return 1
  return 0
}

/** Every query word must match some field (prefix, alias, or one typo). Null means "no query". */
export function search(index: SearchIndex, query: string): Map<string, SearchHit> | null {
  const words = tokenize(query)
  if (words.length === 0) return null
  const hits = new Map<string, SearchHit>()
  for (const [id, tokens] of index.docs) {
    let total = 0
    let why: SearchHit['why'] = null
    let ok = true
    for (const q of words) {
      let best = 0
      let bestTok: IndexedToken | null = null
      for (const t of tokens) {
        const s = tokenScore(q, t)
        if (s > best || (s === best && s > 0 && bestTok && SHOWN_ON_TILE.has(bestTok.field) && !SHOWN_ON_TILE.has(t.field))) {
          best = s
          bestTok = t
        }
      }
      if (best === 0) {
        ok = false
        break
      }
      total += best
      if (!why && bestTok && !SHOWN_ON_TILE.has(bestTok.field)) why = { field: bestTok.field, text: bestTok.text }
    }
    if (ok) hits.set(id, { score: total, why })
  }
  return hits
}

export type StateChip = 'ready' | 'low' | 'frozen'

export interface InventoryFilter {
  states: StateChip[]
  families: string[]
  roaster: string[]
  country: string[]
  process: string[]
  roast_level: string[]
}

export const EMPTY_FILTER: InventoryFilter = { states: [], families: [], roaster: [], country: [], process: [], roast_level: [] }

export type Facet = 'roaster' | 'country' | 'process' | 'roast_level'

export function facetValue(v: BagView, facet: Facet): string | null {
  switch (facet) {
    case 'roaster':
      return v.roasterName || null
    case 'country':
      return v.country
    case 'process':
      return v.coffee?.process ?? null
    case 'roast_level':
      return v.coffee?.roast_level ?? null
  }
}

const STATE_MATCH: Record<StateChip, (v: BagView) => boolean> = {
  ready: (v) => v.state === ('ready' satisfies BagState) || v.state === 'open',
  low: (v) => v.lastCup,
  frozen: (v) => v.state === 'frozen',
}

/** OR within a filter group, AND across groups. */
export function matchesFilter(v: BagView, f: InventoryFilter, skip?: Facet): boolean {
  if (f.states.length && !f.states.some((s) => STATE_MATCH[s](v))) return false
  if (f.families.length && !f.families.some((fam) => v.families.includes(fam))) return false
  for (const facet of ['roaster', 'country', 'process', 'roast_level'] as Facet[]) {
    if (facet === skip || f[facet].length === 0) continue
    const value = facetValue(v, facet)
    if (!value || !f[facet].includes(value)) return false
  }
  return true
}

export function isFilterActive(f: InventoryFilter): boolean {
  return Object.values(f).some((list) => list.length > 0)
}

/** Values with counts for the "More" sheet; counts respect the other active filters, zero-count values are dropped. */
export function facetCounts(views: BagView[], f: InventoryFilter, facet: Facet): [string, number][] {
  const counts = new Map<string, number>()
  for (const v of views) {
    if (v.state === 'finished' || !matchesFilter(v, f, facet)) continue
    const value = facetValue(v, facet)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
