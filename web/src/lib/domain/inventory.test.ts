import { describe, expect, it } from 'vitest'
import { tagsFromNotes } from './flavors'
import { DEFAULT_REST_WINDOW, buildBagViews, compareSmart, sectionOf, type InventoryRows } from './inventory'
import { parseRoastDate, parseWeightGrams } from './parse'
import { AliasIndex, EMPTY_FILTER, buildIndex, canonicalize, editDistance, facetCounts, matchesFilter, search } from './search'
import type { Bag, BagEvent, Coffee, Roaster } from './types'

const NOW = new Date('2026-10-24T12:00:00Z')
const base = { created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null }

function bag(id: string, over: Partial<Bag> = {}): Bag {
  return { ...base, id, coffee_id: `c-${id}`, roast_date: '2026-10-10', weight_g: 250, price: null, purchased_at: null, review_state: 'reviewed', ...over }
}
function coffee(id: string, over: Partial<Coffee> = {}): Coffee {
  return {
    ...base, id: `c-${id}`, roaster_id: 'r1', name: id, origin: 'Kenya, Nyeri', producer: null, variety: null,
    process: 'Washed', roast_level: 'Light', altitude: null, tasting_notes: null, flavor_tags: null, notes: null, ...over,
  }
}
function ev(bag_id: string, kind: BagEvent['kind'], at: string, grams_delta: number | null = null): BagEvent {
  return { ...base, id: `${bag_id}-${kind}-${at}`, bag_id, kind, at, grams_delta, user_id: null }
}
const roaster: Roaster = { ...base, id: 'r1', name: 'Onyx', aliases: null }

function views(rows: Partial<InventoryRows>) {
  return buildBagViews(
    { bags: [], coffees: [], roasters: [roaster], events: [], photos: [], ...rows },
    { now: NOW, rest: DEFAULT_REST_WINDOW, doseG: 15 },
  )
}

describe('bag state and freshness', () => {
  it('derives resting / ready / open / frozen / finished', () => {
    const vs = views({
      bags: [
        bag('resting', { roast_date: '2026-10-20' }),
        bag('ready'),
        bag('open'),
        bag('frozen'),
        bag('done'),
        bag('fading', { roast_date: '2026-08-01' }),
      ],
      events: [
        ev('open', 'opened', '2026-10-18T08:00:00Z'),
        ev('frozen', 'frozen', '2026-10-12T08:00:00Z'),
        ev('done', 'opened', '2026-10-12T08:00:00Z'),
        ev('done', 'finished', '2026-10-20T08:00:00Z'),
      ],
    })
    const by = Object.fromEntries(vs.map((v) => [v.id, v]))
    expect(by.resting).toMatchObject({ state: 'resting', freshness: 'resting', readyInDays: 3 })
    expect(by.ready).toMatchObject({ state: 'ready', freshness: 'peak', ageDays: 14 })
    expect(by.open.state).toBe('open')
    expect(by.frozen).toMatchObject({ state: 'frozen', freshness: null, frozenDays: 12 })
    expect(by.done.state).toBe('finished')
    expect(by.fading.freshness).toBe('fading')
  })

  it('subtracts time in the freezer from the age', () => {
    const [v] = views({
      bags: [bag('b', { roast_date: '2026-09-24' })],
      events: [ev('b', 'frozen', '2026-09-30T12:00:00Z'), ev('b', 'thawed', '2026-10-20T12:00:00Z')],
    })
    expect(v.ageDays).toBe(30 - 20)
    expect(v.state).toBe('ready')
  })

  it('computes grams and cups left with manual adjustments; asks before finishing', () => {
    const [v] = views({ bags: [bag('b', { weight_g: 250 })], events: [ev('b', 'adjust', '2026-10-20T00:00:00Z', -230)] })
    expect(v).toMatchObject({ gramsLeft: 20, cupsLeft: 1, lastCup: true, askFinished: false })
    const [w] = views({ bags: [bag('b', { weight_g: 10 })] })
    expect(w.askFinished).toBe(true)
  })

  it('puts needs-review bags in their own section on the phone only', () => {
    const [v] = views({ bags: [bag('n', { review_state: 'needs_review', coffee_id: null })] })
    expect(v.title).toMatch(/^Untitled · /)
    expect(sectionOf(v, 'phone')).toBe('needs_review')
    expect(sectionOf(v, 'station')).toBe('ready')
  })

  it('sorts open bags emptiest first and resting bags soonest ready first', () => {
    const vs = views({
      bags: [bag('a', { weight_g: 200 }), bag('b', { weight_g: 50 }), bag('r1', { roast_date: '2026-10-22' }), bag('r2', { roast_date: '2026-10-19' })],
      events: [ev('a', 'opened', '2026-10-20T00:00:00Z'), ev('b', 'opened', '2026-10-20T00:00:00Z')],
    })
    const open = vs.filter((v) => v.state === 'open').sort((x, y) => compareSmart('open', x, y))
    const resting = vs.filter((v) => v.state === 'resting').sort((x, y) => compareSmart('resting', x, y))
    expect(open.map((v) => v.id)).toEqual(['b', 'a'])
    expect(resting.map((v) => v.id)).toEqual(['r2', 'r1'])
  })
})

describe('search', () => {
  const aliases = new AliasIndex([
    { alias: 'geisha', canonical: 'Gesha' },
    { alias: 'dry process', canonical: 'Natural' },
  ])
  const vs = views({
    bags: [bag('kii'), bag('panama'), bag('cafe')],
    coffees: [
      coffee('kii', { name: 'Kii AA', variety: 'SL28, SL34', tasting_notes: ['blackcurrant', 'grapefruit'], flavor_tags: ['blackcurrant'] }),
      coffee('panama', { name: 'Janson', origin: 'Panama, Volcán', variety: 'Geisha', process: 'Natural', producer: 'Janson Family' }),
      coffee('cafe', { name: 'Café de Altura', origin: 'Colombia', notes: 'decaf, sugarcane' }),
    ],
  })
  const index = buildIndex(vs, aliases)
  const ids = (q: string) => [...(search(index, q) ?? new Map()).keys()].sort()

  it('matches prefixes across fields, all words required', () => {
    expect(ids('ony')).toEqual(['cafe', 'kii', 'panama'])
    expect(ids('kenya kii')).toEqual(['kii'])
    expect(ids('kenya janson')).toEqual([])
  })

  it('ignores accents and expands aliases both ways', () => {
    expect(ids('cafe')).toEqual(['cafe'])
    expect(ids('volcan')).toEqual(['panama'])
    expect(ids('gesha')).toEqual(['panama'])
    expect(ids('dry process')).toEqual(['panama'])
  })

  it('allows one typo in longer words only', () => {
    expect(ids('jasnon')).toEqual([]) // transposition = 2 edits
    expect(ids('jamson')).toEqual(['panama'])
    expect(ids('kix')).toEqual([])
  })

  it('reports why a bag matched when the field is not on the tile', () => {
    expect(search(index, 'gesha')!.get('panama')!.why).toEqual({ field: 'variety', text: 'Geisha' })
    expect(search(index, 'blackcur')!.get('kii')!.why?.field).toBe('flavor')
    expect(search(index, 'onyx')!.get('kii')!.why).toBeNull()
  })

  it('ranks name / roaster matches above other fields', () => {
    const hits = search(index, 'janson')!
    expect(hits.get('panama')!.score).toBe(3)
  })

  it('returns null for an empty query', () => {
    expect(search(index, '  ')).toBeNull()
  })

  it('edit distance helper', () => {
    expect(editDistance('natural', 'natrual')).toBe(2)
    expect(editDistance('washed', 'washd')).toBe(1)
  })
})

describe('filters', () => {
  const vs = views({
    bags: [bag('a'), bag('b'), bag('c', { roast_date: '2026-10-22' })],
    coffees: [
      coffee('a', { flavor_tags: ['blueberry'], process: 'Natural' }),
      coffee('b', { flavor_tags: ['dark_chocolate'], origin: 'Brazil' }),
      coffee('c', { flavor_tags: ['jasmine'] }),
    ],
  })

  it('ORs within a group and ANDs across groups', () => {
    const pick = (f: Partial<typeof EMPTY_FILTER>) => vs.filter((v) => matchesFilter(v, { ...EMPTY_FILTER, ...f })).map((v) => v.id)
    expect(pick({ families: ['fruity', 'floral'] })).toEqual(['a', 'c'])
    expect(pick({ families: ['fruity', 'floral'], states: ['ready'] })).toEqual(['a'])
    expect(pick({ country: ['Kenya'] })).toEqual(['a', 'c'])
  })

  it('counts facet values with the other filters applied', () => {
    expect(facetCounts(vs, EMPTY_FILTER, 'country')).toEqual([['Kenya', 2], ['Brazil', 1]])
    expect(facetCounts(vs, { ...EMPTY_FILTER, families: ['chocolate_nuts'] }, 'country')).toEqual([['Brazil', 1]])
  })
})

describe('label parsing', () => {
  it('parses weights', () => {
    expect(['250g', '250 G', 'Net wt 1kg', '12 oz', '0,5 kg', 'two fifty'].map(parseWeightGrams)).toEqual([250, 250, 1000, 340, 500, null])
  })

  it('parses roast dates', () => {
    expect(parseRoastDate('Roasted 2026-10-03')).toBe('2026-10-03')
    expect(parseRoastDate('03.10.2026')).toBe('2026-10-03') // day first
    expect(parseRoastDate('10/23/26')).toBe('2026-10-23') // unambiguous month first
    expect(parseRoastDate('3 Oct 2026')).toBe('2026-10-03')
    expect(parseRoastDate('October 3rd, 2026')).toBe('2026-10-03')
    expect(parseRoastDate('31/02/2026')).toBeNull()
    expect(parseRoastDate('soon')).toBeNull()
  })

  it('maps roaster notes to the flavor vocabulary', () => {
    expect(tagsFromNotes(['Blood orange', 'dark chocolate', 'Jasmine tea']).sort()).toEqual(['dark_chocolate', 'jasmine', 'orange'])
    expect(tagsFromNotes(['Crème brûlée'])).toEqual([])
  })

  it('canonicalizes known aliases', () => {
    const aliases = [{ kind: 'process' as const, alias: 'fully washed', canonical: 'Washed' }]
    expect(canonicalize(' Fully Washed ', aliases, 'process')).toBe('Washed')
    expect(canonicalize('Honey', aliases, 'process')).toBe('Honey')
  })
})
