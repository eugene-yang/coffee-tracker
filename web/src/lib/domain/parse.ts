// Turn label text as printed ("250g", "Roasted 03.10.2026") into typed values when unambiguous.

const OZ_TO_G = 28.3495

/** "250g", "250 G", "1kg", "12 oz", "0.5 lb" → grams; null when unclear. */
export function parseWeightGrams(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|oz|ounces?|lbs?|pounds?)\b/)
  if (!m) return null
  const n = parseFloat(m[1])
  const unit = m[2]
  const grams = unit === 'kg' ? n * 1000 : unit.startsWith('o') ? n * OZ_TO_G : unit.startsWith('l') || unit.startsWith('p') ? n * 453.592 : n
  return Math.round(grams)
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Roast date as printed → YYYY-MM-DD, or null if ambiguous. Accepts ISO (2026-10-03),
 * day-first numeric (03.10.2026, 3/10/26 — most roaster labels), and month names (3 Oct 2026, Oct 3, 2026).
 * Numeric dates where the first part is > 12 are unambiguous either way; otherwise day-first is assumed.
 */
export function parseRoastDate(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.toLowerCase()
  let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]]
    return b > 12 ? iso(y, a, b) : iso(y, b, a)
  }
  m = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{2,4})/)
  if (m && MONTHS[m[2].slice(0, 3)]) return iso(+m[3], MONTHS[m[2].slice(0, 3)], +m[1])
  m = t.match(/([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/)
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(+m[3], MONTHS[m[1].slice(0, 3)], +m[2])
  return null
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso.length === 10 ? `${fromIso}T00:00:00` : fromIso)
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}
