import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PALETTE, PALETTES, isPalette, naiveOverrides, type PaletteName, type ThemeName } from '@/core/utils/themePalette'

// vitest stubs css imports (even ?raw) to an empty string
const css = readFileSync('src/assets/themes.css', 'utf-8')

function block(selector: string): Record<string, string> {
  const body = css.match(new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  return Object.fromEntries([...body.matchAll(/--c-([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
}

function tokens(palette: PaletteName, mode: ThemeName): Record<string, string> {
  return { ...block(`html.theme-${mode}`), ...block(`html.theme-${mode}.palette-${palette}`) }
}

const kebab = (key: string) => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

type Rgba = [number, number, number, number]

function parse(v: string): Rgba | null {
  const hex = v.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba
  const m = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/)
  return m ? [+m[1], +m[2], +m[3], +m[4]] : null
}

const over = (fg: Rgba, bg: Rgba): Rgba =>
  [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as Rgba

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PALETTE_IDS = PALETTES.map(p => p.id)
const COMBOS = PALETTE_IDS.flatMap(p => (['dark', 'light'] as const).map(m => [p, m] as const))
const reference = (mode: ThemeName) => Object.keys(tokens('mono', mode)).sort()
const DARK_ONLY = ['scrim', 'modal-glow']

const TEXT_ON_BG = [
  'text', 'text-dim', 'text-muted', 'text-faint', 'text-ghost',
  'success', 'warning', 'error', 'info',
  'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'accent',
]
const BACKGROUNDS = ['bg', 'surface', 'raised']

describe.each(COMBOS)('%s / %s', (palette, mode) => {
  const vars = tokens(palette, mode)
  const color = (name: string) => {
    const c = parse(vars[name] ?? '')
    if (!c) throw new Error(`--c-${name} is not a colour: ${vars[name]}`)
    return c
  }

  it.each(Object.entries(PALETTE[palette][mode]))('%s matches its --c-* token', (key, value) => {
    expect(vars[kebab(key)]).toBe(value)
  })

  it(`defines exactly the token set of mono/${mode}`, () => {
    expect(Object.keys(vars).sort()).toEqual(reference(mode))
  })

  it.each(BACKGROUNDS)('text, status, category and accent reach 4.5:1 on %s', bg => {
    for (const fg of TEXT_ON_BG) {
      expect(contrast(color(fg), color(bg)), `--c-${fg} on --c-${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(BACKGROUNDS)('border-strong reaches 3:1 on %s', bg => {
    expect(contrast(color('border-strong'), color(bg))).toBeGreaterThanOrEqual(3)
  })

  it('accent-text reaches 4.5:1 on accent and accent-hover', () => {
    expect(contrast(color('accent-text'), color('accent'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color('accent-text'), color('accent-hover'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(BACKGROUNDS)('accent reaches 4.5:1 on its soft tint over %s', bg => {
    const tint = over(color('accent-soft'), color(bg))
    expect(contrast(color('accent'), tint)).toBeGreaterThanOrEqual(4.5)
  })

  it('drives the Naive primary colour', () => {
    expect(naiveOverrides(palette, mode).common?.primaryColor).toBe(PALETTE[palette][mode].accent)
  })
})

it('light defines the dark token set minus the dark-only modal tokens', () => {
  expect(reference('light')).toEqual(reference('dark').filter(t => !DARK_ONLY.includes(t)))
})

describe('isPalette', () => {
  it.each(PALETTE_IDS)('accepts %s', id => {
    expect(isPalette(id)).toBe(true)
  })

  it.each(['', 'Mono', null])('rejects %s', v => {
    expect(isPalette(v)).toBe(false)
  })
})
