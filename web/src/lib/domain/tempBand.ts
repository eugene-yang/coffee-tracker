export type TempBand = 'hot' | 'warm' | 'cool'

export interface TempBandThresholds {
  hot_max_min: number // below this many minutes after brew → Hot
  warm_max_min: number // below this → Warm, otherwise Cool
}

export const TEMP_BANDS_SETTING = 'temp_bands'
export const DEFAULT_TEMP_BANDS: TempBandThresholds = { hot_max_min: 10, warm_max_min: 25 }

export function suggestTempBand(minutesAfterBrew: number, t: TempBandThresholds = DEFAULT_TEMP_BANDS): TempBand {
  if (minutesAfterBrew < t.hot_max_min) return 'hot'
  if (minutesAfterBrew < t.warm_max_min) return 'warm'
  return 'cool'
}

/** Keep thresholds sane when edited with steppers: 1 ≤ hot < warm ≤ 180. */
export function clampThresholds(t: TempBandThresholds): TempBandThresholds {
  const hot = Math.min(Math.max(Math.round(t.hot_max_min), 1), 179)
  const warm = Math.min(Math.max(Math.round(t.warm_max_min), hot + 1), 180)
  return { hot_max_min: hot, warm_max_min: warm }
}
