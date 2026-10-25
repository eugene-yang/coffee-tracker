// The brew in progress on this device. Persisted so a reload, screen lock or app switch keeps the timer:
// elapsed time is always computed from the start timestamp, never counted.
import { mutate, nowIso, remove } from '../db/local'
import { uuidv7 } from '../db/uuid'
import { brewAgainSource, defaultParams, paramsOf, pickBrewer, pickGrinder, suggestDrinkers } from '../domain/brew'
import type { BrewParams, Recipe, StartedFrom } from '../domain/types'
import { device } from './device.svelte'
import { brewers, brews, brewTasters, grinders } from './live.svelte'

export interface BrewDraft {
  id: string
  bagId: string
  brewerUserId: string | null
  params: BrewParams
  recipeId: string | null
  recipeVersion: number | null
  startedFrom: StartedFrom
  phase: 'setup' | 'running' | 'stopped'
  startedAt: number | null
  stoppedAt: number | null
  laps: number[]
  drinkers: string[]
}

const KEY = 'coffee.brewDraft'

function load(): BrewDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as BrewDraft) : null
  } catch {
    return null
  }
}

class BrewState {
  draft = $state<BrewDraft | null>(load())

  private save() {
    try {
      if (this.draft) localStorage.setItem(KEY, JSON.stringify($state.snapshot(this.draft)))
      else localStorage.removeItem(KEY)
    } catch {
      // storage unavailable: the brew lives in memory only
    }
  }

  /**
   * Set up a brew of this bag with the household's own equipment: the brewer asked for, else the one
   * this bag was last brewed with, else this person's usual one. Copies the last brew with that brewer
   * (Brew again) when there is one, else method defaults.
   */
  prepare(
    bagId: string,
    userId: string | null,
    opts: { brewerId?: string | null; method?: string; recipe?: Recipe; freestyle?: boolean } = {},
  ): BrewDraft {
    const last = opts.brewerId || opts.recipe ? undefined : brewAgainSource(brews.rows, bagId, userId, opts.method)
    const want = opts.brewerId
      ? { brewerId: opts.brewerId }
      : opts.recipe
        ? { brewerId: opts.recipe.brewer_id, method: opts.recipe.method }
        : { brewerId: last?.brewer_id, method: last?.method ?? opts.method }
    const brewer = pickBrewer(brewers.rows, brews.rows, userId, want) ?? pickBrewer(brewers.rows, brews.rows, userId, {})
    const method = brewer?.method ?? want.method ?? 'pour_over'

    const source = opts.recipe || opts.freestyle ? undefined : brewAgainSource(brews.rows, bagId, userId, method, brewer?.id)
    let params: BrewParams
    let startedFrom: StartedFrom
    if (opts.recipe) {
      params = paramsOf(opts.recipe)
      startedFrom = 'recipe'
    } else if (source) {
      params = paramsOf(source)
      startedFrom = 'brew_again'
    } else {
      params = defaultParams(method)
      startedFrom = 'freestyle'
    }
    const grinder = pickGrinder(grinders.rows, brews.rows, userId, params.grinder_id)
    params = { ...params, method, brewer_id: brewer?.id ?? null, grinder_id: grinder?.id ?? null }
    this.draft = {
      id: uuidv7(),
      bagId,
      brewerUserId: userId,
      params,
      recipeId: opts.recipe?.id ?? source?.recipe_id ?? null,
      recipeVersion: opts.recipe?.version ?? source?.recipe_version ?? null,
      startedFrom,
      phase: 'setup',
      startedAt: null,
      stoppedAt: null,
      laps: [],
      drinkers: [],
    }
    this.save()
    return this.draft
  }

  update(patch: Partial<BrewParams>) {
    if (!this.draft) return
    this.draft.params = { ...this.draft.params, ...patch }
    this.save()
  }

  setBrewer(userId: string | null) {
    if (!this.draft) return
    this.draft.brewerUserId = userId
    this.save()
  }

  start() {
    if (!this.draft) return
    this.draft.phase = 'running'
    this.draft.startedAt = Date.now()
    this.draft.laps = []
    this.save()
  }

  elapsedS(now = Date.now()): number {
    const d = this.draft
    if (!d?.startedAt) return 0
    return ((d.stoppedAt ?? now) - d.startedAt) / 1000
  }

  lap() {
    if (!this.draft || this.draft.phase !== 'running') return
    this.draft.laps = [...this.draft.laps, Math.round(this.elapsedS() * 10) / 10]
    this.save()
  }

  /** Stop the timer and suggest who's drinking: whoever drank this person's last brew, else just them. */
  stop() {
    const d = this.draft
    if (!d) return
    // A brew set up before this device had a person (e.g. right after install) belongs to whoever finishes it
    d.brewerUserId ??= device.userId
    d.stoppedAt = d.startedAt ? Date.now() : null
    d.phase = 'stopped'
    const time = Math.round(this.elapsedS())
    if (d.startedAt) d.params = { ...d.params, time_s: time }
    d.drinkers = suggestDrinkers(brews.rows, brewTasters.rows, d.brewerUserId)
    this.save()
  }

  toggleDrinker(userId: string) {
    const d = this.draft
    if (!d) return
    d.drinkers = d.drinkers.includes(userId) ? d.drinkers.filter((u) => u !== userId) : [...d.drinkers, userId]
    this.save()
  }

  /** Save the brew and who's drinking. Returns the saved brew's id. */
  async finish(): Promise<string> {
    const d = $state.snapshot(this.draft)
    if (!d) throw new Error('no brew in progress')
    const p = d.params
    await mutate('brew', d.id, {
      bag_id: d.bagId,
      brewer_user_id: d.brewerUserId ?? device.userId,
      method: p.method,
      brewer_id: p.brewer_id,
      grinder_id: p.grinder_id,
      grind_setting: p.grind_setting,
      dose_g: p.dose_g,
      water_g: p.water_g,
      yield_g: p.yield_g,
      temp_c: p.temp_c,
      time_s: p.time_s,
      steps: p.steps,
      laps: d.laps.length ? d.laps : null,
      extras: null,
      recipe_id: d.recipeId,
      recipe_version: d.recipeVersion,
      started_from: d.startedFrom,
      brewed_at: nowIso(),
      note: null,
    })
    for (const u of d.drinkers) await mutate('brew_taster', `${d.id}:${u}`, { brew_id: d.id, user_id: u })
    this.draft = null
    this.save()
    return d.id
  }

  discard() {
    this.draft = null
    this.save()
  }

  restore(draft: BrewDraft) {
    this.draft = draft
    this.save()
  }
}

/** Undo a just-saved brew (and its drinkers). */
export async function undoBrew(brewId: string, drinkers: string[]): Promise<void> {
  for (const u of drinkers) await remove('brew_taster', `${brewId}:${u}`)
  await remove('brew', brewId)
}

export const brewState = new BrewState()
