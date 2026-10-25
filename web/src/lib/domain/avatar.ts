// Avatars: a person's emoji on their color, or their initial when they haven't picked one.

/** Picker choices: long-established emoji (Unicode 9 or older) so the station's older font shows them too. */
export const AVATAR_EMOJI = [
  '☕', '🍵', '🥐', '🍩', '🍪', '🍫', '🍰', '🍓', '🍋', '🍒',
  '🍑', '🍎', '🌸', '🌻', '🌵', '🍀', '🐱', '🐶', '🦊', '🐻',
  '🐼', '🐨', '🐸', '🐧', '🦉', '🐝', '🌙', '⭐', '🔥', '🌈',
] as const

/** The first user-perceived character: a whole emoji, including skin tones, flags and 👩‍🍳-style sequences. */
export function firstGrapheme(text: string): string {
  const s = text.trim()
  if (!s) return ''
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) return segment
  }
  return Array.from(s)[0] // older browsers: whole code point at least, never half a surrogate pair
}

/** What an avatar shows: the person's emoji, else their initial, else "?". */
export function avatarGlyph(user: { avatar: string | null; name: string | null } | undefined): { glyph: string; emoji: boolean } {
  const emoji = firstGrapheme(user?.avatar ?? '')
  if (emoji) return { glyph: emoji, emoji: true }
  return { glyph: firstGrapheme(user?.name ?? '').toUpperCase() || '?', emoji: false }
}
