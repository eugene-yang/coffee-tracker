// What a delete takes with it. A bag owns its events, photos, label reading and brews; a brew owns its
// ratings (and the legacy "who's drinking" rows). Deleting the parent alone would leave orphans that
// still count (a brew's dose against grams left) or still show (a rating of a brew that's gone).
import type { TableName } from '../db/local'

export interface RowRef {
  table: TableName
  id: string
}

export interface CascadeRows {
  bagEvents: { id: string; bag_id: string }[]
  photos: { id: string; bag_id: string | null }[]
  extractions: { id: string }[] // keyed by bag id
  brews: { id: string; bag_id: string; dose_g: number | null }[]
  brewTasters: { id: string; brew_id: string }[]
  tastings: { id: string; brew_id: string }[]
}

export interface Cascade {
  rows: RowRef[] // children first, the thing itself last
  brews: number
  ratings: number
  photos: number
  grams: number // dose that goes back to the bag (deleting a brew)
}

function brewRows(brewIds: Set<string>, data: CascadeRows): RowRef[] {
  return [
    ...data.tastings.filter((t) => brewIds.has(t.brew_id)).map((t) => ({ table: 'tasting' as const, id: t.id })),
    ...data.brewTasters.filter((t) => brewIds.has(t.brew_id)).map((t) => ({ table: 'brew_taster' as const, id: t.id })),
  ]
}

const count = (rows: RowRef[], table: TableName) => rows.filter((r) => r.table === table).length

export function brewCascade(brewId: string, data: CascadeRows): Cascade {
  const rows = [...brewRows(new Set([brewId]), data), { table: 'brew' as const, id: brewId }]
  const grams = data.brews.find((b) => b.id === brewId)?.dose_g ?? 0
  return { rows, brews: 1, ratings: count(rows, 'tasting'), photos: 0, grams }
}

export function bagCascade(bagId: string, data: CascadeRows): Cascade {
  const brewIds = new Set(data.brews.filter((b) => b.bag_id === bagId).map((b) => b.id))
  const rows: RowRef[] = [
    ...brewRows(brewIds, data),
    ...[...brewIds].map((id) => ({ table: 'brew' as const, id })),
    ...data.bagEvents.filter((e) => e.bag_id === bagId).map((e) => ({ table: 'bag_event' as const, id: e.id })),
    ...data.photos.filter((p) => p.bag_id === bagId).map((p) => ({ table: 'photo' as const, id: p.id })),
    ...data.extractions.filter((x) => x.id === bagId).map((x) => ({ table: 'extraction' as const, id: x.id })),
    { table: 'bag', id: bagId },
  ]
  return { rows, brews: brewIds.size, ratings: count(rows, 'tasting'), photos: count(rows, 'photo'), grams: 0 }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "This also deletes its 4 brews, 7 ratings and 2 photos." — empty when nothing goes with it. */
export function cascadeSentence(c: Cascade, kind: 'bag' | 'brew'): string {
  const parts = [
    kind === 'bag' && c.brews ? plural(c.brews, 'brew') : '',
    c.ratings ? plural(c.ratings, 'rating') : '',
    c.photos ? plural(c.photos, 'photo') : '',
  ].filter(Boolean)
  if (!parts.length) return ''
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `This also deletes its ${list}.`
}
