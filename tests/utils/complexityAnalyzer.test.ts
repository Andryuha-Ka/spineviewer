import { describe, it, expect } from 'vitest'
import { analyzeComplexity } from '@/core/utils/complexityAnalyzer'
import type { FileSet } from '@/core/types/FileSet'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { getAnimationDuration } from '@/core/utils/compare/jsonAccess'
import { makeFakeAdapter, slider, withSpine43 } from '../helpers/fakeAdapter'

function jsonFileSet(body: string): FileSet {
  return {
    skeleton: { filename: 'a.json', fileBody: body, type: 'skeleton-json', mimeType: 'application/json' },
    atlas:    { filename: 'a.atlas', fileBody: '', type: 'atlas', mimeType: 'text/plain' },
    images:   [],
  }
}

function metric(body: string, name: string): number {
  const report = analyzeComplexity(makeFakeAdapter(), jsonFileSet(body), [])
  return report.metrics.find(m => m.name === name)!.value
}

describe('analyzeComplexity (JSON)', () => {
  const body = JSON.stringify({
    skins: [{
      name: 'default',
      attachments: {
        body: {
          m1: { type: 'mesh', uvs: [0, 0, 1, 0, 1, 1] },
          m2: { type: 'mesh', uvs: [0, 0, 1, 1] },
          l1: { type: 'linkedmesh', parent: 'm1' },
          l2: { type: 'linkedmesh', parent: 'm1' },
          l3: { type: 'linkedmesh', parent: 'm2' },
          r1: {},
        },
      },
    }],
  })

  it('counts linkedmesh as a mesh, not a region', () => {
    expect(metric(body, 'Meshes')).toBe(5)
    expect(metric(body, 'Regions')).toBe(1)
    expect(metric(body, 'Mesh vertices')).toBe(5)
  })

  it('measures skeleton size in UTF-8 bytes', () => {
    const utf = JSON.stringify({ skins: [], bones: [{ name: 'éééé' }] })
    const bytes = new TextEncoder().encode(utf).byteLength
    expect(bytes).toBe(utf.length + 4)
    expect(metric(utf, 'Skeleton size') * 1024 * 1024).toBeCloseTo(bytes)
  })
})

function binaryFileSet(): FileSet {
  return {
    skeleton: { filename: 'a.skel', fileBody: new ArrayBuffer(8), type: 'skeleton-skel', mimeType: 'application/octet-stream' },
    atlas:    { filename: 'a.atlas', fileBody: '', type: 'atlas', mimeType: 'text/plain' },
    images:   [],
  }
}

const anim = (body: object, name = 'a') =>
  analyzeComplexity(makeFakeAdapter(), jsonFileSet(JSON.stringify(body)), []).animations.find(a => a.name === name)!

describe('analyzeComplexity keyframes', () => {
  it('counts 4.3 slider keys and lets them set the duration', () => {
    const a = anim({ animations: { a: {
      bones: { body: { rotate: [{ value: 0 }, { time: 0.5, value: 5 }, { time: 1, value: 10 }] } },
      slider: { s: { mix: [{}, { time: 0.75, value: 0.5 }, { time: 1.5 }] } },
    } } })
    expect(a.duration).toBe(1.5)
    expect(a.keyframes).toBe(6)
  })

  it('counts a 4.2 timeline whose first key sits at time 0', () => {
    const a = anim({ animations: { a: {
      bones: { body: { rotate: [{ value: 0 }, { time: 1, value: 0 }], translate: [{ x: 1 }, { time: 0.5, x: 2 }] } },
      physics: { hair: { wind: [{ value: -15.8 }, { time: 2, value: 3 }] } },
    } } })
    expect(a.keyframes).toBe(6)
    expect(a.duration).toBe(2)
    expect(a.redundant).toBe(1)
  })

  it('keeps 3.8 nesting and draw-order folders counted', () => {
    const a = anim({ animations: { a: {
      deform: { default: { body: { body: [{ time: 0, vertices: [1, 2] }, { time: 0.4 }] } } },
      drawOrder: [{ time: 0.2, offsets: [{ slot: 'body', offset: 1 }] }],
      drawOrderFolder: [{ slots: ['body'], keys: [{ offsets: [{ slot: 'body', offset: 0 }] }, { time: 0.9 }] }],
    } } })
    expect(a.keyframes).toBe(5)
    expect(a.duration).toBe(0.9)
  })
})

describe('analyzeComplexity Sliders metric', () => {
  const sliders43 = JSON.stringify({ constraints: [
    { type: 'slider', name: 's1', animation: 's1' },
    { type: 'ik', name: 'leg', bones: ['b'], target: 't' },
    { type: 'slider', name: 's2', animation: 's2' },
  ] })
  const sliderMetric = (adapter: ReturnType<typeof makeFakeAdapter>, fs: FileSet) =>
    analyzeComplexity(adapter, fs, []).metrics.find(m => m.name === 'Sliders')

  it('counts the JSON sliders of a 4.3 skeleton', () => {
    const m = sliderMetric(withSpine43(makeFakeAdapter(), [slider('s1'), slider('s2')]), jsonFileSet(sliders43))
    expect(m).toMatchObject({ value: 2, status: 'ok' })
  })

  it('counts the runtime sliders of a 4.3 binary skeleton', () => {
    const m = sliderMetric(withSpine43(makeFakeAdapter(), [slider('s1'), slider('s2')]), binaryFileSet())
    expect(m).toMatchObject({ value: 2, status: 'ok' })
  })

  it('has no Sliders row for a 4.2 adapter', () => {
    expect(sliderMetric(makeFakeAdapter(), jsonFileSet(sliders43))).toBeUndefined()
  })
})

describe('analyzeComplexity 4.2 vs 4.3 JSON layout', () => {
  it('counts the same attachments for both layouts', () => {
    const skins = [{ name: 'default', attachments: { body: {
      r: {}, m: { type: 'mesh', uvs: [0, 0, 1, 0, 1, 1] }, l: { type: 'linkedmesh', parent: 'm' }, c: { type: 'clipping' },
    } } }]
    const v42 = JSON.stringify({ skeleton: { spine: '4.2.43' }, skins, ik: [{ name: 'leg', bones: ['b'], target: 't' }] })
    const v43 = JSON.stringify({ skeleton: { spine: '4.3.13' }, skins, constraints: [{ type: 'ik', name: 'leg', bones: ['b'], target: 't' }] })
    for (const name of ['Regions', 'Mask', 'Meshes', 'Mesh vertices']) expect(metric(v43, name), name).toBe(metric(v42, name))
    expect(metric(v43, 'Meshes')).toBe(2)
  })
})

const SAMPLES = 'example/4.3'

describe.skipIf(!existsSync(SAMPLES))('analyzeComplexity on the official 4.3 samples', () => {
  const report = (file: string) => {
    const body = readFileSync(`${SAMPLES}/${file}`, 'utf-8')
    return analyzeComplexity(withSpine43(makeFakeAdapter(), []), jsonFileSet(body), [])
  }

  it('counts the diamond slider and its slider keys', () => {
    const r = report('diamond/diamond-pro.json')
    expect(r.metrics.find(m => m.name === 'Sliders')!.value).toBe(1)
    const durations = Object.fromEntries(r.animations.map(a => [a.name, a.duration]))
    expect(durations).toMatchObject({ appear: 4.3, disappear: 1.07, rotation: 2, 'size-changing-rotation': 6 })
  })

  it('agrees with the compare duration reader on every sample', () => {
    for (const dir of readdirSync(SAMPLES)) {
      for (const file of readdirSync(`${SAMPLES}/${dir}`).filter(f => f.endsWith('.json'))) {
        const r = report(`${dir}/${file}`)
        const anims = JSON.parse(readFileSync(`${SAMPLES}/${dir}/${file}`, 'utf-8')).animations
        for (const a of r.animations)
          expect(a.duration, `${file} ${a.name}`).toBe(Math.round(getAnimationDuration(anims[a.name]) * 100) / 100)
      }
    }
  })

  it('counts as many keyframes as spine-core 4.3.13 reads frames', () => {
    const frames: Record<string, number> = {
      'celestial-circus/celestial-circus-pro.json': 1052, 'cloud-pot/cloud-pot.json': 146, 'diamond/diamond-pro.json': 568,
      'mix-and-match/mix-and-match-pro.json': 1633, 'spineboy/spineboy-ess.json': 744, 'spineboy/spineboy-pro.json': 1791,
      'stretchyman/stretchyman-pro.json': 352, 'tank/tank-pro.json': 1311, 'vine/vine-pro.json': 40,
    }
    for (const [file, n] of Object.entries(frames))
      expect(report(file).animations.reduce((s, a) => s + a.keyframes, 0), file).toBe(n)
  })

  it('reports no sliders for skeletons without them', () => {
    expect(report('spineboy/spineboy-pro.json').metrics.find(m => m.name === 'Sliders')!.value).toBe(0)
  })
})
