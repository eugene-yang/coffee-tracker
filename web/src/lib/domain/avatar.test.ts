import { describe, expect, it } from 'vitest'
import { AVATAR_EMOJI, avatarGlyph, firstGrapheme } from './avatar'

describe('avatars', () => {
  it('keeps whole emoji: skin tones, flags and joined sequences', () => {
    expect(firstGrapheme('👩‍🍳 chef')).toBe('👩‍🍳')
    expect(firstGrapheme('👍🏽')).toBe('👍🏽')
    expect(firstGrapheme('🇯🇵')).toBe('🇯🇵')
    expect(firstGrapheme('☕')).toBe('☕')
    expect(firstGrapheme('  ')).toBe('')
  })

  it("shows the emoji, else the name's initial, else ?", () => {
    expect(avatarGlyph({ avatar: '🦊', name: 'Eugene' })).toEqual({ glyph: '🦊', emoji: true })
    expect(avatarGlyph({ avatar: null, name: 'eugene' })).toEqual({ glyph: 'E', emoji: false })
    expect(avatarGlyph({ avatar: '', name: 'Élodie' })).toEqual({ glyph: 'É', emoji: false })
    expect(avatarGlyph(undefined)).toEqual({ glyph: '?', emoji: false })
  })

  it('offers about thirty distinct single emoji', () => {
    expect(new Set(AVATAR_EMOJI).size).toBe(AVATAR_EMOJI.length)
    expect(AVATAR_EMOJI.every((e) => firstGrapheme(e) === e)).toBe(true)
  })
})
