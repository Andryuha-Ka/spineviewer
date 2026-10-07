import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import {
  archiveOf,
  dirOf,
  fileDir,
  expandZipFiles,
  groupSpineFiles,
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
    expect(SPINE_ACCEPT_EXTENSIONS).toEqual(['.json', '.skel', '.atlas', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.zip'])
  })
})

const PNG   = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const ATLAS = 'skeleton.png\nsize: 4,4\nformat: RGBA8888\n'
const JSON_ = '{"skeleton":{"spine":"4.2.40"},"bones":[{"name":"root"}]}'

function zipFile(name: string, entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], name)
}

describe('expandZipFiles', () => {
  it('returns the same list when there is no archive', async () => {
    const files = [new File(['x'], 'a.json')]
    expect(await expandZipFiles(files)).toBe(files)
  })

  it('keeps Spine entries of a keyframe.it-style export and drops the rest', async () => {
    const zip = zipFile('export.zip', {
      'skeleton.json':  strToU8(JSON_),
      'skeleton.atlas': strToU8(ATLAS),
      'skeleton.png':   PNG,
      'test.html':      strToU8('<html>'),
      'README.txt':     strToU8('hi'),
    })
    const out = await expandZipFiles([zip])
    expect(out.map(f => f.name).sort()).toEqual(['skeleton.atlas', 'skeleton.json', 'skeleton.png'])
    expect(out.every(f => archiveOf.get(f) === 'export.zip')).toBe(true)
    const png = out.find(f => f.name === 'skeleton.png')!
    expect(png.type).toBe('image/png')
    expect(new Uint8Array(await png.arrayBuffer())).toEqual(PNG)
  })

  it('uses base names for nested paths and ignores folders, __MACOSX, dot-files and nested zips', async () => {
    const zip = zipFile('deep.zip', {
      'export/spine/hero.json':        strToU8(JSON_),
      'export/spine/hero.atlas':       strToU8(ATLAS),
      'export/spine/':                 new Uint8Array(),
      '__MACOSX/export/._hero.json':   strToU8('junk'),
      'export/.hidden/x.png':          PNG,
      'export/.DS_Store.png':          PNG,
      'export/inner.zip':              zipSync({ 'a.json': strToU8(JSON_) }),
    })
    const out = await expandZipFiles([zip])
    expect(out.map(f => f.name).sort()).toEqual(['hero.atlas', 'hero.json'])
  })

  it('keeps loose files next to extracted ones, untagged', async () => {
    const loose = new File(['x'], 'enemy.json')
    const out = await expandZipFiles([loose, zipFile('hero.zip', { 'hero.json': strToU8(JSON_) })])
    expect(out[0]).toBe(loose)
    expect(archiveOf.get(loose)).toBeUndefined()
    expect(archiveOf.get(out[1])).toBe('hero.zip')
  })

  it('throws "Cannot read archive" for corrupt bytes', async () => {
    await expect(expandZipFiles([new File(['not a zip at all'], 'broken.zip')]))
      .rejects.toThrow('Cannot read archive: broken.zip')
  })
})

describe('groupSpineFiles with archives', () => {
  it('groups a zip under export/spine/ as one set', async () => {
    const { slots, globalError } = await groupSpineFiles([zipFile('export.zip', {
      'export/spine/skeleton.json':  strToU8(JSON_),
      'export/spine/skeleton.atlas': strToU8(ATLAS),
      'export/spine/skeleton.png':   PNG,
      'test.html':                   strToU8('<html>'),
    })])
    expect(globalError).toBeUndefined()
    expect(slots).toHaveLength(1)
    expect(slots[0].name).toBe('skeleton')
    expect(slots[0].fileSet!.skeleton.fileBody).toBe(JSON_)
    expect(slots[0].fileSet!.images[0].fileBody).toMatch(/^data:image\/png;base64,/)
  })

  it('groups zip sets and loose sets together', async () => {
    const enemyAtlas = ATLAS.replace('skeleton.png', 'enemy.png')
    const { slots } = await groupSpineFiles([
      zipFile('hero.zip', { 'hero.json': strToU8(JSON_), 'hero.atlas': strToU8(ATLAS), 'skeleton.png': PNG }),
      new File([JSON_], 'enemy.json'),
      new File([enemyAtlas], 'enemy.atlas'),
      new File([PNG], 'enemy.png', { type: 'image/png' }),
    ])
    expect(slots.map(s => s.name).sort()).toEqual(['enemy', 'hero'])
    expect(slots.every(s => s.fileSet && !s.error)).toBe(true)
  })

  it('reports a corrupt archive as the global error', async () => {
    const res = await groupSpineFiles([new File(['garbage'], 'broken.zip')])
    expect(res).toEqual({ slots: [], globalError: 'Cannot read archive: broken.zip' })
  })

  it('an archive without Spine entries contributes nothing', async () => {
    const res = await groupSpineFiles([zipFile('docs.zip', { 'README.txt': strToU8('hi') })])
    expect(res.globalError).toBe('Missing skeleton file (.json or .skel)')
  })
})

describe('groupSpineFiles by directory', () => {
  const PNG_B = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
  const b64 = (bytes: Uint8Array) => `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
  const at = (dir: string, file: File) => { dirOf.set(file, dir); return file }
  const set = (dir: string, name: string, png: Uint8Array) => [
    at(dir, new File([JSON_], `${name}.json`)),
    at(dir, new File([ATLAS], `${name}.atlas`)),
    at(dir, new File([png as Uint8Array<ArrayBuffer>], 'skeleton.png', { type: 'image/png' })),
  ]
  const pageOf = (slots: Array<{ name: string; fileSet?: { images: Array<{ fileBody: unknown }> } }>, name: string) =>
    slots.find(s => s.name === name)!.fileSet!.images.map(i => i.fileBody)

  it('two folders with same-named pages load as two sets, each with its own page', async () => {
    const { slots } = await groupSpineFiles([...set('comp1/FortuneLuck', 'luck', PNG), ...set('comp1/MoneyBloom', 'bloom', PNG_B)])
    expect(slots.every(s => s.fileSet && !s.error)).toBe(true)
    expect(pageOf(slots, 'luck')).toEqual([b64(PNG)])
    expect(pageOf(slots, 'bloom')).toEqual([b64(PNG_B)])
  })

  it('uses webkitRelativePath of a native folder pick', async () => {
    const rel = (path: string, file: File) => Object.defineProperty(file, 'webkitRelativePath', { value: path })
    const files = [
      rel('pick/a/hero.json', new File([JSON_], 'hero.json')), rel('pick/a/hero.atlas', new File([ATLAS], 'hero.atlas')),
      rel('pick/a/skeleton.png', new File([PNG], 'skeleton.png', { type: 'image/png' })),
      rel('pick/b/hero.json', new File([JSON_], 'hero.json')), rel('pick/b/hero.atlas', new File([ATLAS], 'hero.atlas')),
      rel('pick/b/skeleton.png', new File([PNG_B], 'skeleton.png', { type: 'image/png' })),
    ]
    expect(files.map(fileDir)).toEqual(['pick/a', 'pick/a', 'pick/a', 'pick/b', 'pick/b', 'pick/b'])
    const { slots } = await groupSpineFiles(files)
    expect(slots.map(s => s.fileSet!.images[0].fileBody)).toEqual([b64(PNG), b64(PNG_B)])
  })

  it('a zip with two subfolders loads as two sets', async () => {
    const { slots } = await groupSpineFiles([zipFile('pack.zip', {
      'one/hero.json': strToU8(JSON_), 'one/hero.atlas': strToU8(ATLAS), 'one/skeleton.png': PNG,
      'two/hero.json': strToU8(JSON_), 'two/hero.atlas': strToU8(ATLAS), 'two/skeleton.png': PNG_B,
    })])
    expect(slots).toHaveLength(2)
    expect(slots.map(s => s.fileSet!.images[0].fileBody).sort()).toEqual([b64(PNG), b64(PNG_B)].sort())
  })

  it('pages in a subfolder join the set above; pages elsewhere are found by name', async () => {
    const nested = await groupSpineFiles([
      at('hero', new File([JSON_], 'hero.json')), at('hero', new File([ATLAS], 'hero.atlas')),
      at('hero/images', new File([PNG], 'skeleton.png', { type: 'image/png' })),
    ])
    expect(nested.slots[0].fileSet!.images).toHaveLength(1)
    const apart = await groupSpineFiles([
      at('json', new File([JSON_], 'hero.json')), at('json', new File([ATLAS], 'hero.atlas')),
      at('png', new File([PNG], 'skeleton.png', { type: 'image/png' })),
    ])
    expect(apart.slots[0].fileSet!.images).toHaveLength(1)
  })

  it('a skeleton and an atlas in sibling folders still pair by name', async () => {
    const { slots } = await groupSpineFiles([
      at('json', new File([JSON_], 'hero.json')), at('atlas', new File([ATLAS], 'hero.atlas')), at('atlas', new File([PNG], 'skeleton.png', { type: 'image/png' })),
    ])
    expect(slots).toHaveLength(1)
    expect(slots[0].error).toBeUndefined()
  })

  it('zip entries carry the archive name and their folder', async () => {
    const out = await expandZipFiles([zipFile('pack.zip', { 'one/two/hero.json': strToU8(JSON_), 'hero.atlas': strToU8(ATLAS) })])
    expect(out.map(fileDir).sort()).toEqual(['pack.zip', 'pack.zip/one/two'])
  })
})
