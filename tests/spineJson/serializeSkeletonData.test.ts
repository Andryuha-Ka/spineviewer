import { describe, it, expect } from 'vitest'
import { dialectOf, serializeSkeletonData } from '@/core/spineJson/serializeSkeletonData'
import { FIXTURE_VERSIONS, FIXTURE_SPINE_STRINGS, loadRuntime, readFixtureJson } from '../fixtures/spine/fixtures'
import { expectRoundTrip, jsonDiff, parse, roundTrip } from '../fixtures/spine/roundTrip'

describe('dialectOf', () => {
  it('follows the data version, else the runtime', () => {
    expect(dialectOf('3.8.99', '4.1')).toBe('3.8')
    expect(dialectOf('4.0.64', '4.1')).toBe('4.0')
    expect(dialectOf('4.3.13', '4.3')).toBe('4.3')
    expect(dialectOf(null, '4.2')).toBe('4.2')
    expect(dialectOf('5.0.1', '4.3')).toBe('4.3')
  })
})

describe.each(FIXTURE_VERSIONS)('serializeSkeletonData on the %s fixture', ver => {
  it('round-trips through the real runtime within the spec tolerances', async () => {
    const mod = await loadRuntime(ver)
    const rt = roundTrip(mod, parse(mod, readFixtureJson(ver)), ver)
    expect(rt.warnings).toEqual([])
    expect((rt.json.skeleton as { spine: string }).spine).toBe(FIXTURE_SPINE_STRINGS[ver])
    expectRoundTrip(mod, rt)
  })

  it('is stable: serializing the round-tripped data gives the same document', async () => {
    const mod = await loadRuntime(ver)
    const rt = roundTrip(mod, parse(mod, readFixtureJson(ver)), ver)
    // recovered handles may move in their last digit
    expect(jsonDiff(serializeSkeletonData(rt.data2, mod, ver).json, rt.json)).toEqual([])
  })
})

// TODO: remove the any when the runtimes ship one typed module shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any

describe.each(FIXTURE_VERSIONS)('serializeSkeletonData structure on the %s fixture', ver => {
  it('writes header, bones, slots, constraints, skins with every attachment kind and events', async () => {
    const mod = await loadRuntime(ver)
    const { json } = serializeSkeletonData(parse(mod, readFixtureJson(ver)), mod, ver) as { json: Doc }
    const is43 = ver === '4.3'

    expect(json.skeleton).toMatchObject({ hash: `fixture-${ver}`, spine: FIXTURE_SPINE_STRINGS[ver], x: -60, width: 140 })
    expect(json.bones).toHaveLength(10)
    expect(json.bones[3]).toEqual({ name: 'c', parent: 'b', length: 30, x: 40, rotation: 5, scaleX: 1.2, shearX: 10, shearY: -5 })
    expect(json.bones[9]).toMatchObject({ name: 'ns', [ver === '4.2' || is43 ? 'inherit' : 'transform']: 'onlyTranslation' })
    expect(json.slots.map((s: Doc) => s.name)).toEqual(['body', 'mesh', 'wmesh', 'path', 'seq', 'misc'])
    expect(json.slots[2]).toEqual({ name: 'wmesh', bone: 'a', color: 'ffffffc0', attachment: 'wmesh' })
    expect(json.slots[4]).toEqual({ name: 'seq', bone: 'root', dark: '102030', attachment: 'seq', blend: 'additive' })

    if (is43) {
      expect(json.constraints.map((c: Doc) => `${c.type}:${c.name}`)).toEqual(['ik:ik', 'physics:phys', 'slider:slide', 'transform:tc', 'path:pathc'])
      expect(json.constraints[2]).toEqual({ type: 'slider', name: 'slide', animation: 'slider-anim' })
      expect(json.constraints[3]).toMatchObject({
        source: 'target', rotation: 15, x: 3,
        properties: { rotate: { to: { rotate: { max: 1, scale: 1 } } }, x: { to: { x: { max: 1, scale: 1 } } }, y: { to: { y: { max: 1, scale: 1 } } } },
      })
      expect(json.constraints[4]).toMatchObject({ type: 'path', slot: 'path', bones: ['p1'] })
      expect(json.ik).toBeUndefined()
    } else {
      expect(json.ik).toEqual([{ name: 'ik', order: 0, bones: ['a', 'b'], target: 'target' }])
      expect(json.transform[0]).toMatchObject({ name: 'tc', order: 2, bones: ['tcb'], target: 'target', rotation: 15, x: 3 })
      expect(json.transform[0][ver === '3.8' ? 'rotateMix' : 'mixRotate']).toBe(0)
      expect(json.path[0]).toMatchObject({ name: 'pathc', target: 'path', positionMode: 'percent', spacingMode: 'length', rotateMode: 'tangent' })
      expect(json.physics?.length ?? 0).toBe(ver === '4.2' ? 1 : 0)
    }
    if (ver === '4.2') {
      expect(json.physics[0]).toMatchObject({ name: 'phys', order: 1, bone: 'tail', x: 1, rotate: 1, inertia: 0.5, strength: 100, damping: 0.85, mass: 1, fps: 60 })
    }

    expect(json.skins.map((s: Doc) => s.name)).toEqual(['default', 'alt'])
    const att = json.skins[0].attachments
    expect(att.body.body).toEqual({ x: 25, rotation: -90, width: 4, height: 4 })
    expect(att.mesh.mesh).toEqual({
      type: 'mesh', path: 'body', width: 20, height: 20,
      uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [0, 1, 2, 2, 3, 0], vertices: [-10, -10, 10, -10, 10, 10, -10, 10], hull: 4,
    })
    expect(att.mesh['mesh-linked']).toEqual({ type: 'linkedmesh', path: 'body', width: 20, height: 20, [is43 ? 'source' : 'parent']: 'mesh' })
    expect(att.wmesh.wmesh.vertices).toEqual([1, 1, 0, 0, 1, 2, 1, 10, 0, 0.5, 2, 5, 0, 0.5, 1, 2, 0, 10, 1])
    expect(att.path.path).toMatchObject({ type: 'path', vertexCount: 6, lengths: [60, 120] })
    expect(att.misc.bbox).toMatchObject({ type: 'boundingbox', vertexCount: 3, vertices: [0, 0, 10, 0, 0, 10] })
    expect(att.misc.pt).toMatchObject({ type: 'point', x: 5, y: 6, rotation: 30 })
    expect(att.misc.clip).toMatchObject({ type: 'clipping', end: 'seq', vertexCount: 3 })
    expect(json.skins[1].attachments.body.body).toEqual({ x: 20, rotation: -90, width: 4, height: 4 })

    expect(json.events).toEqual({
      hit: { int: 1, float: 0.5, string: 'a' },
      snd: { audio: 'snd.ogg', volume: 0.8, balance: -0.2 },
    })
    expect(Object.keys(json.animations)).toEqual(['anim', 'slider-anim', 'extra', ...(is43 ? ['folder'] : [])])
  })

  it('leaves out an attachment or constraint of an unknown class and names it', async () => {
    const mod = await loadRuntime(ver)
    const data = parse(mod, readFixtureJson(ver))
    data.defaultSkin.setAttachment(5, 'odd', { name: 'odd' })
    if (ver === '4.3') data.constraints.push({ name: 'mystery' })
    const { json, warnings } = serializeSkeletonData(data, mod, ver) as { json: Doc; warnings: string[] }
    expect(warnings).toEqual([
      ...(ver === '4.3' ? ["Skipped unknown constraint 'mystery'"] : []),
      "Skipped unknown attachment type in slot 'misc'",
    ])
    expect(json.skins[0].attachments.misc.odd).toBeUndefined()
    expect(json.skins[0].attachments.misc.pt).toBeTruthy()
  })
})
