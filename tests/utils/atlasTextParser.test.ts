import { describe, it, expect } from 'vitest'
import { parseAtlas } from '@/core/utils/atlasTextParser'

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
})
