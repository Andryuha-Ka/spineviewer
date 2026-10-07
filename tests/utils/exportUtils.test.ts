import { describe, it, expect, vi, afterEach } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildSkeletonZip, fitScale, fitSequenceScale, safeFileName, withBackground } from '@/core/utils/exportUtils'
import type { FileSet } from '@/core/types/FileSet'

const PNG1 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 7])
const PNG2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8])
const dataUrl = (b: Uint8Array) => `data:image/png;base64,${btoa(String.fromCharCode(...b))}`
const ATLAS = 'hero.png\nsize: 4,4\n\nhero2.png\nsize: 4,4\n'
const JSON_ = '{"skeleton":{"spine":"4.2.40"},"bones":[{"name":"root","x":5}]}'

function heroSet(): FileSet {
  return {
    skeleton: { filename: 'hero.json', fileBody: JSON_, type: 'skeleton-json', mimeType: 'application/json' },
    atlas:    { filename: 'hero.atlas', fileBody: ATLAS, type: 'atlas', mimeType: 'text/plain' },
    images: [
      { filename: 'hero.png', fileBody: dataUrl(PNG1), type: 'image', mimeType: 'image/png' },
      { filename: 'hero2.png', fileBody: dataUrl(PNG2), type: 'image', mimeType: 'image/png' },
    ],
  }
}

describe('buildSkeletonZip', () => {
  it('holds exactly the JSON, the atlas and the page images with original bytes', async () => {
    const blob = await buildSkeletonZip(heroSet(), 'hero')
    expect(blob.type).toBe('application/zip')
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(entries).sort()).toEqual(['hero.atlas', 'hero.json', 'hero.png', 'hero2.png'])
    expect(strFromU8(entries['hero.json'])).toBe(JSON_)
    expect(strFromU8(entries['hero.atlas'])).toBe(ATLAS)
    expect(entries['hero.png']).toEqual(PNG1)
    expect(entries['hero2.png']).toEqual(PNG2)
  })

  it('replaces illegal file-name characters', async () => {
    const entries = unzipSync(new Uint8Array(await (await buildSkeletonZip(heroSet(), 'a/b:c*')).arrayBuffer()))
    expect(entries['a_b_c_.json']).toBeDefined()
    expect(safeFileName('x<y>|"?\\z')).toBe('x_y_____z')
  })

  it('rejects a binary skeleton body', async () => {
    const set = heroSet()
    set.skeleton = { ...set.skeleton, fileBody: new ArrayBuffer(4) }
    await expect(buildSkeletonZip(set, 'hero')).rejects.toThrow('Skeleton is not Spine JSON')
  })

  it('rejects when aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort(new DOMException('Stopped', 'AbortError'))
    await expect(buildSkeletonZip(heroSet(), 'hero', ctrl.signal)).rejects.toThrow('Stopped')
  })
})

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
