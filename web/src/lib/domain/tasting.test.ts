import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMP_BANDS } from './tempBand'
import { brewMatches, cycleBand, latestTastings, overallLabel, pendingCups, pendingTastings, stepName, toggleTag, PROFILE } from './tasting'
import type { Brew, Brewer, Tasting } from './types'

const NOW = Date.parse('2026-10-24T09:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

const brew = (id: string, minAgo: number): Brew =>
  ({ id, bag_id: 'bag', brewed_at: ago(minAgo), method: 'pour_over', created_at: ago(minAgo), updated_at: ago(minAgo), deleted_at: null }) as Brew

const tasting = (brewId: string, user: string, minAgo: number, band: Tasting['temp_band'], overall = 4): Tasting =>
  ({ id: `${brewId}-${user}-${minAgo}`, brew_id: brewId, taster_id: user, rated_at: ago(minAgo), temp_band: band, overall }) as Tasting

const cards = (brews: Brew[], tastings: Tasting[], user = 'ana') => pendingTastings(brews, tastings, NOW, DEFAULT_TEMP_BANDS, user)

describe('pendingTastings', () => {
  it('lists recent cups for anyone, whoever brewed them, with the band suggested from minutes since brewing', () => {
    const out = cards([{ ...brew('a', 3), brewer_user_id: 'bo' }, brew('b', 14)], [])
    expect(out.map((c) => [c.brew.id, c.state, c.suggested, Math.round(c.minutes)])).toEqual([
      ['a', 'new', 'hot', 3],
      ['b', 'new', 'warm', 14],
    ])
    expect(cards([brew('a', 3)], [], 'bo').map((c) => c.key)).toEqual(['a:bo'])
  })

  it("shows a person's latest rating and count; others' ratings don't count as theirs", () => {
    const ratings = [tasting('a', 'ana', 12, 'hot', 3), tasting('a', 'ana', 2, 'hot', 4), tasting('a', 'bo', 5, 'warm')]
    const [c] = cards([brew('a', 20)], ratings)
    expect([c.state, c.last?.overall, c.count]).toEqual(['rated', 4, 2])
    expect(cards([brew('a', 20)], ratings, 'cy')[0].state).toBe('new')
  })

  it('puts cups still to rate before rated ones', () => {
    const out = cards([brew('a', 8), brew('b', 20)], [tasting('a', 'ana', 6, 'hot')])
    expect(out.map((c) => [c.brew.id, c.state])).toEqual([
      ['b', 'new'],
      ['a', 'rated'],
    ])
  })

  it("leaves out cups the person dismissed, and only theirs", () => {
    const dismissed = [{ brew_id: 'a', user_id: 'ana' }]
    expect(pendingTastings([brew('a', 3), brew('b', 5)], [], NOW, DEFAULT_TEMP_BANDS, 'ana', dismissed).map((c) => c.brew.id)).toEqual(['b'])
    expect(pendingTastings([brew('a', 3)], [], NOW, DEFAULT_TEMP_BANDS, 'bo', dismissed).map((c) => c.brew.id)).toEqual(['a'])
  })

  it('keeps unrated cups half a day and rated ones two hours on the list', () => {
    expect(cards([brew('a', 11 * 60)], []).length).toBe(1)
    expect(cards([brew('a', 13 * 60)], [])).toEqual([])
    expect(cards([brew('a', 100)], [tasting('a', 'ana', 90, 'hot')]).length).toBe(1)
    expect(cards([brew('a', 150)], [tasting('a', 'ana', 140, 'hot')])).toEqual([])
  })
})

describe('pendingCups', () => {
  it("lists each recent cup once with everyone's latest rating", () => {
    const ratings = [tasting('a', 'ana', 9, 'hot', 3), tasting('a', 'ana', 1, 'warm', 5), tasting('a', 'bo', 4, 'hot', 2)]
    const [c, d] = pendingCups([brew('a', 10), brew('b', 30)], ratings, NOW, DEFAULT_TEMP_BANDS)
    expect(c.brew.id).toBe('a')
    expect([...c.latest].map(([u, t]) => [u, t.overall])).toEqual([
      ['ana', 5],
      ['bo', 2],
    ])
    expect([d.brew.id, d.latest.size, d.suggested]).toEqual(['b', 0, 'cool'])
    expect(pendingCups([brew('a', 150)], [tasting('a', 'bo', 140, 'hot')], NOW, DEFAULT_TEMP_BANDS)).toEqual([])
  })

  it("marks who isn't drinking a cup, and drops it once everyone has dismissed it", () => {
    const d = [{ brew_id: 'a', user_id: 'ana' }]
    const [c] = pendingCups([brew('a', 10)], [], NOW, DEFAULT_TEMP_BANDS, d, ['ana', 'bo'])
    expect([...c.dismissed]).toEqual(['ana'])
    expect(pendingCups([brew('a', 10)], [], NOW, DEFAULT_TEMP_BANDS, [...d, { brew_id: 'a', user_id: 'bo' }], ['ana', 'bo'])).toEqual([])
  })

  it('keeps every rating separate, even two at the same temperature', () => {
    const latest = latestTastings([tasting('a', 'ana', 9, 'hot', 3), tasting('a', 'ana', 4, 'hot', 4)])
    expect(latest.get('a:ana')?.overall).toBe(4)
  })
})

describe('brewMatches', () => {
  const v60 = { id: 'v60', method: 'pour_over' } as Brewer
  const dedica = { id: 'dedica', method: 'espresso' } as Brewer
  const any = { brewedBy: 'any', brewer: 'any', grinder: 'any' }
  const b = (patch: Partial<Brew>) => ({ ...brew('a', 5), brewer_user_id: 'bo', brewer_id: 'v60', grinder_id: 'c40', ...patch }) as Brew

  it('filters by who brewed it, brewer and grinder', () => {
    expect(brewMatches(b({}), any, [v60])).toBe(true)
    expect(brewMatches(b({}), { ...any, brewedBy: 'bo' }, [v60])).toBe(true)
    expect(brewMatches(b({}), { ...any, brewedBy: 'ana' }, [v60])).toBe(false)
    expect(brewMatches(b({}), { ...any, brewer: 'dedica' }, [v60, dedica])).toBe(false)
    expect(brewMatches(b({}), { ...any, grinder: 'c40', brewer: 'v60' }, [v60])).toBe(true)
    expect(brewMatches(b({}), { ...any, grinder: 'df64' }, [v60])).toBe(false)
  })

  it('matches older brews without a brewer by their method', () => {
    expect(brewMatches(b({ brewer_id: null }), { ...any, brewer: 'v60' }, [v60, dedica])).toBe(true)
    expect(brewMatches(b({ brewer_id: null }), { ...any, brewer: 'dedica' }, [v60, dedica])).toBe(false)
  })
})

describe('labels and scales', () => {
  it('names the stars', () => {
    expect([1, 2, 3, 4, 5].map(overallLabel)).toEqual(["Wouldn't finish", 'Meh', 'Good', 'Great', 'Memorable'])
    expect(overallLabel(null)).toBe('')
  })

  it('cycles the temperature chip', () => {
    expect([cycleBand('hot'), cycleBand('warm'), cycleBand('cool')]).toEqual(['warm', 'cool', 'hot'])
  })

  it('has words only at 1, 3 and 5', () => {
    expect([1, 2, 3, 4, 5].map((n) => stepName(PROFILE[1], n))).toEqual(['Low', '2 of 5', 'Medium', '4 of 5', 'High'])
  })
})

describe('toggleTag', () => {
  it('records whether a tag confirms the roaster or was found by the taster', () => {
    let tags = toggleTag(null, 'blueberry', ['blueberry', 'cocoa'])
    tags = toggleTag(tags, 'jasmine', ['blueberry', 'cocoa'])
    expect(tags).toEqual([
      { tag: 'blueberry', source: 'roaster' },
      { tag: 'jasmine', source: 'tasted' },
    ])
    expect(toggleTag(tags, 'blueberry', [])).toEqual([{ tag: 'jasmine', source: 'tasted' }])
  })
})
