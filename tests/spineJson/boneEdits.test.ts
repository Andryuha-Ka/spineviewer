import { describe, it, expect } from 'vitest'
import {
  detectDialect, setBoneSetup, getBoneKeys, upsertBoneKey, setBoneKeyCurve, deleteBoneKey, createAnimation,
  replaceBoneTimelines, keyValueFromLocal, poseKeyTypes, type SpineJsonDoc,
} from '@/core/spineJson/boneEdits'
import { readFixtureJson, loadRuntime, FIXTURE_VERSIONS, type FixtureVersion } from '../fixtures/spine/fixtures'
import { parse } from '../fixtures/spine/roundTrip'

const doc = (ver: FixtureVersion): SpineJsonDoc => JSON.parse(readFixtureJson(ver))

/** Local pose of a bone after playing `animation` to `time` with the real runtime of `ver`. */
async function poseAt(ver: FixtureVersion, d: SpineJsonDoc, animation: string, time: number, bone: string) {
  const mod = await loadRuntime(ver)
  const data = parse(mod, JSON.stringify(d))
  const skeleton = new mod.Skeleton(data)
  const state = new mod.AnimationState(new mod.AnimationStateData(data))
  state.setAnimation(0, animation, false)
  state.update(time)
  state.apply(skeleton)
  const b = skeleton.findBone(bone)
  return { local: b.pose ?? b, duration: data.findAnimation(animation).duration as number }
}

const T = (over = {}) => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, ...over })

async function code(fn: () => unknown): Promise<string | undefined> {
  try { await fn() } catch (e) { return (e as { code?: string }).code }
  return undefined
}

describe('detectDialect', () => {
  it('reads skeleton.spine and falls back to the runtime version', () => {
    expect(detectDialect(doc('3.8'))).toBe('3.8')
    expect(detectDialect(doc('4.2'))).toBe('4')
    expect(detectDialect({ skeleton: {} }, '3.8')).toBe('3.8')
    expect(detectDialect({}, '4.3')).toBe('4')
    expect(detectDialect({ skeleton: { spine: '' } }, '3.8')).toBe('3.8')
  })
})

describe.each(['3.8', '4.2'] as const)('setBoneSetup on %s', (ver) => {
  it('JSON source keeps unknown fields', () => {
    const d = doc(ver)
    d.bones![3].color = 'ff00ffff'
    const before = JSON.parse(JSON.stringify(d))
    setBoneSetup(d, 'c', { rotation: 30, x: 1 })
    const after = JSON.parse(JSON.stringify(d))
    expect(after.bones[3]).toEqual({ ...before.bones[3], rotation: 30, x: 1 })
    expect({ ...after, bones: null }).toEqual({ ...before, bones: null })
    expect(after.bones.filter((_: unknown, i: number) => i !== 3)).toEqual(before.bones.filter((_: unknown, i: number) => i !== 3))
  })

  it('writes a default value only when the field exists', () => {
    const d = doc(ver)
    setBoneSetup(d, 'target', { rotation: 0, scaleX: 1, x: 0 })
    expect(d.bones!.find(b => b.name === 'target')).toEqual({ name: 'target', parent: 'root', x: 0, y: 80 })
  })

  it('rejects unknown bones, properties and non-finite values', () => {
    const d = doc(ver)
    expect(() => setBoneSetup(d, 'nope', { x: 1 })).toThrow(/NOT_FOUND/)
    expect(() => setBoneSetup(d, 'c', { z: 1 } as never)).toThrow(/INVALID_ARGUMENT/)
    expect(() => setBoneSetup(d, 'c', { x: 1, y: NaN })).toThrow(/INVALID_ARGUMENT/)
    expect(d.bones!.find(b => b.name === 'c')!.x).toBe(40)
  })
})

describe('Keyed bone after a setup change', () => {
  it('a key stays relative to the new setup rotation (4.2 runtime)', async () => {
    const mod = await loadRuntime('4.2')
    const d = doc('4.2')
    // anim keys rotate of "c" to 40 at 0.4 s; setup 5 → 30
    setBoneSetup(d, 'c', { rotation: 30 })
    const keys = (d.animations!.anim.bones as Record<string, { rotate: Array<{ time: number; value: number }> }>).c.rotate
    expect(keys.find(k => k.time === 0.4)!.value).toBe(40)

    const data = parse(mod, d)
    const skeleton = new mod.Skeleton(data)
    const state = new mod.AnimationState(new mod.AnimationStateData(data))
    state.setAnimation(0, 'anim', false)
    state.update(0.4)
    state.apply(skeleton)
    expect(skeleton.findBone('c').rotation).toBeCloseTo(70, 3)
  })
})

describe('getBoneKeys (7.1)', () => {
  it('reads 3.8 keys and its normalised curve', () => {
    const tls = getBoneKeys(doc('3.8'), { animation: 'anim', bone: 'c' })
    expect(tls.map(t => t.type)).toEqual(['rotate', 'translate', 'scale', 'shear'])
    expect(tls[0].keys).toEqual([
      { time: 0, value: { rotation: 0 }, easing: [0.25, 0, 0.75, 1] },
      { time: 0.4, value: { rotation: 40 }, easing: 'linear' },
      { time: 0.8, value: { rotation: 60 }, easing: 'stepped' },
      { time: 1.2, value: { rotation: 10 }, easing: 'linear' },
    ])
    expect(tls[2].keys[1]).toEqual({ time: 0.4, value: { scaleX: 1.5, scaleY: 0.8 }, easing: 'linear' })
  })

  it('reads 4.x keys under their stored types, absolute handles normalised, inherit skipped', () => {
    const d = doc('4.2')
    const tls = getBoneKeys(d, { animation: 'anim', bone: 'c' })
    expect(tls.map(t => t.type)).toEqual(['rotate', 'translatex', 'translatey', 'scale', 'shear'])
    expect(tls[0].keys[0].easing).toEqual([0.25, 0, 0.75, 1])
    expect(tls[2].keys[1]).toEqual({ time: 0.4, value: { y: -6 }, easing: 'linear' })
    expect(getBoneKeys(d, { animation: 'extra', bone: 'ns' }).map(t => t.type)).toEqual(['scalex', 'scaley', 'shearx', 'sheary'])
    expect(getBoneKeys(d, { animation: 'extra' }).map(t => t.bone)).toEqual(['c', 'tail', 'ns', 'ns', 'ns', 'ns'])
    expect(getBoneKeys(d, { animation: 'anim', bone: 'tail' })).toEqual([])
  })

  it('unknown animation or bone is NOT_FOUND', async () => {
    expect(await code(() => getBoneKeys(doc('4.2'), { animation: 'nope' }))).toBe('NOT_FOUND')
    expect(await code(() => getBoneKeys(doc('4.2'), { animation: 'anim', bone: 'nope' }))).toBe('NOT_FOUND')
  })
})

describe.each(FIXTURE_VERSIONS)('keys through the %s runtime (7.2, 7.3)', (ver) => {
  const fresh = () => {
    const d = doc(ver)
    createAnimation(d, 'wave')
    return d
  }

  it('"Add a rotate key": setup 10 + key 30 shows 40', async () => {
    const d = fresh()
    setBoneSetup(d, 'tail', { rotation: 10 })
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'rotate', time: 0.5, value: { rotation: 30 } })
    expect((await poseAt(ver, d, 'wave', 0.5, 'tail')).local.rotation).toBeCloseTo(40, 4)
  })

  it('"Key after the end": the duration follows the latest key', async () => {
    const d = fresh()
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'rotate', time: 0, value: { rotation: 0 } })
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'rotate', time: 1, value: { rotation: 5 } })
    expect((await poseAt(ver, d, 'wave', 0, 'tail')).duration).toBeCloseTo(1, 6)
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'translate', time: 1.5, value: { x: 1, y: 2 } })
    expect((await poseAt(ver, d, 'wave', 0, 'tail')).duration).toBeCloseTo(1.5, 6)
  })

  it('"Stepped key" holds until the next key', async () => {
    const d = fresh()
    upsertBoneKey(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 0, value: { rotation: 0 }, easing: 'stepped' })
    upsertBoneKey(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 1, value: { rotation: 90 } })
    expect((await poseAt(ver, d, 'wave', 0.99, 'knob')).local.rotation).toBeCloseTo(0, 4)
    expect((await poseAt(ver, d, 'wave', 1, 'knob')).local.rotation).toBeCloseTo(90, 4)
  })

  it('"Bezier key": 45 at 0.5 s, below 22.5 at 0.25 s; a value update keeps the easing', async () => {
    const d = fresh()
    upsertBoneKey(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 0, value: { rotation: 0 } })
    upsertBoneKey(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 1, value: { rotation: 90 } })
    setBoneKeyCurve(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 0, easing: [0.25, 0, 0.75, 1] })
    expect((await poseAt(ver, d, 'wave', 0.5, 'knob')).local.rotation).toBeCloseTo(45, 3)
    expect((await poseAt(ver, d, 'wave', 0.25, 'knob')).local.rotation).toBeLessThan(22.5)

    upsertBoneKey(d, { animation: 'wave', bone: 'knob', type: 'rotate', time: 1, value: { rotation: 160 } })
    expect(getBoneKeys(d, { animation: 'wave', bone: 'knob' })[0].keys[0].easing).toEqual([0.25, 0, 0.75, 1])
    expect((await poseAt(ver, d, 'wave', 0.5, 'knob')).local.rotation).toBeCloseTo(80, 3)
    expect((await poseAt(ver, d, 'wave', 0.25, 'knob')).local.rotation).toBeLessThan(40)
  })

  it('"Delete the last key": the timeline goes and the bone shows its setup position', async () => {
    const d = fresh()
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'rotate', time: 0, value: { rotation: 5 } })
    upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'translate', time: 0.5, value: { x: 7, y: 8 } })
    const res = deleteBoneKey(d, { animation: 'wave', bone: 'tail', type: 'translate', time: 0.5 })
    expect(res).toEqual({ bone: 'tail', type: 'translate', keys: [] })
    expect(Object.keys((d.animations!.wave.bones as Record<string, object>).tail)).toEqual(['rotate'])
    const { local } = await poseAt(ver, d, 'wave', 0.5, 'tail')
    expect([local.x, local.y]).toEqual([-40, 20])
    deleteBoneKey(d, { animation: 'wave', bone: 'tail', type: 'rotate', time: 0 })
    expect(d.animations!.wave).toEqual({})
  })

  it('"Create and key": an empty animation lasts 0 s, one key at 0.3 s makes it 0.3 s', async () => {
    const d = doc(ver)
    createAnimation(d, 'pose_a')
    expect((await poseAt(ver, d, 'pose_a', 0, 'root')).duration).toBe(0)
    upsertBoneKey(d, { animation: 'pose_a', bone: 'tail', type: 'shear', time: 0.3, value: { shearX: 1, shearY: 2 } })
    expect((await poseAt(ver, d, 'pose_a', 0, 'root')).duration).toBeCloseTo(0.3, 6)
  })
})

describe.each(['3.8', '4.2'] as const)('key edits on %s (7.2–7.4)', (ver) => {
  it('"Update an existing key": a key within 0.001 s is updated, keeps its time and easing', () => {
    const d = doc(ver)
    upsertBoneKey(d, { animation: 'anim', bone: 'c', type: 'rotate', time: 0.0004, value: { rotation: 7 } })
    const keys = getBoneKeys(d, { animation: 'anim', bone: 'c' })[0].keys
    expect(keys).toHaveLength(4)
    expect(keys[0]).toEqual({ time: 0, value: { rotation: 7 }, easing: [0.25, 0, 0.75, 1] })
  })

  it('a key inside a segment: sorted insert, the previous key keeps its curve, the new key is linear', () => {
    const d = doc(ver)
    const tl = upsertBoneKey(d, { animation: 'anim', bone: 'c', type: 'rotate', time: 0.2, value: { rotation: 10 } })
    expect(tl.keys.map(k => k.time)).toEqual([0, 0.2, 0.4, 0.8, 1.2])
    expect(tl.keys[0].easing).toEqual([0.25, 0, 0.75, 1])
    expect(tl.keys[1].easing).toBe('linear')
    const raw = (d.animations!.anim.bones as Record<string, Record<string, Array<Record<string, unknown>>>>).c.rotate
    if (ver === '4.2') expect(raw[0].curve).toEqual([0.05, 0, 0.15, 10])
    else expect(raw[0]).toMatchObject({ curve: 0.25, c2: 0, c3: 0.75, c4: 1 })
  })

  it('a new key needs every component; partial values update an existing key', async () => {
    const d = doc(ver)
    expect(await code(() => upsertBoneKey(d, { animation: 'anim', bone: 'c', type: 'scale', time: 2, value: { scaleX: 2 } }))).toBe('INVALID_ARGUMENT')
    const tl = upsertBoneKey(d, { animation: 'anim', bone: 'c', type: 'scale', time: 0.4, value: { scaleY: 3 } })
    expect(tl.keys[1].value).toEqual({ scaleX: 1.5, scaleY: 3 })
  })

  it('validates before changing anything', async () => {
    const d = doc(ver)
    const before = JSON.stringify(d)
    const key = { animation: 'anim', bone: 'c', type: 'rotate', time: 0.5, value: { rotation: 1 } }
    expect(await code(() => upsertBoneKey(d, { ...key, animation: 'nope' }))).toBe('NOT_FOUND')
    expect(await code(() => upsertBoneKey(d, { ...key, bone: 'nope' }))).toBe('NOT_FOUND')
    expect(await code(() => upsertBoneKey(d, { ...key, type: 'spin' }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => upsertBoneKey(d, { ...key, time: -1 }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => upsertBoneKey(d, { ...key, value: { x: 1 } }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => upsertBoneKey(d, { ...key, value: { rotation: Infinity } }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => upsertBoneKey(d, { ...key, easing: [1.5, 0, 0.5, 1] }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => setBoneKeyCurve(d, { ...key, time: 0, easing: [0.5, 0, -0.1, 1] }))).toBe('INVALID_ARGUMENT')
    expect(await code(() => setBoneKeyCurve(d, { ...key, easing: 'stepped' }))).toBe('NOT_FOUND')
    expect(await code(() => deleteBoneKey(d, key))).toBe('NOT_FOUND')
    expect(await code(() => deleteBoneKey(d, { ...key, bone: 'tail' }))).toBe('NOT_FOUND')
    expect(await code(() => createAnimation(d, ''))).toBe('INVALID_ARGUMENT')
    expect(await code(() => createAnimation(d, 'anim'))).toBe('INVALID_ARGUMENT')
    expect(JSON.stringify(d)).toBe(before)
  })

  it('setBoneKeyCurve writes the curve in the dialect\'s format; linear removes it', () => {
    const d = doc(ver)
    setBoneKeyCurve(d, { animation: 'anim', bone: 'c', type: 'scale', time: 0, easing: [0.5, 0.1, 0.5, 0.9] })
    const raw = (d.animations!.anim.bones as Record<string, Record<string, Array<Record<string, unknown>>>>).c.scale
    if (ver === '4.2') expect(raw[0].curve).toEqual([0.2, 1.05, 0.2, 1.45, 0.2, 0.98, 0.2, 0.82])
    else expect(raw[0]).toMatchObject({ curve: 0.5, c2: 0.1, c3: 0.5, c4: 0.9 })
    setBoneKeyCurve(d, { animation: 'anim', bone: 'c', type: 'scale', time: 0, easing: 'linear' })
    expect(raw).not.toBe((d.animations!.anim.bones as Record<string, Record<string, unknown>>).c.scale)
    expect(Object.keys((d.animations!.anim.bones as Record<string, Record<string, Array<object>>>).c.scale[0])).toEqual(['time', 'x', 'y'])
  })

  it('"Replace bone timelines" keeps the other timelines', () => {
    const d = doc(ver)
    const others = Object.keys(d.animations!.extra).filter(k => k !== 'bones')
    replaceBoneTimelines(d, 'extra')
    expect(Object.keys(d.animations!.extra)).toEqual(others)
  })
})

describe('separate-axis timelines', () => {
  it('"Separate-axis key on 4.2": a translatex timeline; y keeps following the setup pose', async () => {
    const d = doc('4.2')
    createAnimation(d, 'wave')
    const tl = upsertBoneKey(d, { animation: 'wave', bone: 'tail', type: 'translatex', time: 0.2, value: { x: 12 } })
    expect(tl).toEqual({ bone: 'tail', type: 'translatex', keys: [{ time: 0.2, value: { x: 12 }, easing: 'linear' }] })
    // frames are float32: 0.2 s is stored just above 0.2
    const { local } = await poseAt('4.2', d, 'wave', 0.25, 'tail')
    expect([local.x, local.y]).toEqual([-28, 20])
  })

  it('a separate-axis type on 3.8 is UNSUPPORTED', async () => {
    const d = doc('3.8')
    expect(await code(() => upsertBoneKey(d, { animation: 'anim', bone: 'c', type: 'translatex', time: 0, value: { x: 1 } }))).toBe('UNSUPPORTED')
  })

  it('per-channel 4.x curves: a value change rescales only that channel\'s handles', () => {
    const d = doc('4.2')
    upsertBoneKey(d, { animation: 'extra', bone: 'tail', type: 'translate', time: 0.5, value: { x: 20 } })
    const raw = (d.animations!.extra.bones as Record<string, Record<string, Array<Record<string, unknown>>>>).tail.translate
    expect(raw[0].curve).toEqual([0.125, 0, 0.375, 20, 0.05, -10, 0.45, -10])
  })
})

describe('pose keys (7.5)', () => {
  it('keyValueFromLocal: offsets from setup, scale as a factor, setup scale 0 refused', async () => {
    const setup = T({ rotation: 10, x: 2, scaleX: 1.5, scaleY: 0 })
    expect(keyValueFromLocal('rotate', T({ rotation: 50 }), setup)).toEqual({ rotation: 40 })
    expect(keyValueFromLocal('translatex', T({ x: 5 }), setup)).toEqual({ x: 3 })
    expect(keyValueFromLocal('scalex', T({ scaleX: 3 }), setup)).toEqual({ scaleX: 2 })
    expect(await code(() => keyValueFromLocal('scale', T(), setup, 'arm'))).toBe('INVALID_ARGUMENT')
  })

  it('poseKeyTypes: combined types, or separate axes when the bone keys that kind only on separate axes', () => {
    const d = doc('4.2')
    expect(poseKeyTypes(d, { animation: 'anim', bone: 'c' }, ['rotation', 'x', 'scaleY', 'shearX'])).toEqual(['rotate', 'translatex', 'scale', 'shear'])
    expect(poseKeyTypes(d, { animation: 'anim', bone: 'c' }, ['x', 'y'])).toEqual(['translatex', 'translatey'])
    expect(poseKeyTypes(d, { animation: 'extra', bone: 'ns' }, ['scaleX', 'shearY', 'y'])).toEqual(['translate', 'scalex', 'sheary'])
    expect(poseKeyTypes(doc('3.8'), { animation: 'anim', bone: 'c' }, ['x'])).toEqual(['translate'])
  })
})
