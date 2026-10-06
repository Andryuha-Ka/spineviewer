import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import path from 'path'
import Spine43Adapter from '@/adapters/pixi8/spine43/Spine43Adapter'
import type { FileSet } from '@/core/types/FileSet'

const ROOT = path.resolve(__dirname, '../../../example/4.3')

function fileSet(dir: string, skeleton: string, atlas: string): FileSet {
  const p = (f: string) => path.join(ROOT, dir, f)
  const isJson = skeleton.endsWith('.json')
  const buf = readFileSync(p(skeleton))
  return {
    skeleton: {
      filename: skeleton,
      fileBody: isJson ? buf.toString('utf-8') : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      type: isJson ? 'skeleton-json' : 'skeleton-skel',
      mimeType: '',
    },
    atlas: { filename: atlas, fileBody: readFileSync(p(atlas), 'utf-8'), type: 'atlas', mimeType: '' },
    images: [],
  }
}

const adapters: Spine43Adapter[] = []
async function load(dir: string, skeleton: string, atlas = `${dir}.atlas`): Promise<Spine43Adapter> {
  const a = new Spine43Adapter()
  // no WebGL / image decoding under happy-dom: pages stay without textures
  vi.spyOn(a as unknown as { _loadTextures: () => Promise<Map<string, unknown>> }, '_loadTextures')
    .mockResolvedValue(new Map())
  await a.load(fileSet(dir, skeleton, atlas))
  adapters.push(a)
  return a
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spineOf = (a: Spine43Adapter) => a.getSpineObject() as any

afterEach(() => {
  while (adapters.length) adapters.pop()!.destroy()
})

describe.skipIf(!existsSync(ROOT))('Spine43Adapter on example/4.3', () => {
  const samples: Array<[string, string, string]> = []
  if (existsSync(ROOT)) {
    for (const dir of readdirSync(ROOT)) {
      for (const f of readdirSync(path.join(ROOT, dir))) {
        if (/\.(json|skel)$/.test(f)) samples.push([dir, f, `${dir}.atlas`])
      }
    }
  }

  it.each(samples)('%s/%s loads, animates and reports live data', async (dir, skel, atlas) => {
    const a = await load(dir, skel, atlas)
    expect(a.detectedVersion).toBe('4.3')
    expect(spineOf(a).renderPipeId).toBe('spine43')
    expect(a.animations.length).toBeGreaterThan(0)
    expect(a.bones.length).toBeGreaterThan(0)
    expect(a.slots.length).toBeGreaterThan(0)
    expect(a.getAllAttachments().length).toBeGreaterThan(0)

    a.setAnimation(0, a.animations[0], true)
    spineOf(a).update(0.1)
    const [track] = a.getTrackStates()
    expect(track.animationName).toBe(a.animations[0])
    expect(track.additive).toBe(false)
    expect(track.mixInterpolation).toBe('linear')
    expect(a.getBoneTransforms()).toHaveLength(a.bones.length)
    expect(a.getBoneTransforms().every(b => isFinite(b.x) && isFinite(b.y))).toBe(true)
    expect(a.getActiveAttachments().length).toBeGreaterThan(0)
    const bounded = a.slots.map(s => a.getSlotBounds(s.name)).filter(b => b !== null)
    expect(bounded.length).toBeGreaterThan(0)
  })

  it('pins container-movement physics inheritance to zero', async () => {
    const phys = spineOf(await load('celestial-circus', 'celestial-circus-pro.skel')).skeletonPhysics
    expect(phys.rotationInheritance).toBe(0)
  })

  it('reads event payloads from eventData.setupPose', async () => {
    const a = await load('spineboy', 'spineboy-pro.json')
    expect(a.events.find(e => e.name === 'footstep')).toBeDefined()
    expect(a.getAnimationEvents('walk').some(m => m.name === 'footstep')).toBe(true)
  })

  it('lists placeholders of every skin (mix-and-match)', async () => {
    const a = await load('mix-and-match', 'mix-and-match-pro.skel')
    expect(a.skins.length).toBe(34)
    const all = a.getAllAttachments()
    expect(new Set(all.map(x => `${x.slotName}::${x.attachmentName}`)).size).toBe(all.length)
    expect(all.some(x => x.type === 'mesh' && (x.vertexCount ?? 0) > 0)).toBe(true)
    a.setSkins(['full-skins/girl', 'accessories/backpack'])
    a.setSkin('full-skins/boy')
    expect(a.getActiveAttachments().length).toBeGreaterThan(0)
  })

  it('setup pose, bone setup transform and local edits', async () => {
    const a = await load('spineboy', 'spineboy-pro.skel')
    const setup = a.getBoneSetupTransform('front-thigh')!
    expect(setup).not.toBeNull()
    a.setBoneLocalTransform('front-thigh', { rotation: setup.rotation + 30 })
    expect(spineOf(a).skeleton.findBone('front-thigh').pose.rotation).toBeCloseTo(setup.rotation + 30)
    a.setToSetupPose()
    expect(spineOf(a).skeleton.findBone('front-thigh').pose.rotation).toBeCloseTo(setup.rotation)
    a.setBonesToSetupPose()
    a.setSlotsToSetupPose()
  })

  it('diamond: slider listing, free bones and time/mix overrides', async () => {
    const a = await load('diamond', 'diamond-pro.json')
    const [s] = a.getSliders()
    expect(s).toMatchObject({ name: 'rotation', bone: 'diamond-rotation-control', property: 'rotate' })

    // diamond keys its driver bone in appear/disappear/idle-rotating, so only root stays free
    const free = a.getFreeBones()
    expect(free).toEqual(['root'])
    const sliderAnim = spineOf(a).skeleton.data.findAnimation(s.animation)
    const driven: string[] = [...sliderAnim.bones].map((i: number) => a.bones[i].name)
    expect(driven).toEqual(expect.arrayContaining(['top-rotation', 'middle-rotation']))
    for (const b of driven) expect(free).not.toContain(b)

    const slider = spineOf(a).skeleton.constraints.find((c: { data: { name: string } }) => c.data.name === 'rotation')
    const bone = slider.bone
    a.setSliderPose('rotation', { time: 0.25, mix: 0.5 })
    expect(slider.bone).toBeNull()
    spineOf(a).update(0.016)
    expect(a.getSliders()[0].time).toBeCloseTo(0.25)
    expect(a.getSliders()[0].mix).toBeCloseTo(0.5)
    // 'disappear' keys the slider mix; the override must win every frame
    a.setAnimation(0, 'disappear', true)
    spineOf(a).update(0.5)
    expect(a.getSliders()[0]).toMatchObject({ time: expect.closeTo(0.25), mix: expect.closeTo(0.5) })

    a.resetSlider('rotation')
    expect(slider.bone).toBe(bone)
    expect(slider.pose.time).toBeCloseTo(s.setupTime)
    expect(slider.pose.mix).toBeCloseTo(s.setupMix)
  })

  it('track mix options: runtime interpolations, live entries and new entries', async () => {
    const a = await load('spineboy', 'spineboy-pro.json')
    expect(a.mixInterpolations).toEqual(['linear', 'smooth', 'slowFast', 'fastSlow', 'circle'])
    a.setAnimation(1, 'walk', true)
    a.addAnimation(1, 'run', true)
    a.setTrackMixOptions(1, { additive: true, mixInterpolation: 'smooth' })
    expect(spineOf(a).state.animationsChanged).toBe(true)
    const entry = spineOf(a).state.getTrack(1)
    expect(entry.next.additive).toBe(true)
    let [t] = a.getTrackStates()
    expect(t).toMatchObject({ trackIndex: 1, additive: true, mixInterpolation: 'smooth' })

    a.setAnimation(1, 'jump', false)
    ;[t] = a.getTrackStates()
    expect(t).toMatchObject({ animationName: 'jump', additive: true, mixInterpolation: 'smooth' })
    a.setTrackMixOptions(1, { mixInterpolation: 'nope' })
    ;[t] = a.getTrackStates()
    expect(t.mixInterpolation).toBe('smooth')
  })

  it('mix duration: _onEntry keeps additive/curve on set and queued entries, real delay maths', async () => {
    const a = await load('spineboy', 'spineboy-pro.json')
    const state = spineOf(a).state
    a.setTrackMixOptions(1, { mixDuration: 0.3, additive: true, mixInterpolation: 'circle' })
    a.setAnimation(1, 'jump', false)
    a.addAnimation(1, 'walk', true)
    const cur = state.getTrack(1)
    const queued = cur.next
    expect(cur).toMatchObject({ additive: true, mixDuration: 0.3, delay: 0 })
    expect(queued).toMatchObject({ additive: true, mixDuration: 0.3 })
    expect(queued.delay).toBeCloseTo(a.getAnimationDuration('jump')! - 0.3)
    expect(a.getTrackStates()[0]).toMatchObject({ trackIndex: 1, mixDuration: 0.3, additive: true, mixInterpolation: 'circle' })

    // duration-only patch: re-times the queued entry, leaves hold modes alone
    state.animationsChanged = false
    a.setTrackMixOptions(1, { mixDuration: 0.5 })
    expect(state.animationsChanged).toBe(false)
    expect(cur.mixDuration).toBe(0.3)
    expect(queued.mixDuration).toBe(0.5)
    expect(queued.delay).toBeCloseTo(a.getAnimationDuration('jump')! - 0.5)
    expect(queued.additive).toBe(true)

    // walking the chain from the base still runs _onEntry
    a.setTrackMixOptions(2, { additive: true })
    a.setAnimation(2, 'idle', true)
    a.addAnimation(2, 'run', true)
    a.setTrackMixOptions(2, { mixDuration: 0.1 })
    expect(state.getTrack(2).next).toMatchObject({ additive: true, mixDuration: 0.1 })
  })
})
