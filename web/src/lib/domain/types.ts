import type { Row } from '../db/local'

export interface User extends Row {
  name: string | null
  color: string | null
  avatar: string | null
}

export interface Setting extends Row {
  value: unknown
}

export interface Roaster extends Row {
  name: string | null
  aliases: string[] | null
}

export interface Coffee extends Row {
  roaster_id: string | null
  name: string | null
  origin: string | null
  producer: string | null
  variety: string | null
  process: string | null
  roast_level: string | null
  altitude: string | null
  tasting_notes: string[] | null
  flavor_tags: string[] | null
  notes: string | null
}

export interface Bag extends Row {
  coffee_id: string | null
  roast_date: string | null
  weight_g: number | null
  price: number | null
  purchased_at: string | null
  review_state: 'needs_review' | 'reviewed' | null
}

export type BagEventKind = 'opened' | 'frozen' | 'thawed' | 'finished' | 'adjust'

export interface BagEvent extends Row {
  bag_id: string
  kind: BagEventKind
  grams_delta: number | null
  at: string
  user_id: string | null
}

export interface Photo extends Row {
  bag_id: string | null
  position: number | null
  width: number | null
  height: number | null
  sha256: string | null
  uploaded: string | null
}

export interface ExtractionFields {
  roaster?: string
  coffee_name?: string
  origin?: string
  producer?: string
  variety?: string
  process?: string
  roast_level?: string
  altitude?: string
  tasting_notes?: string[]
  roast_date?: string
  weight?: string
  other_notes?: string
}

export interface Extraction extends Row {
  status: 'queued' | 'running' | 'done' | 'error' | null
  model: string | null
  prompt_version: string | null
  raw: ExtractionFields | null
  error: string | null
  corrected_fields: string[] | null
  queued_at: string | null
  finished_at: string | null
}

export interface Alias extends Row {
  kind: 'process' | 'variety' | 'origin' | 'roaster' | 'roast_level'
  alias: string
  canonical: string
}

export interface Grinder extends Row {
  name: string | null
  setting_hint: string | null
  hidden_at: string | null // retired: kept for old brews, not offered for new ones
}

export interface Brewer extends Row {
  name: string | null
  method: string | null
  filter: string | null
  illustration: string | null
  hidden_at: string | null // retired: kept for old brews, not offered for new ones
}

export interface RecipeStep {
  label?: string
  at_s?: number // when the step starts, seconds from Start
  to_g?: number // pour up to this many grams
  note?: string
}

export interface BrewParams {
  method: string
  brewer_id: string | null
  grinder_id: string | null
  grind_setting: string | null
  dose_g: number | null
  water_g: number | null
  yield_g: number | null
  temp_c: number | null
  time_s: number | null
  steps: RecipeStep[]
}

export interface Recipe extends Row, Omit<BrewParams, 'steps'> {
  root_id: string
  version: number
  name: string | null
  steps: RecipeStep[] | null
  note: string | null
  author_id: string | null
}

export type StartedFrom = 'brew_again' | 'recipe' | 'freestyle'

export interface Brew extends Row, Omit<BrewParams, 'steps'> {
  bag_id: string
  brewer_user_id: string | null
  steps: RecipeStep[] | null
  laps: number[] | null
  extras: Record<string, unknown> | null
  recipe_id: string | null
  recipe_version: number | null
  started_from: StartedFrom | null
  brewed_at: string
  note: string | null
}

export interface BrewTaster extends Row {
  brew_id: string
  user_id: string
}

/** A person isn't drinking this cup: off their pending list; they can still rate it. */
export interface Dismissal extends Row {
  brew_id: string
  user_id: string
}

export type TagSource = 'roaster' | 'tasted'

export interface TastingTag {
  tag: string // flavor vocabulary id
  source: TagSource // confirmed from the roaster's notes, or found by the taster
}

export interface Tasting extends Row {
  brew_id: string
  taster_id: string
  rated_at: string
  minutes_after_brew: number | null
  temp_band: 'hot' | 'warm' | 'cool' | null
  temp_band_suggested: 'hot' | 'warm' | 'cool' | null
  overall: number | null // 1–5, required in the UI
  aroma: number | null
  acidity: number | null
  sweetness: number | null
  body: number | null
  aftertaste: number | null
  balance: number | null
  cleanness: number | null
  compass_sour_bitter: number | null // 1 sour · 3 balanced · 5 bitter
  compass_weak_strong: number | null // 1 weak · 3 balanced · 5 strong
  tags: TastingTag[] | null
  note: string | null
  schema_version: number | null
}
