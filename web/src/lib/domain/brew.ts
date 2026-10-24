// Brewing logic: methods and their defaults, "Brew again", shortcuts, recipe versions, timer steps.
import type { Brew, BrewParams, Recipe, RecipeStep } from './types'

export const METHODS = ['pour_over', 'switch', 'aeropress', 'espresso', 'siphon', 'other'] as const
export type Method = (typeof METHODS)[number]

export const METHOD_LABELS: Record<Method, string> = {
  pour_over: 'Pour-over',
  switch: 'Hario Switch',
  aeropress: 'AeroPress',
  espresso: 'Espresso',
  siphon: 'Siphon',
  other: 'Other',
}

export function methodLabel(m: string | null | undefined): string {
  return METHOD_LABELS[(m ?? 'other') as Method] ?? 'Other'
}

export const isEspresso = (m: string | null | undefined) => m === 'espresso'

/** Starting point for a freestyle brew with nothing to copy. */
export function defaultParams(method: string): BrewParams {
  const base = { method, brewer_id: null, grinder_id: null, grind_setting: null, steps: [] }
  if (isEspresso(method)) return { ...base, dose_g: 18, water_g: null, yield_g: 36, temp_c: 93, time_s: 28 }
  if (method === 'aeropress') return { ...base, dose_g: 15, water_g: 230, yield_g: null, temp_c: 90, time_s: null }
  return { ...base, dose_g: 15, water_g: 250, yield_g: null, temp_c: 94, time_s: null }
}

export function paramsOf(src: Brew | Recipe): BrewParams {
  return {
    method: src.method,
    brewer_id: src.brewer_id,
    grinder_id: src.grinder_id,
    grind_setting: src.grind_setting,
    dose_g: src.dose_g,
    water_g: src.water_g,
    yield_g: src.yield_g,
    temp_c: src.temp_c,
    time_s: src.time_s,
    steps: src.steps ?? [],
  }
}

const newestFirst = (a: Brew, b: Brew) => b.brewed_at.localeCompare(a.brewed_at)

/**
 * "Brew again" source: this person's last brew of this bag (with this method, if given),
 * else anyone's last brew of this bag, else this person's last brew of the method on any bag.
 */
export function brewAgainSource(brews: Brew[], bagId: string, userId: string | null, method?: string): Brew | undefined {
  const sorted = [...brews].sort(newestFirst)
  const sameMethod = (b: Brew) => !method || b.method === method
  return (
    sorted.find((b) => b.bag_id === bagId && sameMethod(b) && b.brewer_user_id === userId) ??
    sorted.find((b) => b.bag_id === bagId && sameMethod(b)) ??
    (method ? sorted.find((b) => b.method === method && b.brewer_user_id === userId) : undefined)
  )
}

export interface Shortcut {
  bagId: string
  brew: Brew
}

/** The person's most recent distinct bag × method brews, for bags still in use. */
export function brewAgainShortcuts(brews: Brew[], userId: string | null, isUsable: (bagId: string) => boolean, max = 3): Shortcut[] {
  const seen = new Set<string>()
  const out: Shortcut[] = []
  for (const b of [...brews].sort(newestFirst)) {
    if (b.brewer_user_id !== userId || !isUsable(b.bag_id)) continue
    const key = `${b.bag_id}:${b.method}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ bagId: b.bag_id, brew: b })
    if (out.length === max) break
  }
  return out
}

/** Who's drinking, prefilled: whoever drank this person's last brew, else just them. */
export function suggestDrinkers(allBrews: Brew[], tasters: { brew_id: string; user_id: string }[], brewerUserId: string | null): string[] {
  const last = allBrews.filter((b) => b.brewer_user_id === brewerUserId).sort(newestFirst)[0]
  const prev = last ? tasters.filter((t) => t.brew_id === last.id).map((t) => t.user_id) : []
  return prev.length ? prev : brewerUserId ? [brewerUserId] : []
}

/** Grams used per bag, for "grams left". */
export function gramsUsedByBag(brews: Brew[]): Map<string, number> {
  const used = new Map<string, number>()
  for (const b of brews) if (b.dose_g) used.set(b.bag_id, (used.get(b.bag_id) ?? 0) + b.dose_g)
  return used
}

/** Most recent dose per bag, for "cups left". */
export function lastDoseByBag(brews: Brew[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const b of [...brews].sort(newestFirst)) if (b.dose_g && !last.has(b.bag_id)) last.set(b.bag_id, b.dose_g)
  return last
}

/** Latest version of each recipe (rows are immutable versions sharing a root_id). */
export function latestRecipes(recipes: Recipe[]): Recipe[] {
  const latest = new Map<string, Recipe>()
  for (const r of recipes) {
    const cur = latest.get(r.root_id)
    if (!cur || r.version > cur.version) latest.set(r.root_id, r)
  }
  return [...latest.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

export function nextVersion(recipes: Recipe[], rootId: string): number {
  return Math.max(0, ...recipes.filter((r) => r.root_id === rootId).map((r) => r.version)) + 1
}

/** "15 g · 250 g · 22 · 94°" (espresso: "18 g → 36 g · 28 s · 22 · 93°"). */
export function paramSummary(p: BrewParams): string {
  const parts: string[] = []
  if (isEspresso(p.method)) {
    parts.push([p.dose_g != null ? `${p.dose_g} g` : null, p.yield_g != null ? `${p.yield_g} g` : null].filter(Boolean).join(' → '))
    if (p.time_s != null) parts.push(`${p.time_s} s`)
  } else {
    if (p.dose_g != null) parts.push(`${p.dose_g} g`)
    if (p.water_g != null) parts.push(`${p.water_g} g`)
  }
  if (p.grind_setting) parts.push(p.grind_setting)
  if (p.temp_c != null) parts.push(`${p.temp_c}°`)
  return parts.filter(Boolean).join(' · ')
}

export function ratio(p: BrewParams): string | null {
  const out = isEspresso(p.method) ? p.yield_g : p.water_g
  if (!p.dose_g || !out) return null
  return `1:${(out / p.dose_g).toFixed(1).replace(/\.0$/, '')}`
}

/** Step a grind setting that looks numeric ("22", "3.5"); anything else ("2.3.1") stays as typed. */
export function stepGrind(setting: string | null, delta: number): string | null {
  if (setting == null || setting === '') return delta > 0 ? String(delta) : null
  if (!/^\d+(\.\d+)?$/.test(setting.trim())) return setting
  const decimals = setting.includes('.') ? setting.split('.')[1].length : 0
  const step = decimals ? 10 ** -decimals : 1
  return Math.max(0, parseFloat(setting) + delta * step).toFixed(decimals)
}

export interface TimerView {
  current: RecipeStep | null
  next: (RecipeStep & { at_s: number }) | null
  nextInS: number | null
}

/** Which recipe step is active at `elapsedS`, and the countdown to the next timed cue. */
export function timerView(steps: RecipeStep[], elapsedS: number): TimerView {
  const timed = steps.filter((s): s is RecipeStep & { at_s: number } => typeof s.at_s === 'number').sort((a, b) => a.at_s - b.at_s)
  let current: RecipeStep | null = null
  let next: (RecipeStep & { at_s: number }) | null = null
  for (const s of timed) {
    if (s.at_s <= elapsedS) current = s
    else {
      next = s
      break
    }
  }
  return { current, next, nextInS: next ? Math.ceil(next.at_s - elapsedS) : null }
}

/** Cue times (seconds) crossed between two timer ticks, to play a sound exactly once per step. */
export function cuesBetween(steps: RecipeStep[], fromS: number, toS: number): number[] {
  return steps.map((s) => s.at_s).filter((t): t is number => typeof t === 'number' && t > 0 && t > fromS && t <= toS)
}

export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Bloom 0:00 → 50 g" style lines for a recipe's steps. */
export function stepLine(s: RecipeStep): string {
  return [s.label, typeof s.at_s === 'number' ? formatClock(s.at_s) : null, s.to_g != null ? `→ ${s.to_g} g` : null, s.note]
    .filter(Boolean)
    .join(' · ')
}

/** Parse "0:00 Bloom 50g" / "1:30 pour to 250" lines typed on the phone into steps. */
export function parseSteps(text: string): RecipeStep[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const step: RecipeStep = {}
      let rest = line
      const time = rest.match(/^(\d+):(\d{2})\s*/)
      if (time) {
        step.at_s = +time[1] * 60 + +time[2]
        rest = rest.slice(time[0].length)
      }
      const grams = rest.match(/(?:→|to)?\s*(\d+(?:\.\d+)?)\s*g\b/i)
      if (grams) {
        step.to_g = parseFloat(grams[1])
        rest = (rest.slice(0, grams.index) + rest.slice(grams.index! + grams[0].length)).trim()
      }
      if (rest) step.label = rest.replace(/\s{2,}/g, ' ')
      return step
    })
}

export function stepsToText(steps: RecipeStep[]): string {
  return steps
    .map((s) => [typeof s.at_s === 'number' ? formatClock(s.at_s) : null, s.label, s.to_g != null ? `${s.to_g}g` : null].filter(Boolean).join(' '))
    .join('\n')
}
