import { describe, it, expect } from 'vitest'
import {
  FIXTURE_VERSIONS, FIXTURE_SPINE_STRINGS, readFixtureJson, stubAttachmentLoader, loadRuntime,
} from '../fixtures/spine/fixtures'

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
