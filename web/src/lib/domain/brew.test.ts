import { describe, expect, it } from 'vitest'
import {
  brewAgainShortcuts,
  brewAgainSource,
  cuesBetween,
  formatClock,
  gramsUsedByBag,
  lastDoseByBag,
  latestRecipes,
  nextVersion,
  paramSummary,
  parseSteps,
  ratio,
  stepGrind,
  stepsToText,
  timerView,
  defaultParams,
  suggestDrinkers,
} from './brew'
import type { Brew, Recipe } from './types'

const base = { created_at: '', updated_at: '', deleted_at: null }
let n = 0
function brew(bag_id: string, user: string, method: string, day: number, dose = 15): Brew {
  return {
    ...base, id: `br${++n}`, bag_id, brewer_user_id: user, method, brewer_id: null, grinder_id: null, grind_setting: '22',
    dose_g: dose, water_g: 250, yield_g: null, temp_c: 94, time_s: 180, steps: [], laps: null, extras: null,
    recipe_id: null, recipe_version: null, started_from: 'freestyle', brewed_at: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`, note: null,
  }
}

describe('brew again', () => {
  const brews = [
    brew('kii', 'ana', 'pour_over', 10),
    brew('kii', 'eugene', 'pour_over', 12),
    brew('kii', 'eugene', 'espresso', 14, 18),
    brew('gesha', 'eugene', 'pour_over', 20),
    brew('kii', 'ana', 'pour_over', 21),
  ]

  it("prefers this person's last brew of the bag and method", () => {
    expect(brewAgainSource(brews, 'kii', 'eugene', 'pour_over')?.brewed_at).toContain('10-12')
    expect(brewAgainSource(brews, 'kii', 'eugene')?.brewed_at).toContain('10-14')
  })

  it("falls back to anyone's brew of the bag, then the person's last brew of the method", () => {
    expect(brewAgainSource(brews, 'kii', 'zoe', 'pour_over')?.brewer_user_id).toBe('ana')
    expect(brewAgainSource(brews, 'new-bag', 'eugene', 'pour_over')?.bag_id).toBe('gesha')
    expect(brewAgainSource(brews, 'new-bag', 'eugene')).toBeUndefined()
  })

  it('lists distinct recent bag × method shortcuts for usable bags', () => {
    const s = brewAgainShortcuts(brews, 'eugene', (id) => id !== 'gesha')
    expect(s.map((x) => `${x.bagId}:${x.brew.method}`)).toEqual(['kii:espresso', 'kii:pour_over'])
  })

  it('totals grams used and remembers the last dose per bag', () => {
    expect(gramsUsedByBag(brews).get('kii')).toBe(15 + 15 + 18 + 15)
    expect(lastDoseByBag(brews).get('kii')).toBe(15)
  })
})

describe('recipes', () => {
  const r = (root: string, version: number, name: string): Recipe =>
    ({ ...base, id: `${root}v${version}`, root_id: root, version, name, ...defaultParams('pour_over'), steps: [], note: null, author_id: null }) as Recipe
  it('shows only the latest version of each recipe', () => {
    const rows = [r('a', 1, 'Daily'), r('a', 2, 'Daily v2'), r('b', 1, 'Aero')]
    expect(latestRecipes(rows).map((x) => x.id)).toEqual(['bv1', 'av2'])
    expect(nextVersion(rows, 'a')).toBe(3)
    expect(nextVersion(rows, 'new')).toBe(1)
  })
})

describe('timer', () => {
  const steps = [
    { label: 'Bloom', at_s: 0, to_g: 50 },
    { label: 'Pour', at_s: 45, to_g: 150 },
    { label: 'Pour', at_s: 90, to_g: 250 },
    { note: 'swirl' },
  ]
  it('finds the current step and the countdown to the next cue', () => {
    expect(timerView(steps, 10)).toMatchObject({ current: { label: 'Bloom' }, next: { at_s: 45 }, nextInS: 35 })
    expect(timerView(steps, 100)).toMatchObject({ current: { at_s: 90 }, next: null, nextInS: null })
    expect(timerView([], 5)).toEqual({ current: null, next: null, nextInS: null })
  })
  it('reports each cue once across ticks', () => {
    expect(cuesBetween(steps, 44.6, 45.1)).toEqual([45])
    expect(cuesBetween(steps, 45.1, 46)).toEqual([])
    expect(cuesBetween(steps, -1, 0.5)).toEqual([]) // no beep for the step at Start
  })
  it('formats the clock', () => {
    expect([0, 9.9, 65, 600].map(formatClock)).toEqual(['0:00', '0:09', '1:05', '10:00'])
  })
})

describe('params', () => {
  it('summarizes filter and espresso params', () => {
    expect(paramSummary({ ...defaultParams('pour_over'), grind_setting: '22' })).toBe('15 g · 250 g · 22 · 94°')
    expect(paramSummary({ ...defaultParams('espresso'), grind_setting: '9' })).toBe('18 g → 36 g · 28 s · 9 · 93°')
    expect(ratio(defaultParams('pour_over'))).toBe('1:16.7')
    expect(ratio(defaultParams('espresso'))).toBe('1:2')
  })
  it('steps numeric grind settings and leaves others alone', () => {
    expect(stepGrind('22', 1)).toBe('23')
    expect(stepGrind('3.5', -1)).toBe('3.4')
    expect(stepGrind('0', -1)).toBe('0')
    expect(stepGrind('2.3.1', 1)).toBe('2.3.1')
    expect(stepGrind(null, 1)).toBe('1')
  })
  it('parses typed steps and writes them back', () => {
    const steps = parseSteps('0:00 Bloom 50g\n0:45 pour to 150 g\nswirl gently')
    expect(steps).toEqual([{ at_s: 0, to_g: 50, label: 'Bloom' }, { at_s: 45, to_g: 150, label: 'pour' }, { label: 'swirl gently' }])
    expect(stepsToText(steps)).toBe('0:00 Bloom 50g\n0:45 pour 150g\nswirl gently')
  })
})

describe('who is drinking', () => {
  it("suggests whoever drank the brewer's last brew, else the brewer", () => {
    const brews = [brew('kii', 'eugene', 'pour_over', 1), brew('kii', 'eugene', 'pour_over', 2), brew('kii', 'ana', 'pour_over', 3)]
    const last = brews[1]
    const tasters = [
      { brew_id: brews[0].id, user_id: 'zoe' },
      { brew_id: last.id, user_id: 'eugene' },
      { brew_id: last.id, user_id: 'ana' },
    ]
    expect(suggestDrinkers(brews, tasters, 'eugene').sort()).toEqual(['ana', 'eugene'])
    expect(suggestDrinkers(brews, [], 'ana')).toEqual(['ana'])
    expect(suggestDrinkers([], [], null)).toEqual([])
  })
})
