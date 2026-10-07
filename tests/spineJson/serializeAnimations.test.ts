import { describe, it, expect } from 'vitest'
import { bezierHandles, num, recoverBezier } from '@/core/spineJson/serializeAnimations'
import { serializeSkeletonData } from '@/core/spineJson/serializeSkeletonData'
import { FIXTURE_VERSIONS, loadRuntime, readFixtureJson, type FixtureVersion } from '../fixtures/spine/fixtures'
import { parse } from '../fixtures/spine/roundTrip'

// TODO: remove the any when the runtimes ship one typed module shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any

async function serialized(ver: FixtureVersion) {
  const mod = await loadRuntime(ver)
  const data = parse(mod, readFixtureJson(ver))
  return { mod, data, ...serializeSkeletonData(data, mod, ver) as { json: Doc; warnings: string[] } }
}

describe('Bezier recovery', () => {
  const HANDLES: Array<[number, number, number, number]> = [[0.25, 0, 0.75, 1], [0.1, 0.9, 0.3, -0.4], [0.6, 1.4, 0.95, 0.2]]

  it.each(HANDLES)('4.x absolute layout (18 floats) gives back %s, %s, %s, %s', async (nx1, ny1, nx2, ny2) => {
    const core = await loadRuntime('4.2')
    const [t1, t2, v1, v2] = [1.2, 1.9, -30, 250]
    const h: [number, number, number, number] = [t1 + nx1 * (t2 - t1), v1 + ny1 * (v2 - v1), t1 + nx2 * (t2 - t1), v1 + ny2 * (v2 - v1)]
    const tl = new core.RotateTimeline(2, 1, 0)
    tl.setFrame(0, t1, v1)
    tl.setFrame(1, t2, v2)
    tl.setBezier(0, 0, 0, t1, v1, ...h, t2, v2)
    const got = recoverBezier(tl.curves, tl.curves[0] - 2, t1, v1, t2, v2)
    got.forEach((g, i) => expect(Math.abs(g - h[i])).toBeLessThan(2e-5 * Math.max(1, Math.abs(h[i]))))
    expect(bezierHandles(tl.curves, tl.curves[0] - 2, t1, v1, t2, v2)).toEqual(h.map(x => Number(x.toFixed(5))))
  })

  it.each(HANDLES)('3.8 normalised layout (19 floats) gives back %s, %s, %s, %s', async (...h) => {
    const rt38 = await loadRuntime('3.8')
    const tl = new rt38.RotateTimeline(2)
    tl.setCurve(0, ...h)
    expect(tl.curves[0]).toBe(2)
    const got = recoverBezier(tl.curves, 1, 0, 0, 1, 1)
    got.forEach((g, i) => expect(g).toBeCloseTo(h[i], 6))
    expect(bezierHandles(tl.curves, 1, 0, 0, 1, 1)).toEqual(h)
  })

  it('writes float32 data as its shortest decimal', () => {
    expect(num(Math.fround(0.4))).toBe(0.4)
    expect(num(Math.fround(-12.345))).toBe(-12.345)
    expect(num(60.00000000000001)).toBe(60)
    expect(num(-0)).toBe(0)
  })
})

describe('serializeAnimations per dialect (fixture "extra")', () => {
  it('3.8: angle keys, normalised curve + c2..c4, colour/twoColor, old mix names, top-level deform', async () => {
    const { json, warnings } = await serialized('3.8')
    const a = json.animations.extra
    expect(warnings).toEqual([])
    expect(a.bones.c.rotate[0]).toEqual({ angle: 0, curve: 0.3, c2: 0.1, c3: 0.6, c4: 0.95 })
    expect(a.bones.ns.shear[0].curve).toBe('stepped')
    expect(a.slots.body.color[1]).toEqual({ time: 1, color: '8040c0a0' })
    expect(a.slots.mesh.twoColor[1]).toEqual({ time: 1, light: 'ff8000ff', dark: '204060' })
    expect(a.transform.tc[1]).toEqual({ time: 0.5, rotateMix: 1, translateMix: 1, scaleMix: 0.5, shearMix: 0.25 })
    expect(a.path.pathc.position[1]).toEqual({ time: 0.6, position: 0.5 })
    expect(a.path.pathc.mix[1]).toEqual({ time: 0.5, rotateMix: 1, translateMix: 1 })
    expect(a.deform.default.mesh.mesh[1]).toEqual({ time: 0.5, offset: 2, vertices: [5, 5] })
    expect(a.attachments).toBeUndefined()
    expect(json.skins[0].attachments.mesh['mesh-own']).toMatchObject({ type: 'linkedmesh', parent: 'mesh', deform: false })
  })

  it.each(['4.0', '4.1', '4.2', '4.3'] as const)('%s: value keys and absolute bezier handles per channel', async ver => {
    const { json } = await serialized(ver)
    const a = json.animations.extra
    expect(a.bones.c.rotate[0]).toEqual({ value: 0, curve: [0.3, 12, 0.6, 114] })
    // two channels: x 0 → 10, y 0 → -20
    expect(a.bones.tail.translate[0].curve).toEqual([0.125, 0, 0.375, 10, 0.05, -10, 0.45, -10])
    expect(a.bones.ns.scalex[1]).toEqual({ time: 1, value: 2 })
    expect(a.slots.body.rgba[0].curve).toHaveLength(16)
    expect(a.slots.mesh.rgba2[1]).toEqual({ time: 1, light: 'ff8000ff', dark: '204060' })
    expect(a.slots.wmesh.rgb[0]).toEqual({ color: 'ffffff', curve: 'stepped' })
    expect(a.slots.wmesh.alpha[1]).toEqual({ time: 1, value: 0.25 })
    expect(a.slots.seq.rgb2[1]).toEqual({ time: 1, light: '808080', dark: '000000' })
    expect(a.ik.ik[1]).toEqual({ time: 0.5, mix: 0.5, softness: 10, bendPositive: false })
    expect(a.ik.ik[2]).toEqual({ time: 1, mix: 1, softness: 0, compress: true, stretch: true })
    expect(a.path.pathc.mix[1]).toEqual({ time: 0.5, mixRotate: 1, mixX: 1, mixY: 0.5 })
    expect(a.path.pathc.position[0].curve).toEqual([0.15, 0, 0.45, 0.5])
    expect(Object.keys(a.transform.tc[1])).toEqual(['time', 'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'])
  })

  it.each(FIXTURE_VERSIONS)('%s: deform offsets from setup, weighted deform, draw order offsets, events', async ver => {
    const { json } = await serialized(ver)
    const a = json.animations.extra
    const deform = (slot: string) => (ver === '3.8' || ver === '4.0' ? a.deform.default[slot][slot] : a.attachments.default[slot][slot].deform)
    expect(deform('mesh')[1]).toEqual({ time: 0.5, offset: 2, vertices: [5, 5] })
    expect(deform('mesh')[2]).toEqual({ time: 1 })
    expect(deform('wmesh')[1]).toEqual({ time: 1, vertices: [1, 1, 2, 2, 3, 3, 4, 4] })
    expect(a.slots.mesh.attachment).toEqual([{ name: 'mesh' }, { time: 0.5, name: 'mesh-linked' }, { time: 0.8, name: null }])
    // every moved slot with its shift: wmesh -2, seq +1 (body, mesh, misc follow)
    expect(a.drawOrder[0].offsets).toEqual([
      { slot: 'body', offset: 1 }, { slot: 'mesh', offset: 1 }, { slot: 'wmesh', offset: -2 }, { slot: 'seq', offset: 1 }, { slot: 'misc', offset: -1 },
    ])
    expect(a.drawOrder[1]).toEqual({ time: 0.7 })
    expect(a.events[0]).toEqual({ time: 0.2, name: 'hit' })
    expect(a.events[1]).toEqual({ time: 0.6, name: 'hit', int: 5, string: 'b' })
    expect(a.events[2]).toMatchObject({ time: 0.9, name: 'snd', volume: 0.5 })
  })

  it.each(['4.1', '4.2', '4.3'] as const)('%s: sequence timelines and linked-mesh timelines flag', async ver => {
    const { json } = await serialized(ver)
    expect(json.animations.extra.attachments.default.seq.seq.sequence).toEqual([
      { mode: 'loop', index: 0, delay: 0.1 }, { time: 0.5, mode: 'pingpongReverse', index: 1, delay: 0.1 },
    ])
    expect(json.skins[0].attachments.mesh['mesh-own'].timelines).toBe(false)
    expect(json.skins[0].attachments.seq.seq.sequence).toEqual({ count: 2, setup: 1 })
  })

  it.each(['4.2', '4.3'] as const)('%s: inherit and physics timelines, global physics under ""', async ver => {
    const { json } = await serialized(ver)
    const a = json.animations.extra
    expect(a.bones.ns.inherit).toEqual([{ inherit: 'normal' }, { time: 0.5, inherit: 'noScale' }])
    expect(a.physics.phys.inertia).toEqual([{ value: 0.5 }, { time: 1, value: 0.8 }])
    expect(a.physics[''].reset).toEqual([{ time: 0.5 }])
  })

  it('4.3: slider timelines and draw order folders', async () => {
    const { json } = await serialized('4.3')
    expect(json.animations.extra.slider.slide).toEqual({
      time: [{ value: 0 }, { time: 1, value: 1 }], mix: [{ value: 1 }, { time: 1, value: 0.5 }],
    })
    expect(json.animations.folder.drawOrderFolder).toEqual([{
      slots: ['mesh', 'wmesh', 'path'],
      keys: [
        { time: 0.2, offsets: [{ slot: 'mesh', offset: 1 }, { slot: 'wmesh', offset: 1 }, { slot: 'path', offset: -2 }] },
        { time: 0.6 },
      ],
    }])
  })
})

describe('serializeAnimations warnings', () => {
  it('names a timeline of a class the kit does not know and leaves it out', async () => {
    const { mod, data } = await serialized('4.2')
    data.findAnimation('anim').timelines.push({ getFrameCount: () => 0 })
    const { json, warnings } = serializeSkeletonData(data, mod, '4.2') as { json: Doc; warnings: string[] }
    expect(warnings).toEqual(["Skipped unknown timeline in animation 'anim'"])
    expect(Object.keys(json.animations.anim.bones.c)).toEqual(['rotate', 'translatex', 'translatey', 'scale', 'shear'])
  })

  it.each(['4.0', '4.1', '4.2'] as const)('%s: an animated mixShearY is reported (upstream JSON reader keeps the first key)', async ver => {
    const { mod, data } = await serialized(ver)
    // data loaded from a .skel can hold it; the fixture JSON cannot (same reader bug)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tl = data.findAnimation('extra').timelines.find((t: any) => t instanceof mod.TransformConstraintTimeline)
    tl.frames[7 + 6] = 0.25
    const { warnings } = serializeSkeletonData(data, mod, ver)
    expect(warnings).toEqual([`Transform constraint 'tc' in animation 'extra': the Spine ${ver} JSON reader keeps only the first mixShearY key`])
  })
})
