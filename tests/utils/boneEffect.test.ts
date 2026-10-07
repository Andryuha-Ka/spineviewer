import { describe, it, expect } from 'vitest'
import {
  computeBoneEffects, constraintText, effectTitle, EFFECT_REASON_TEXT, keyedBones, slotKind, timelineBones, weightBones,
  type EffectInput, type EffectSlot, type EffectLink,
} from '@/core/utils/boneEffect'

// root(0) ─ body(1) ─ arm(2) ─ hand(3)
//        └─ ctrl(4) ─ ctrl-child(5)
const NAMES = ['root', 'body', 'arm', 'hand', 'ctrl', 'ctrl-child']
const PARENT = [-1, 0, 1, 2, 0, 4]

function slot(bone: number, kind: EffectSlot['kind'] = 2, alpha = 1, extra: Partial<EffectSlot> = {}): EffectSlot {
  return { bone, kind, alpha, weights: null, userContent: false, ...extra }
}

function input(slots: EffectSlot[], links: EffectLink[] = [], over: Partial<EffectInput> = {}): EffectInput {
  const n = NAMES.length
  return {
    parent: PARENT,
    active: new Uint8Array(n).fill(1),
    zeroScale: new Uint8Array(n),
    keyed: new Uint8Array(n),
    slots, links, ...over,
  }
}

const run = (i: EffectInput) => Object.fromEntries(computeBoneEffects(NAMES, i).map(e => [e.name, e]))

describe('computeBoneEffects', () => {
  it('a drawn slot makes its bone and ancestors visible, not siblings or children', () => {
    const r = run(input([slot(2)]))
    expect(r.arm).toMatchObject({ visible: true, reason: null })
    expect(r.body.visible).toBe(true)
    expect(r.root.visible).toBe(true)
    expect(r.hand).toMatchObject({ visible: false, reason: 'no-attachments' })
    expect(r.ctrl).toMatchObject({ visible: false, reason: 'no-attachments' })
  })

  it('returns one record per bone in skeleton order', () => {
    expect(computeBoneEffects(NAMES, input([])).map(e => e.name)).toEqual(NAMES)
  })

  it('alpha below 1/255 gives hidden, also on ancestors without other drawn slots', () => {
    const r = run(input([slot(3, 2, 0)]))
    expect(r.hand).toMatchObject({ visible: false, reason: 'hidden' })
    expect(r.root).toMatchObject({ visible: false, reason: 'hidden' })
    expect(run(input([slot(3, 2, 1 / 255)])).hand.visible).toBe(true)
  })

  it('a slot without attachment gives no-attachments', () => {
    expect(run(input([slot(3, 0)])).hand.reason).toBe('no-attachments')
  })

  it('point, bounding-box and path attachments never draw', () => {
    expect(run(input([slot(3, 1), slot(3, 1)])).hand).toMatchObject({ visible: false, reason: 'no-attachments' })
  })

  it('zero world scale gives hidden', () => {
    const zeroScale = new Uint8Array(NAMES.length); zeroScale[3] = 1
    expect(run(input([slot(3)], [], { zeroScale })).hand).toMatchObject({ visible: false, reason: 'hidden' })
  })

  it('an inactive bone is inactive even with a drawn descendant', () => {
    const active = new Uint8Array(NAMES.length).fill(1); active[4] = 0; active[5] = 0
    const r = run(input([slot(5), slot(2)], [], { active }))
    expect(r.ctrl).toMatchObject({ visible: false, reason: 'inactive' })
    expect(r['ctrl-child']).toMatchObject({ visible: false, reason: 'inactive' })
    expect(r.root.visible).toBe(true)
  })

  it('a slot of an inactive bone is not drawn: its active ancestors are hidden', () => {
    const active = new Uint8Array(NAMES.length).fill(1); active[5] = 0
    expect(run(input([slot(5)], [], { active })).ctrl).toMatchObject({ visible: false, reason: 'hidden' })
  })

  it('mesh weight bones are visible', () => {
    const r = run(input([slot(1, 2, 1, { weights: [2, 4, 5, 1, 5] })]))
    expect(r.ctrl.visible).toBe(true)
    expect(r['ctrl-child'].visible).toBe(true)
    expect(r.hand.visible).toBe(false)
  })

  it('a hidden weighted mesh does not mark its weight bones', () => {
    expect(run(input([slot(1, 2, 0, { weights: [1, 5] })]))['ctrl-child'].visible).toBe(false)
  })

  it('IK target is visible when the link is passed, not when it is left out (mix 0)', () => {
    const ik: EffectLink = { name: 'arm-ik', driven: [2, 3], drivers: [5] }
    const on = run(input([slot(3)], [ik]))
    expect(on['ctrl-child'].visible).toBe(true)
    expect(on.ctrl.visible).toBe(true)
    const off = run(input([slot(3)]))
    expect(off['ctrl-child']).toMatchObject({ visible: false, reason: 'no-attachments' })
  })

  it('a link moving only invisible bones marks nothing', () => {
    expect(run(input([], [{ name: 'ik', driven: [3], drivers: [5] }]))['ctrl-child'].visible).toBe(false)
  })

  it('chained links reach a fixpoint regardless of order', () => {
    // a draws → second marks b → first marks c → third marks d; listed so one pass is not enough
    const names = ['root', 'a', 'b', 'c', 'd']
    const parent = [-1, 0, 0, 0, 0]
    const links: EffectLink[] = [
      { name: 'first', driven: [2], drivers: [3] },
      { name: 'second', driven: [1], drivers: [2] },
      { name: 'third', driven: [3], drivers: [4] },
    ]
    const n = names.length
    const res = computeBoneEffects(names, {
      parent, active: new Uint8Array(n).fill(1), zeroScale: new Uint8Array(n), keyed: new Uint8Array(n),
      slots: [slot(1)], links,
    })
    expect(res.map(e => e.visible)).toEqual([true, true, true, true, true])
  })

  it('path target bone and path weight bones are drivers', () => {
    const path: EffectLink = { name: 'path', driven: [2], drivers: [4, 5] }
    const r = run(input([slot(2)], [path]))
    expect(r.ctrl.visible).toBe(true)
    expect(r['ctrl-child'].visible).toBe(true)
  })

  it('user content counts as drawn, even without attachment', () => {
    expect(run(input([slot(5, 0, 1, { userContent: true })]))['ctrl-child'].visible).toBe(true)
  })

  it('clipping draws regardless of alpha', () => {
    expect(run(input([slot(5, 3, 0)]))['ctrl-child'].visible).toBe(true)
  })

  it('lists constraints acting on a bone in link order, without duplicates', () => {
    const links: EffectLink[] = [
      { name: 'ik', driven: [2, 3], drivers: [5] },
      { name: 'tc', driven: [3, 3], drivers: [4] },
    ]
    const r = run(input([slot(3)], links))
    expect(r.hand.constraints).toEqual(['ik', 'tc'])
    expect(r.arm.constraints).toEqual(['ik'])
    expect(r['ctrl-child'].constraints).toEqual([])
  })

  it('passes keyed through', () => {
    const keyed = new Uint8Array(NAMES.length); keyed[4] = 1
    const r = run(input([], [], { keyed }))
    expect(r.ctrl.keyed).toBe(true)
    expect(r.hand.keyed).toBe(false)
  })
})

describe('effect texts', () => {
  it('match the spec strings', () => {
    expect(EFFECT_REASON_TEXT).toEqual({
      inactive: 'Bone is not in the applied skins',
      hidden: 'Attachments hidden in the current frame',
      'no-attachments': 'No drawn attachments on this bone or its children',
    })
    expect(constraintText(['arm-ik'])).toBe('Driven by arm-ik — constrained properties ignore local edits')
    expect(constraintText(['a', 'b'])).toBe('Driven by a, b — constrained properties ignore local edits')
    expect(constraintText([])).toBe('')
  })

  it('effectTitle joins reason and constraints', () => {
    expect(effectTitle({ visible: true, reason: null, constraints: [] })).toBe('')
    expect(effectTitle({ visible: false, reason: 'hidden', constraints: ['ik'] }))
      .toBe('Attachments hidden in the current frame\nDriven by ik — constrained properties ignore local edits')
    expect(effectTitle(undefined)).toBe('')
  })
})

describe('reader helpers', () => {
  it('slotKind maps attachment types', () => {
    expect([null, 'region', 'mesh', 'clipping', 'point', 'boundingbox', 'path', 'other'].map(t => slotKind(t as never)))
      .toEqual([0, 2, 2, 3, 1, 1, 1, 1])
  })

  it('keyedBones follows every track and its mixingFrom chain', () => {
    const anim = (bones: number[]) => ({ bones })
    const tracks = [
      { animation: anim([1]), mixingFrom: { animation: anim([2]), mixingFrom: null } },
      null,
      { animation: anim([4]), mixingFrom: null },
    ]
    expect(Array.from(keyedBones(6, tracks, a => a.bones))).toEqual([0, 1, 1, 0, 1, 0])
  })

  it('timelineBones collects boneIndex timelines once per animation', () => {
    const cache = new WeakMap<object, Int32Array>()
    const anim = { timelines: [{ boneIndex: 3 }, { slotIndex: 1 }, { boneIndex: 3 }, { boneIndex: 0 }] }
    const first = timelineBones(cache, anim)
    expect(Array.from(first)).toEqual([3, 0])
    expect(timelineBones(cache, anim)).toBe(first)
  })

  it('weightBones flattens raw weighted bone lists', () => {
    const out = [9]
    weightBones([2, 4, 5, 1, 5], out)
    expect(out).toEqual([9, 4, 5, 5])
  })
})
