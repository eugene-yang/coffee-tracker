// Controlled flavor vocabulary (SCA-wheel inspired): families → tags → keywords found in roaster notes.
// One vocabulary for roaster notes and tasted tags, so later recommendations can compare them.

export interface FlavorFamily {
  id: string
  label: string
  tags: { id: string; label: string; keywords: string[] }[]
}

const tag = (label: string, ...keywords: string[]) => ({
  id: label.toLowerCase().replace(/[^a-z]+/g, '_'),
  label,
  keywords: [label.toLowerCase(), ...keywords],
})

export const FLAVOR_FAMILIES: FlavorFamily[] = [
  {
    id: 'fruity',
    label: 'Fruity',
    tags: [
      tag('Blueberry'),
      tag('Strawberry'),
      tag('Raspberry'),
      tag('Blackberry'),
      tag('Blackcurrant', 'cassis', 'black currant'),
      tag('Red berries', 'red fruit', 'cranberry', 'redcurrant', 'red currant'),
      tag('Cherry'),
      tag('Lemon', 'lemonade'),
      tag('Lime'),
      tag('Orange', 'mandarin', 'tangerine', 'clementine', 'blood orange'),
      tag('Grapefruit'),
      tag('Bergamot', 'earl grey'),
      tag('Peach', 'nectarine'),
      tag('Apricot'),
      tag('Plum'),
      tag('Mango'),
      tag('Pineapple'),
      tag('Passion fruit', 'passionfruit', 'maracuya'),
      tag('Lychee', 'litchi'),
      tag('Papaya', 'guava', 'tropical'),
      tag('Apple', 'green apple', 'red apple'),
      tag('Pear'),
      tag('Grape', 'wine', 'winey'),
      tag('Raisin'),
      tag('Fig'),
      tag('Date'),
    ],
  },
  {
    id: 'floral',
    label: 'Floral',
    tags: [
      tag('Jasmine'),
      tag('Rose'),
      tag('Hibiscus'),
      tag('Lavender'),
      tag('Chamomile'),
      tag('Orange blossom', 'neroli', 'honeysuckle', 'elderflower'),
      tag('Black tea', 'tea-like', 'tea like', 'earl grey'),
    ],
  },
  {
    id: 'chocolate_nuts',
    label: 'Chocolate & nuts',
    tags: [
      tag('Chocolate', 'milk chocolate', 'chocolatey'),
      tag('Dark chocolate', 'bittersweet'),
      tag('Cocoa', 'cacao', 'cocoa nib', 'cacao nib'),
      tag('Almond', 'marzipan'),
      tag('Hazelnut'),
      tag('Peanut'),
      tag('Walnut', 'pecan'),
    ],
  },
  {
    id: 'caramel',
    label: 'Caramel',
    tags: [
      tag('Caramel'),
      tag('Honey'),
      tag('Brown sugar', 'panela', 'raw sugar', 'demerara'),
      tag('Molasses'),
      tag('Maple', 'maple syrup'),
      tag('Vanilla'),
      tag('Toffee', 'butterscotch', 'fudge'),
    ],
  },
  {
    id: 'spice',
    label: 'Spice',
    tags: [
      tag('Cinnamon'),
      tag('Clove'),
      tag('Nutmeg'),
      tag('Black pepper', 'pepper'),
      tag('Cardamom'),
      tag('Ginger'),
    ],
  },
]

export const FLAVOR_TAGS = FLAVOR_FAMILIES.flatMap((f) => f.tags.map((t) => ({ ...t, family: f.id })))
const BY_ID = new Map(FLAVOR_TAGS.map((t) => [t.id, t]))

export function flavorTag(id: string) {
  return BY_ID.get(id)
}

export function familyOf(tagId: string): string | undefined {
  return BY_ID.get(tagId)?.family
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Map free-text roaster notes ("blood orange, milk chocolate") onto vocabulary tag ids. */
export function tagsFromNotes(notes: string[]): string[] {
  const found = new Set<string>()
  for (const note of notes) {
    const n = ` ${norm(note).replace(/[^a-z]+/g, ' ')} `
    // Longest keyword wins inside one note: "dark chocolate" shouldn't also add "Chocolate"
    const hits: { id: string; len: number; at: number }[] = []
    for (const t of FLAVOR_TAGS) {
      for (const k of t.keywords) {
        const at = n.indexOf(` ${k} `)
        if (at >= 0) hits.push({ id: t.id, len: k.length, at })
      }
    }
    hits.sort((a, b) => b.len - a.len)
    const covered: [number, number][] = []
    for (const h of hits) {
      const span: [number, number] = [h.at, h.at + h.len + 1]
      if (covered.some(([s, e]) => span[0] < e && s < span[1])) continue
      covered.push(span)
      found.add(h.id)
    }
  }
  return [...found]
}
