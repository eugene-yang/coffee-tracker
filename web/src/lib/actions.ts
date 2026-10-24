// Inventory write actions. All writes go through mutate(): local first, synced later.
import { mutate, nowIso, remove, savePhotoBlob } from './db/local'
import { uuidv7 } from './db/uuid'
import { tagsFromNotes } from './domain/flavors'
import { canonicalize, normalize } from './domain/search'
import type { Alias, BagEventKind, Coffee, Extraction, Roaster } from './domain/types'
import { parseRoastDate, parseWeightGrams } from './domain/parse'
import { resizeImage } from './photo'

export const MAX_PHOTOS_PER_BAG = 3

/** Capture: the first photo creates the bag immediately as "needs review". */
export async function createBagWithPhoto(file: Blob): Promise<string> {
  const bagId = uuidv7()
  await mutate('bag', bagId, { review_state: 'needs_review' })
  await addPhoto(bagId, file, 0)
  return bagId
}

export async function addPhoto(bagId: string, file: Blob, position: number): Promise<string> {
  const id = uuidv7()
  const blob = await resizeImage(file)
  await savePhotoBlob(id, blob)
  await mutate('photo', id, { bag_id: bagId, position })
  return id
}

export async function addBagEvent(bagId: string, kind: BagEventKind, userId: string | null, gramsDelta?: number): Promise<string> {
  const id = uuidv7()
  await mutate('bag_event', id, { bag_id: bagId, kind, at: nowIso(), user_id: userId, grams_delta: gramsDelta ?? null })
  return id
}

export function undoBagEvent(eventId: string): Promise<unknown> {
  return remove('bag_event', eventId)
}

export function retryExtraction(bagId: string): Promise<unknown> {
  return mutate('extraction', bagId, { status: 'queued', queued_at: nowIso() })
}

// ---- Review ---------------------------------------------------------------

export const REVIEW_FIELDS = [
  'roaster',
  'name',
  'roast_date',
  'weight_g',
  'origin',
  'producer',
  'variety',
  'process',
  'roast_level',
  'altitude',
  'tasting_notes',
  'notes',
] as const
export type ReviewField = (typeof REVIEW_FIELDS)[number]
export type ReviewForm = Record<ReviewField, string>

export function emptyForm(): ReviewForm {
  return Object.fromEntries(REVIEW_FIELDS.map((f) => [f, ''])) as ReviewForm
}

/** Form values suggested by the label reader; unknown stays blank, never guessed. */
export function suggestionsFrom(ex: Extraction | undefined, aliases: Alias[]): Partial<ReviewForm> {
  const raw = ex?.status === 'done' ? ex.raw : null
  if (!raw) return {}
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const out: Partial<ReviewForm> = {
    roaster: s(raw.roaster),
    name: s(raw.coffee_name),
    roast_date: parseRoastDate(s(raw.roast_date)) ?? '',
    weight_g: String(parseWeightGrams(s(raw.weight)) ?? ''),
    origin: s(raw.origin) && canonicalize(s(raw.origin), aliases, 'origin'),
    producer: s(raw.producer),
    variety: s(raw.variety) && canonicalize(s(raw.variety), aliases, 'variety'),
    process: s(raw.process) && canonicalize(s(raw.process), aliases, 'process'),
    roast_level: s(raw.roast_level) && canonicalize(s(raw.roast_level), aliases, 'roast_level'),
    altitude: s(raw.altitude),
    tasting_notes: Array.isArray(raw.tasting_notes) ? raw.tasting_notes.map(s).filter(Boolean).join(', ') : '',
    notes: s(raw.other_notes),
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<ReviewForm>
}

export function formFromCoffee(coffee: Coffee | undefined, roaster: Roaster | undefined, bag: { roast_date: string | null; weight_g: number | null }): ReviewForm {
  return {
    roaster: roaster?.name ?? '',
    name: coffee?.name ?? '',
    roast_date: bag.roast_date ?? '',
    weight_g: bag.weight_g != null ? String(bag.weight_g) : '',
    origin: coffee?.origin ?? '',
    producer: coffee?.producer ?? '',
    variety: coffee?.variety ?? '',
    process: coffee?.process ?? '',
    roast_level: coffee?.roast_level ?? '',
    altitude: coffee?.altitude ?? '',
    tasting_notes: (coffee?.tasting_notes ?? []).join(', '),
    notes: coffee?.notes ?? '',
  }
}

const orNull = (v: string) => v.trim() || null

export interface SaveReviewInput {
  bagId: string
  form: ReviewForm
  flavorTags: string[] | null // null: derive from tasting notes
  roasters: Roaster[]
  coffees: Coffee[]
  aliases: Alias[]
  currentCoffeeId: string | null
  suggestions: Partial<ReviewForm>
  hasExtraction: boolean
}

/** "Looks right" / Save: link or create roaster and coffee (re-buys reuse the coffee), mark the bag reviewed. */
export async function saveReview(input: SaveReviewInput): Promise<void> {
  const { form, aliases } = input
  const roasterName = canonicalize(form.roaster, aliases, 'roaster')
  let roasterId: string | null = null
  if (roasterName) {
    const existing = input.roasters.find(
      (r) => normalize(r.name ?? '') === normalize(roasterName) || (r.aliases ?? []).some((a) => normalize(a) === normalize(roasterName)),
    )
    roasterId = existing?.id ?? uuidv7()
    if (!existing) await mutate('roaster', roasterId, { name: roasterName })
  }

  const name = orNull(form.name)
  const rebuy = name
    ? input.coffees.find((c) => c.roaster_id === roasterId && normalize(c.name ?? '') === normalize(name))
    : undefined
  const coffeeId = rebuy?.id ?? input.currentCoffeeId ?? uuidv7()
  const tastingNotes = form.tasting_notes.split(',').map((t) => t.trim()).filter(Boolean)
  await mutate('coffee', coffeeId, {
    roaster_id: roasterId,
    name,
    origin: orNull(canonicalize(form.origin, aliases, 'origin')),
    producer: orNull(form.producer),
    variety: orNull(canonicalize(form.variety, aliases, 'variety')),
    process: orNull(canonicalize(form.process, aliases, 'process')),
    roast_level: orNull(canonicalize(form.roast_level, aliases, 'roast_level')),
    altitude: orNull(form.altitude),
    tasting_notes: tastingNotes,
    flavor_tags: input.flavorTags ?? tagsFromNotes(tastingNotes),
    notes: orNull(form.notes),
  })

  const grams = parseFloat(form.weight_g)
  await mutate('bag', input.bagId, {
    coffee_id: coffeeId,
    roast_date: orNull(form.roast_date),
    weight_g: Number.isFinite(grams) ? grams : null,
    review_state: 'reviewed',
  })

  if (input.hasExtraction) {
    // Per-field correction rate of the label reader (scope pitfall #3)
    const corrected = REVIEW_FIELDS.filter((f) => input.suggestions[f] !== undefined && normalize(input.suggestions[f]!) !== normalize(form[f]))
    await mutate('extraction', input.bagId, { corrected_fields: corrected })
  }
}

/**
 * Delete with undo: deletes sync as tombstones and can't be reverted, so the bag is only hidden
 * while the undo toast is up and actually deleted when it closes.
 */
export function deleteBagLater(bagId: string, hide: (id: string, hidden: boolean) => void, ms = 5000): () => void {
  hide(bagId, true)
  const timer = setTimeout(() => {
    remove('bag', bagId).finally(() => hide(bagId, false))
  }, ms)
  return () => {
    clearTimeout(timer)
    hide(bagId, false)
  }
}
