import { describe, it, expect } from 'vitest'
import {
  FIXTURE_VERSIONS, FIXTURE_SPINE_STRINGS, readFixtureJson, stubAttachmentLoader, loadRuntime,
} from '../fixtures/spine/fixtures'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import { loadFixtureAdapter, step } from './fixtureAdapters'

describe.each(FIXTURE_VERSIONS)('fixture %s', ver => {
  it('parses with the real SkeletonJson and a stub attachment loader', async () => {
    const mod = await loadRuntime(ver)
    const data = new mod.SkeletonJson(stubAttachmentLoader(mod)).readSkeletonData(JSON.parse(readFixtureJson(ver)))

    expect(data.version).toBe(FIXTURE_SPINE_STRINGS[ver])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(data.bones.map((b: any) => b.name)).toEqual(['root', 'a', 'b', 'c', 'target', 'tail', 'knob', 'p1', 'tcb', 'ns'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(data.animations.map((a: any) => a.name).sort())
      .toEqual(['anim', 'extra', ...(ver === '4.3' ? ['folder'] : []), 'slider-anim'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(data.slots.map((s: any) => s.name)).toEqual(['body', 'mesh', 'wmesh', 'path', 'seq', 'misc'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(data.skins.map((s: any) => s.name)).toEqual(['default', 'alt'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(data.events.map((e: any) => e.name)).toEqual(['hit', 'snd'])
    expect(data.defaultSkin.getAttachment(1, 'mesh-linked').getParentMesh?.() ?? data.defaultSkin.getAttachment(1, 'mesh-linked').getSourceMesh())
      .toBe(data.defaultSkin.getAttachment(1, 'mesh'))
    expect(!!data.defaultSkin.getAttachment(4, 'seq').sequence).toBe(ver !== '3.8' && ver !== '4.0')
    expect(data.defaultSkin.getAttachment(0, 'body')).toBeTruthy()

    const c = data.findBone('c')
    expect((ver === '4.3' ? c.setupPose : c).shearX).toBe(10)

    const anim = data.findAnimation('anim')
    expect(anim.duration).toBeCloseTo(1.2)
    // 3.8: rotate, translate, scale, shear; 4.x: translate split into x and y
    expect(anim.timelines.length).toBe(ver === '3.8' ? 4 : 5)

    if (ver === '4.3') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(data.constraints.map((k: any) => k.name)).toEqual(['ik', 'phys', 'slide', 'tc', 'pathc'])
      expect(data.findConstraint('slide', mod.SliderData).animation.name).toBe('slider-anim')
    } else {
      expect(data.ikConstraints.map((k: { name: string }) => k.name)).toEqual(['ik'])
      expect(data.transformConstraints.map((k: { name: string }) => k.name)).toEqual(['tc'])
      expect(data.pathConstraints.map((k: { name: string }) => k.name)).toEqual(['pathc'])
      expect(data.physicsConstraints?.length ?? 0).toBe(ver === '4.2' ? 1 : 0)
    }
  })
})

describe.each(FIXTURE_VERSIONS)('bone effects on %s', ver => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Rt = any
  const effects = (a: ISpineAdapter) => Object.fromEntries(a.getBoneEffects().map(e => [e.name, e]))
  // 4.3 slots carry pose + appliedPose; 3.8–4.2 hold attachment and colour on the slot
  const slotPoses = (a: ISpineAdapter, names: string[]): Rt[] =>
    (a.getSpineObject() as Rt).skeleton.slots
      .filter((s: Rt) => names.includes(s.data.name))
      .flatMap((s: Rt) => (s.pose ? [s.pose, s.appliedPose] : [s]))
  const A_AND_B_SLOTS = ['body', 'mesh', 'wmesh']

  it('setup pose: drawn bones, their ancestors and the IK target are visible; IK lists its bones', async () => {
    const a = await loadFixtureAdapter(ver)
    step(a, 0)
    const e = effects(a)
    expect(a.getBoneEffects().map(x => x.name)).toEqual(a.bones.map(b => b.name))
    for (const b of ['root', 'a', 'b', 'target']) expect(e[b], b).toMatchObject({ visible: true, reason: null })
    for (const b of ['c', 'tail', 'knob', 'p1', 'tcb', 'ns']) {
      expect(e[b], b).toMatchObject({ visible: false, reason: 'no-attachments' })
    }
    expect(e.a.constraints).toEqual(['ik'])
    expect(e.b.constraints).toEqual(['ik'])
    expect(e.tcb.constraints).toEqual([])   // transform mix 0
    expect(e.p1.constraints).toEqual([])    // path mix 0
    expect(e.tail.constraints).toEqual([])  // physics is never listed
    expect(Object.values(e).some(x => x.keyed)).toBe(false)
    a.destroy()
  })

  it('slot alpha 0 gives hidden, no attachment gives no-attachments, and the IK target follows', async () => {
    const a = await loadFixtureAdapter(ver)
    step(a, 0)
    for (const p of slotPoses(a, A_AND_B_SLOTS)) p.color.a = 0
    let e = effects(a)
    expect(e.a).toMatchObject({ visible: false, reason: 'hidden' })
    expect(e.b).toMatchObject({ visible: false, reason: 'hidden' })
    expect(e.target).toMatchObject({ visible: false, reason: 'no-attachments' })
    expect(e.root.visible).toBe(true) // seq region on root

    for (const p of slotPoses(a, A_AND_B_SLOTS)) p.attachment = null
    e = effects(a)
    expect(e.a).toMatchObject({ visible: false, reason: 'no-attachments' })
    expect(e.b).toMatchObject({ visible: false, reason: 'no-attachments' })
    a.destroy()
  })

  it('a bone keyed by the current animation is keyed', async () => {
    const a = await loadFixtureAdapter(ver)
    a.setAnimation(0, 'anim', true)
    step(a, 0.1)
    const e = effects(a)
    expect(e.c.keyed).toBe(true)
    expect(e.knob.keyed).toBe(false)
    a.clearTracks()
    step(a, 0)
    expect(effects(a).c.keyed).toBe(false)
    a.destroy()
  })

  it('a user image in a slot without attachment draws on Pixi 8 only (Pixi 7 hides the slot container)', async () => {
    const a = await loadFixtureAdapter(ver)
    for (const p of slotPoses(a, A_AND_B_SLOTS)) p.attachment = null
    a.addImageToPlaceholder('body', 'data:image/png;base64,iVBORw0KGgo=', 'img')
    step(a, 0)
    const pixi8 = ver === '4.2' || ver === '4.3'
    expect(effects(a).a.visible).toBe(pixi8)
    a.destroy()
  })
})

describe.each(FIXTURE_VERSIONS)('constraint links on %s', ver => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Rt = any
  it('transform and path constraints with a non-zero mix are listed; 4.3 sliders too', async () => {
    const a = await loadFixtureAdapter(ver)
    step(a, 0)
    const sk = (a.getSpineObject() as Rt).skeleton
    const all: Rt[] = sk.constraints ?? [...sk.transformConstraints, ...sk.pathConstraints]
    for (const c of all) {
      if (!['tc', 'pathc'].includes(c.data.name)) continue
      for (const p of c.pose ? [c.pose, c.appliedPose] : [c]) {
        if ('rotateMix' in p) p.rotateMix = 1
        else p.mixRotate = 1
      }
    }
    const e = Object.fromEntries(a.getBoneEffects().map(x => [x.name, x]))
    expect(e.tcb.constraints).toEqual(['tc'])
    // 3.8–4.1 sort constraints by order 0..count-1; the fixture's pathc has order 3 of 3, so it stays inactive there
    expect(e.p1.constraints).toEqual(ver === '4.2' || ver === '4.3' ? ['pathc'] : [])
    expect(e.knob.constraints).toEqual(ver === '4.3' ? ['slide'] : [])
    a.destroy()
  })
})
