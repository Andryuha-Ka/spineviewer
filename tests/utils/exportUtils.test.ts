import { describe, it, expect, vi, afterEach } from 'vitest'
import { fitScale, fitSequenceScale, withBackground } from '@/core/utils/exportUtils'

describe('fitScale', () => {
  it('keeps the requested scale when it fits', () => {
    expect(fitScale(800, 600, 4, 8192)).toBe(4)
    expect(fitScale(800, 600, 2, 8192)).toBe(2)
  })
  it('clamps 4× to 2× when the texture would be too large', () => {
    expect(fitScale(2560, 1440, 4, 8192)).toBe(2)
  })
  it('never goes below 1', () => {
    expect(fitScale(10000, 10000, 4, 4096)).toBe(1)
  })
})

describe('fitSequenceScale', () => {
  it('keeps the requested scale within the memory budget', () => {
    expect(fitSequenceScale(16, 800, 600, 4)).toBe(4)
  })
  it('clamps 4× to 2× for a long sequence', () => {
    // 128 × 800×600 × 16 × 4 B ≈ 3.9 GB; at 2× ≈ 0.98 GB
    expect(fitSequenceScale(128, 800, 600, 4)).toBe(2)
  })
  it('never goes below 1', () => {
    expect(fitSequenceScale(128, 4000, 4000, 4)).toBe(1)
  })
})

describe('withBackground', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a same-size canvas filled with the colour, source drawn on top', () => {
    const calls: string[] = []
    const ctx = {
      fillStyle: '',
      fillRect: vi.fn(() => calls.push(`fill:${ctx.fillStyle}`)),
      drawImage: vi.fn(() => calls.push('draw')),
    }
    const real = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = real(tag)
      if (tag === 'canvas') (el as HTMLCanvasElement).getContext = (() => ctx) as never
      return el
    })
    const src = real('canvas')
    src.width = 320
    src.height = 200

    const out = withBackground(src, 0x1a1a2e)

    expect(out).not.toBe(src)
    expect(out.width).toBe(320)
    expect(out.height).toBe(200)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 320, 200)
    expect(ctx.drawImage).toHaveBeenCalledWith(src, 0, 0)
    expect(calls).toEqual(['fill:#1a1a2e', 'draw'])
  })
})
