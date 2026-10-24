// 24 px single-stroke method icons; drawn with currentColor so they follow text color.
import type { Method } from '../domain/brew'

const P = (d: string) => `<path d="${d}"/>`

const PATHS: Record<Method, string> = {
  pour_over: P('M4 6h16l-6 9h-4z') + P('M3 6h18') + P('M10 15v3h4v-3') + P('M7 20h10') + P('M18.5 8c2.2 0 2.6 3.6.3 4'),
  switch: P('M5 4h14l-5 8h-4z') + P('M6.5 12h11v7a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19z') + P('M17.5 16H21'),
  aeropress: P('M7.5 2.5h9') + P('M9.5 2.5v6h5v-6') + P('M7 8h10v11H7z') + P('M6 8h12') + P('M7.5 19h9l-1 2.5h-7z'),
  espresso: P('M4 5h14') + P('M6 8h10l-1.5 4h-7z') + P('M14.5 9.5H21') + P('M8.5 15h5v3a2.5 2.5 0 0 1-5 0z'),
  siphon: P('M11 2.5h6v4.5a3 3 0 0 1-6 0z') + P('M14 10v2.5') + '<circle cx="14" cy="16.5" r="4"/>' + P('M5 2.5v19') + P('M3 21.5h11'),
  other: P('M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z') + P('M16 11h1.5a2 2 0 0 1 0 4H16') + P('M9 3.5c-1 1.5 1 2.5 0 4M12.5 3.5c-1 1.5 1 2.5 0 4'),
}

export function methodIconSvg(method: Method | string | null | undefined, size = 24): string {
  const paths = PATHS[(method as Method) in PATHS ? (method as Method) : 'other']
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}
