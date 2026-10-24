import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMP_BANDS } from './tempBand'
import { compassHint, cycleBand, overallLabel, pendingTastings, stepName, toggleTag, PROFILE } from './tasting'
import type { Brew, Tasting } from './types'

const NOW = Date.parse('2026-10-24T09:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

const brew = (id: string, minAgo: number): Brew =>
  ({ id, bag_id: 'bag', brewed_at: ago(minAgo), method: 'pour_over', created_at: ago(minAgo), updated_at: ago(minAgo), deleted_at: null }) as Brew

const tasting = (brewId: string, user: string, minAgo: number, band: Tasting['temp_band'], overall = 4): Tasting =>
  ({ id: `${brewId}-${user}-${minAgo}`, brew_id: brewId, taster_id: user, rated_at: ago(minAgo), temp_band: band, overall }) as Tasting

const cards = (brews: Brew[], tastings: Tasting[], tasters = brews.map((b) => ({ brew_id: b.id, user_id: 'ana' }))) =>
  pendingTastings(brews, tasters, tastings, NOW, DEFAULT_TEMP_BANDS)

describe('pendingTastings', () => {
  it('lists unrated cups with the band suggested from minutes since brewing, newest first', () => {
    const out = cards([brew('a', 3), brew('b', 14)], [])
    expect(out.map((c) => [c.brew.id, c.state, c.suggested, Math.round(c.minutes)])).toEqual([
      ['a', 'new', 'hot', 3],
      ['b', 'new', 'warm', 14],
    ])
  })

  it('makes one card per drinker and can narrow to one person', () => {
    const tasters = [
      { brew_id: 'a', user_id: 'ana' },
      { brew_id: 'a', user_id: 'bo' },
    ]
    expect(cards([brew('a', 3)], [], tasters).map((c) => c.userId)).toEqual(['ana', 'bo'])
    expect(pendingTastings([brew('a', 3)], tasters, [], NOW, DEFAULT_TEMP_BANDS, 'bo').map((c) => c.userId)).toEqual(['bo'])
  })

  it('keeps a just-rated cup editable for 5 minutes', () => {
    const [c] = cards([brew('a', 8)], [tasting('a', 'ana', 4, 'hot')])
    expect(c.state).toBe('editing')
    expect(c.last?.overall).toBe(4)
  })

  it('mutes a rated cup until it cools into the next band, then brings it back', () => {
    const [waiting] = cards([brew('a', 8)], [tasting('a', 'ana', 6, 'hot')])
    expect([waiting.state, waiting.nextBand]).toEqual(['waiting', 'warm'])
    const [again] = cards([brew('a', 14)], [tasting('a', 'ana', 10, 'hot')])
    expect([again.state, again.suggested]).toEqual(['again', 'warm'])
  })

  it('follows the band the taster chose, not the suggestion', () => {
    // Rated at 4 min but it felt warm already: no "Warm now" prompt at 14 min
    const [c] = cards([brew('a', 14)], [tasting('a', 'ana', 10, 'warm')])
    expect([c.state, c.nextBand]).toEqual(['waiting', 'cool'])
  })

  it('drops the card once a cool tasting is out of its edit window', () => {
    expect(cards([brew('a', 40)], [tasting('a', 'ana', 10, 'cool')])).toEqual([])
    expect(cards([brew('a', 40)], [tasting('a', 'ana', 2, 'cool')])[0].state).toBe('editing')
  })

  it('puts muted cards after the ones to rate now', () => {
    const out = cards([brew('a', 8), brew('b', 20)], [tasting('a', 'ana', 6, 'hot')])
    expect(out.map((c) => [c.brew.id, c.state])).toEqual([
      ['b', 'new'],
      ['a', 'waiting'],
    ])
  })

  it('uses the latest of several tastings', () => {
    const [c] = cards([brew('a', 30)], [tasting('a', 'ana', 25, 'hot', 3), tasting('a', 'ana', 12, 'warm', 4)])
    expect([c.state, c.last?.overall]).toEqual(['again', 4])
  })

  it('stops asking after a while', () => {
    expect(cards([brew('a', 13 * 60)], [])).toEqual([])
    expect(cards([brew('a', 150)], [tasting('a', 'ana', 140, 'hot')])).toEqual([])
  })

  it('ignores drinkers of deleted brews', () => {
    expect(cards([], [], [{ brew_id: 'gone', user_id: 'ana' }])).toEqual([])
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

  it('turns the compass into a dial-in hint', () => {
    expect(compassHint(1, 2)).toMatch(/^Sour: grind finer/)
    expect(compassHint(5, null)).toMatch(/^Bitter: grind coarser/)
    expect(compassHint(3, 1)).toMatch(/^Weak/)
    expect(compassHint(3, 3)).toBeNull()
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
