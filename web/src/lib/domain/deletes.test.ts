import { describe, expect, it } from 'vitest'
import { bagCascade, brewCascade, cascadeSentence, type CascadeRows } from './deletes'

const data: CascadeRows = {
  bagEvents: [{ id: 'e1', bag_id: 'kii' }, { id: 'e2', bag_id: 'other' }],
  photos: [{ id: 'p1', bag_id: 'kii' }, { id: 'p2', bag_id: 'kii' }],
  extractions: [{ id: 'kii' }],
  brews: [
    { id: 'b1', bag_id: 'kii', dose_g: 15 },
    { id: 'b2', bag_id: 'kii', dose_g: 16 },
    { id: 'b3', bag_id: 'other', dose_g: 18 },
  ],
  brewTasters: [{ id: 'b1:ana', brew_id: 'b1' }],
  tastings: [
    { id: 't1', brew_id: 'b1' },
    { id: 't2', brew_id: 'b1' },
    { id: 't3', brew_id: 'b2' },
    { id: 't4', brew_id: 'b3' },
  ],
}

describe('deletes', () => {
  it("takes a brew's ratings with it and gives its dose back", () => {
    const c = brewCascade('b1', data)
    expect(c.rows).toEqual([
      { table: 'tasting', id: 't1' },
      { table: 'tasting', id: 't2' },
      { table: 'brew_taster', id: 'b1:ana' },
      { table: 'brew', id: 'b1' },
    ])
    expect([c.ratings, c.grams]).toEqual([2, 15])
    expect(cascadeSentence(c, 'brew')).toBe('This also deletes its 2 ratings.')
  })

  it("takes a bag's brews, their ratings, events, photos and label reading with it, the bag last", () => {
    const c = bagCascade('kii', data)
    expect(c.rows.map((r) => `${r.table}:${r.id}`)).toEqual([
      'tasting:t1', 'tasting:t2', 'tasting:t3', 'brew_taster:b1:ana', 'brew:b1', 'brew:b2',
      'bag_event:e1', 'photo:p1', 'photo:p2', 'extraction:kii', 'bag:kii',
    ])
    expect(cascadeSentence(c, 'bag')).toBe('This also deletes its 2 brews, 3 ratings and 2 photos.')
  })

  it('says nothing extra when nothing else goes', () => {
    expect(cascadeSentence(brewCascade('b9', data), 'brew')).toBe('')
    expect(cascadeSentence(bagCascade('empty', { ...data, photos: [] }), 'bag')).toBe('')
  })
})
