// Brewer illustrations: flat SVGs drawn for the household's equipment (see STYLE.md).
// Shapes use classes (.b body, .a accent, .g/.gl glass, .d dark, .s line, .h highlight, .sh shadow)
// so colors come from CSS variables and follow the theme; --ill-accent is each brewer's signature color.
import aeropress from './aeropress.svg?raw'
import espresso from './espresso.svg?raw'
import kadou from './kadou.svg?raw'
import siphon from './siphon.svg?raw'
import switchSvg from './switch.svg?raw'
import v60 from './v60.svg?raw'
import type { Method } from '../domain/brew'

export interface IllustrationInfo {
  key: string
  name: string
  method: Method
  accent: string
  svg: string
}

export const ILLUSTRATIONS: IllustrationInfo[] = [
  { key: 'v60', name: 'Hario V60 (glass)', method: 'pour_over', accent: '#a9cbdb', svg: v60 },
  { key: 'kadou', name: 'Kadou', method: 'pour_over', accent: '#9cbfa7', svg: kadou },
  { key: 'switch', name: 'Hario Switch', method: 'switch', accent: '#a9cbdb', svg: switchSvg },
  { key: 'aeropress', name: 'AeroPress', method: 'aeropress', accent: '#e07a4f', svg: aeropress },
  { key: 'espresso', name: "De'Longhi Dedica Arte", method: 'espresso', accent: '#c3c8ce', svg: espresso },
  { key: 'siphon', name: 'Siphon', method: 'siphon', accent: '#9a6a43', svg: siphon },
]

const BY_KEY = new Map(ILLUSTRATIONS.map((i) => [i.key, i]))

export function illustration(key: string | null | undefined): IllustrationInfo | undefined {
  return key ? BY_KEY.get(key) : undefined
}
