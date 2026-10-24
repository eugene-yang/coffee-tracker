import { describe, expect, it } from 'vitest'
import { clampThresholds, suggestTempBand } from './tempBand'

describe('suggestTempBand', () => {
  it('uses the default thresholds', () => {
    expect([0, 9, 10, 24, 25, 90].map((m) => suggestTempBand(m))).toEqual(['hot', 'hot', 'warm', 'warm', 'cool', 'cool'])
  })

  it('respects custom thresholds', () => {
    expect(suggestTempBand(6, { hot_max_min: 5, warm_max_min: 15 })).toBe('warm')
  })
})

describe('clampThresholds', () => {
  it('keeps hot below warm and within bounds', () => {
    expect(clampThresholds({ hot_max_min: 0, warm_max_min: 0 })).toEqual({ hot_max_min: 1, warm_max_min: 2 })
    expect(clampThresholds({ hot_max_min: 30, warm_max_min: 20 })).toEqual({ hot_max_min: 30, warm_max_min: 31 })
    expect(clampThresholds({ hot_max_min: 500, warm_max_min: 999 })).toEqual({ hot_max_min: 179, warm_max_min: 180 })
  })
})
