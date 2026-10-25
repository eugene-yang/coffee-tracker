// Equipment and recipe writes. Recipes are immutable versions: saving an edit inserts a new row.
import { mutate, nowIso, remove } from './db/local'
import { uuidv7 } from './db/uuid'
import { nextVersion } from './domain/brew'
import type { BrewParams, Recipe } from './domain/types'

export async function saveGrinder(id: string | null, values: { name: string; setting_hint: string }): Promise<string> {
  const gid = id ?? uuidv7()
  await mutate('grinder', gid, { name: values.name.trim(), setting_hint: values.setting_hint.trim() || null })
  return gid
}

export async function saveBrewer(
  id: string | null,
  values: { name: string; method: string; filter: string; illustration: string | null },
): Promise<string> {
  const bid = id ?? uuidv7()
  await mutate('brewer', bid, {
    name: values.name.trim(),
    method: values.method,
    filter: values.filter.trim() || null,
    illustration: values.illustration,
  })
  return bid
}

/** Equipment is hidden (retired), never deleted: old brews keep showing what they were made with. */
export function setEquipmentHidden(table: 'grinder' | 'brewer', id: string, hidden: boolean): Promise<unknown> {
  return mutate(table, id, { hidden_at: hidden ? nowIso() : null })
}

export interface RecipeInput extends BrewParams {
  name: string
  note: string
}

/** New recipe (rootId null) or a new version of an existing one. Returns the new version's id. */
export async function saveRecipe(all: Recipe[], rootId: string | null, input: RecipeInput, authorId: string | null): Promise<string> {
  const id = uuidv7()
  const root = rootId ?? id
  await mutate('recipe', id, {
    root_id: root,
    version: nextVersion(all, root),
    name: input.name.trim() || 'Untitled recipe',
    method: input.method,
    brewer_id: input.brewer_id,
    grinder_id: input.grinder_id,
    grind_setting: input.grind_setting,
    dose_g: input.dose_g,
    water_g: input.water_g,
    yield_g: input.yield_g,
    temp_c: input.temp_c,
    time_s: input.time_s,
    steps: input.steps,
    note: input.note.trim() || null,
    author_id: authorId,
  })
  return id
}

/** Deleting a recipe hides every version; old brews keep their snapshot. */
export async function deleteRecipe(all: Recipe[], rootId: string): Promise<void> {
  for (const r of all.filter((r) => r.root_id === rootId)) await remove('recipe', r.id)
}

export function recipeEditedLabel(r: Recipe): string {
  const when = new Date(r.created_at || nowIso()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return r.version > 1 ? `v${r.version} · edited ${when}` : `added ${when}`
}
