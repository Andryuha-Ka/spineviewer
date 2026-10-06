import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseAtlas, atlasVramBytes, atlasUtilization, type AtlasPage } from '@/core/utils/atlasTextParser'

// Official export layout: tab-indented properties, spaces after ':' and ','
const ATLAS_OFFICIAL = [
  'diamond.png',
  '\tsize: 1024, 512',
  '\tfilter: Linear, Linear',
  '\tscale: 0.5',
  'lower-side',
  '\tbounds: 585, 78, 77, 78',
  'gem',
  '\tbounds: 10, 20, 30, 40',
  '\toffsets: 1, 2, 33, 44',
  '\trotate: 90',
  '\tindex: 2',
  '',
  'second.png',
  '    size: 64, 32',
  '    pma: true',
  'r',
  '    bounds: 0, 0, 8, 8',
].join('\n')

const ATLAS_3X = [
  'page1.png',
  'size: 256,128',
  'format: RGBA8888',
  'filter: Linear,Linear',
  'repeat: none',
  'head',
  '  rotate: true',
  '  xy: 2, 4',
  '  size: 30, 20',
  '  orig: 40, 30',
  '  offset: 1, 2',
  '  index: -1',
  'body',
  '  rotate: false',
  '  xy: 40, 4',
  '  size: 10, 10',
  '  orig: 10, 10',
  '  offset: 0, 0',
  '  index: 3',
].join('\n')

const ATLAS_4X = [
  '',
  'a.png',
  'size:64,64',
  'filter:Linear,Linear',
  'r1',
  'bounds:1,2,3,4',
  'offsets:5,6,7,8',
  'rotate:90',
  'r2',
  'bounds:10,10,5,5',
  'rotate:270',
  '',
  'b.png',
  'size:32,32',
  'r3',
  'bounds:0,0,8,8',
].join('\r\n')

describe('parseAtlas', () => {
  it('parses the 3.x layout', () => {
    const [page] = parseAtlas(ATLAS_3X)
    expect(page).toMatchObject({ name: 'page1.png', width: 256, height: 128 })
    expect(page.regions[0]).toEqual({
      name: 'head', x: 2, y: 4, width: 30, height: 20, rotate: true,
      origWidth: 40, origHeight: 30, offsetX: 1, offsetY: 2, index: -1,
    })
    expect(page.regions[1]).toMatchObject({ name: 'body', rotate: false, index: 3 })
  })

  it('parses the 4.x layout with several pages', () => {
    const pages = parseAtlas(ATLAS_4X)
    expect(pages.map(p => [p.name, p.width, p.height])).toEqual([['a.png', 64, 64], ['b.png', 32, 32]])
    expect(pages[0].regions[0]).toMatchObject({
      name: 'r1', x: 1, y: 2, width: 3, height: 4,
      offsetX: 5, offsetY: 6, origWidth: 7, origHeight: 8, rotate: true,
    })
    expect(pages[0].regions[1].rotate).toBe(true)
    expect(pages[1].regions.map(r => r.name)).toEqual(['r3'])
  })

  it('treats rotate:0 and rotate:false as not rotated', () => {
    const [page] = parseAtlas('p.png\nsize:8,8\nr\nbounds:0,0,1,1\nrotate:0\nq\nbounds:0,0,1,1\nrotate:false')
    expect(page.regions.map(r => r.rotate)).toEqual([false, false])
  })

  it('parses the indented official layout with spaced values', () => {
    const pages = parseAtlas(ATLAS_OFFICIAL)
    expect(pages.map(p => [p.name, p.width, p.height])).toEqual([['diamond.png', 1024, 512], ['second.png', 64, 32]])
    expect(pages[0].regions[0]).toEqual({
      name: 'lower-side', x: 585, y: 78, width: 77, height: 78, rotate: false,
      origWidth: 77, origHeight: 78, offsetX: 0, offsetY: 0, index: -1,
    })
    expect(pages[0].regions[1]).toEqual({
      name: 'gem', x: 10, y: 20, width: 30, height: 40, rotate: true,
      origWidth: 33, origHeight: 44, offsetX: 1, offsetY: 2, index: 2,
    })
    expect(pages[1].regions.map(r => r.name)).toEqual(['r'])
  })
})

const OFFICIAL_DIRS = ['example/4.3', 'example/4.2-official'].map(d => path.resolve(__dirname, '../..', d))

function atlasFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return atlasFiles(full)
    return name.endsWith('.atlas') ? [full] : []
  })
}

// example/ is gitignored, so this runs locally only
describe.skipIf(!OFFICIAL_DIRS.some(existsSync))('parseAtlas on official sample atlases', () => {
  const files = OFFICIAL_DIRS.filter(existsSync).flatMap(atlasFiles)

  it.each(files.map(f => [path.relative(path.resolve(__dirname, '../..'), f), f]))('%s', (_rel, file) => {
    const text = readFileSync(file, 'utf8').replace(/\r/g, '')
    // each blank-line block is a page; its first "size:" line is the page size
    const expected = text.split(/\n\s*\n/).filter(b => b.trim()).map(block => {
      const m = /^\s*size:\s*(\d+)\s*,\s*(\d+)/m.exec(block)
      return m ? [Number(m[1]), Number(m[2])] : null
    })
    const pages = parseAtlas(text)
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(page.width).toBeGreaterThan(0)
      expect(page.height).toBeGreaterThan(0)
      expect(page.regions.length).toBeGreaterThan(0)
    }
    expect(pages.map(p => [p.width, p.height])).toEqual(expected)
  })
})

const pg = (width: number, height: number, regions: [number, number][]): AtlasPage => ({
  name: 'p.png', width, height,
  regions: regions.map(([w, h], i) => ({
    name: `r${i}`, x: 0, y: 0, width: w, height: h, rotate: false,
    origWidth: w, origHeight: h, offsetX: 0, offsetY: 0, index: -1,
  })),
})

describe('atlas stats', () => {
  it('returns 0 for an empty page list', () => {
    expect(atlasVramBytes([])).toBe(0)
    expect(atlasUtilization([])).toBe(0)
  })

  it('returns 0 utilization for a zero-size page', () => {
    expect(atlasVramBytes([pg(0, 0, [[4, 4]])])).toBe(0)
    expect(atlasUtilization([pg(0, 0, [[4, 4]])])).toBe(0)
  })

  it('sums bytes and areas across pages', () => {
    const pages = [pg(4, 4, [[2, 2]]), pg(2, 2, [[2, 2]])]
    expect(atlasVramBytes(pages)).toBe((16 + 4) * 4)
    expect(atlasUtilization(pages)).toBe(8 / 20)
  })
})
