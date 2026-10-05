import { describe, it, expect } from 'vitest'
import {
  guessFileType,
  isTextureFileName,
  isImageDropFileName,
  SPINE_ACCEPT_EXTENSIONS,
} from '@/core/utils/fileLoader'

describe('guessFileType', () => {
  it.each([
    ['a.json', 'skeleton-json'],
    ['a.skel', 'skeleton-skel'],
    ['a.atlas', 'atlas'],
    ['a.png', 'image'],
    ['a.jpg', 'image'],
    ['a.jpeg', 'image'],
    ['a.webp', 'image'],
    ['a.avif', 'image'],
  ])('%s → %s', (name, type) => {
    expect(guessFileType(name)).toBe(type)
  })

  it('is case-insensitive', () => {
    expect(guessFileType('HERO.JSON')).toBe('skeleton-json')
    expect(guessFileType('Page.PNG')).toBe('image')
  })

  it('returns null for a name without a dot', () => {
    expect(guessFileType('json')).toBeNull()
  })

  it('treats a bare ".json" as a skeleton', () => {
    expect(guessFileType('.json')).toBe('skeleton-json')
  })

  it('returns null for unknown extensions, including gif', () => {
    expect(guessFileType('a.txt')).toBeNull()
    expect(guessFileType('a.gif')).toBeNull()
  })
})

describe('isTextureFileName', () => {
  it('accepts texture extensions and rejects gif', () => {
    expect(isTextureFileName('a.PNG')).toBe(true)
    expect(isTextureFileName('a.gif')).toBe(false)
  })
})

describe('isImageDropFileName', () => {
  it('accepts gif in any case', () => {
    expect(isImageDropFileName('a.gif')).toBe(true)
    expect(isImageDropFileName('a.GIF')).toBe(true)
    expect(isImageDropFileName('a.webp')).toBe(true)
    expect(isImageDropFileName('a.json')).toBe(false)
  })
})

describe('SPINE_ACCEPT_EXTENSIONS', () => {
  it('keeps the picker accept list order', () => {
    expect(SPINE_ACCEPT_EXTENSIONS).toEqual(['.json', '.skel', '.atlas', '.png', '.jpg', '.jpeg', '.webp', '.avif'])
  })
})
