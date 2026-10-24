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
