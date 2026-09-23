import { describe, it, expect } from 'vitest'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import type { FileSet, SpineFile } from '@/core/types/FileSet'

const file = (filename: string, fileBody: string | ArrayBuffer, type: SpineFile['type']): SpineFile =>
  ({ filename, fileBody, type, mimeType: '' })

function fileSet(atlas: string, images: string[], skeleton?: object): FileSet {
  return {
    skeleton: skeleton
      ? file('s.json', JSON.stringify(skeleton), 'skeleton-json')
      : file('s.skel', new ArrayBuffer(4), 'skeleton-skel'),
    atlas: file('s.atlas', atlas, 'atlas'),
    images: images.map(n => file(n, '', 'image')),
  }
}

const ATLAS_4X = 'p.png\nsize:64,64\nhead\nbounds:0,0,32,16\nbody\nbounds:40,0,10,10'

describe('validateSpineFileSet', () => {
  it('accepts a consistent file set', () => {
    const skeleton = { skeleton: { spine: '4.2.0' }, skins: [{ name: 'default', attachments: { s1: { head: {} }, s2: { body: { type: 'mesh' } } } }] }
    expect(validateSpineFileSet(fileSet(ATLAS_4X, ['p.png'], skeleton))).toEqual([])
  })

  it('reports missing page images', () => {
    expect(validateSpineFileSet(fileSet(ATLAS_4X, []))).toEqual(['Missing image: p.png'])
  })

  it('reports regions outside their page for the 4.x layout', () => {
    const atlas = 'p.png\nsize:64,64\nwide\nbounds:40,0,30,10'
    expect(validateSpineFileSet(fileSet(atlas, ['p.png']))).toEqual(['Atlas region exceed page bounds: wide'])
  })

  it('swaps the packed size of rotated regions', () => {
    const fits      = 'p.png\nsize:64,32\nr\nbounds:0,0,20,60\nrotate:90'
    const overflows = 'p.png\nsize:64,32\nr\nbounds:0,0,60,20\nrotate:90'
    expect(validateSpineFileSet(fileSet(fits, ['p.png']))).toEqual([])
    expect(validateSpineFileSet(fileSet(overflows, ['p.png']))).toHaveLength(1)
  })

  it('checks the 3.x layout too', () => {
    const atlas = 'p.png\nsize: 16,16\nr\n  rotate: false\n  xy: 10, 10\n  size: 8, 8'
    expect(validateSpineFileSet(fileSet(atlas, ['p.png']))).toEqual(['Atlas region exceed page bounds: r'])
  })

  it('resolves region names like spine-core: path, then name, then the attachment key', () => {
    const skins = [{ name: 'default', attachments: {
      s1: { a: { name: 'head' }, b: { path: 'body', name: 'ignored' }, c: { type: 'linkedmesh', path: 'tail' } },
      s2: { clip: { type: 'clipping' }, pt: { type: 'point' }, bb: { type: 'boundingbox' }, pth: { type: 'path' } },
    } }]
    expect(validateSpineFileSet(fileSet(ATLAS_4X, ['p.png'], { skeleton: {}, skins }))).toEqual(['Missing atlas region: tail'])
  })

  it('expands sequence attachments into their frame regions', () => {
    const atlas = 'p.png\nsize:64,64\nfx/fire_01\nbounds:0,0,1,1\nfx/fire_02\nbounds:0,0,1,1\nfx/fire_03\nbounds:0,0,1,1'
    const skins = [{ name: 'default', attachments: { s: { fire: { path: 'fx/fire_', sequence: { count: 4, digits: 2 } } } } }]
    expect(validateSpineFileSet(fileSet(atlas, ['p.png'], { skeleton: {}, skins }))).toEqual(['Missing atlas region: fx/fire_04'])
  })

  it('reads pre-3.8 skins keyed by name', () => {
    const skins = { default: { slot: { head: {}, wing: { path: 'wing_path' } } } }
    expect(validateSpineFileSet(fileSet(ATLAS_4X, ['p.png'], { skeleton: {}, skins }))).toEqual(['Missing atlas region: wing_path'])
  })

  it('reports broken skeleton JSON and empty atlases', () => {
    const broken = fileSet(ATLAS_4X, ['p.png'])
    broken.skeleton = file('s.json', '{', 'skeleton-json')
    expect(validateSpineFileSet(broken)).toEqual(['Skeleton JSON parse error'])
    expect(validateSpineFileSet(fileSet('', []))).toEqual(['Atlas appears to be empty or unrecognised format'])
  })
})
