import { describe, it, expect } from 'vitest'
import * as runtime38 from '@pixi-spine/runtime-3.8'
import * as runtime41 from '@pixi-spine/runtime-4.1'
import { BasePixi7Adapter } from '@/adapters/pixi7/BasePixi7Adapter'
import { loadFixtureAdapter, step, local, applied, world } from '../fixtureAdapters'

interface FakeEntry {
  animation: { name: string; duration: number }
  trackTime: number
  loop: boolean
  timeScale: number
  mixDuration: number
  delay: number
  next: FakeEntry | null
}

const DURATIONS: Record<string, number> = { a: 2, b: 1, c: 0.4 }

// runtime-like state: default mix 0, a queued entry's delay = predecessor's non-looping duration
function fakeState() {
  const tracks: Array<FakeEntry | null> = []
  const make = (name: string, loop: boolean): FakeEntry => ({
    animation: { name, duration: DURATIONS[name] ?? 1 }, trackTime: 0, loop, timeScale: 1, mixDuration: 0, delay: 0, next: null,
  })
  return {
    tracks,
    getCurrent: (t: number) => tracks[t] ?? null,
    setAnimation(t: number, name: string, loop: boolean) { return (tracks[t] = make(name, loop)) },
    addAnimation(t: number, name: string, loop: boolean, delay: number) {
      const e = make(name, loop)
      let last = tracks[t]
      if (!last) return (tracks[t] = e)
      while (last.next) last = last.next
      last.next = e
      e.delay = delay <= 0 ? delay + last.animation.duration : delay
      return e
    },
  }
}

class TestAdapter extends BasePixi7Adapter {
  readonly detectedVersion: string
  // TODO: remove when @pixi-spine ships typed runtime modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(state: any, private readonly mod: Record<string, unknown> = {}, version = 'test') {
    super()
    this.detectedVersion = version
    ;(this as unknown as { _spine: unknown })._spine = { state, destroy() {} }
  }
  protected get spineModule() { return this.mod }
}

describe('BasePixi7Adapter track mix duration', () => {
  it('set entry gets the duration with delay untouched; addAnimation on an empty track behaves like set', () => {
    const s = fakeState()
    const a = new TestAdapter(s)
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    a.setAnimation(0, 'a', false)
    expect(s.tracks[0]).toMatchObject({ mixDuration: 0.5, delay: 0 })
    a.setTrackMixOptions(1, { mixDuration: 0.5 })
    a.addAnimation(1, 'b', false)
    expect(s.tracks[1]).toMatchObject({ mixDuration: 0.5, delay: 0 })
  })

  it('queued entry delay = complete - mix, clamped at 0; explicit delay kept', () => {
    const s = fakeState()
    const a = new TestAdapter(s)
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    a.setAnimation(0, 'a', false)
    a.addAnimation(0, 'b', false)
    a.addAnimation(0, 'c', false)
    a.addAnimation(0, 'a', false, 3)
    const q = s.tracks[0]!.next!
    expect(q).toMatchObject({ mixDuration: 0.5, delay: 1.5 })
    expect(q.next).toMatchObject({ mixDuration: 0.5, delay: 0.5 })
    expect(q.next!.next).toMatchObject({ mixDuration: 0.5, delay: 3 })

    a.setTrackMixOptions(1, { mixDuration: 1 })
    a.setAnimation(1, 'c', false)
    a.addAnimation(1, 'a', false) // c lasts 0.4 < 1
    expect(s.tracks[1]!.next).toMatchObject({ mixDuration: 1, delay: 0 })
  })

  it('setTrackMixOptions re-applies only to next entries and stores negative values as 0', () => {
    const s = fakeState()
    const a = new TestAdapter(s)
    a.setAnimation(0, 'a', false)
    a.addAnimation(0, 'b', false)
    a.addAnimation(0, 'c', false)
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    const cur = s.tracks[0]!
    expect(cur).toMatchObject({ mixDuration: 0, delay: 0 })
    expect(cur.next).toMatchObject({ mixDuration: 0.5, delay: 1.5 })
    expect(cur.next!.next).toMatchObject({ mixDuration: 0.5, delay: 0.5 })
    expect(a.getTrackStates()[0].mixDuration).toBe(0.5)

    a.setTrackMixOptions(0, { mixDuration: -2 })
    expect(a.getTrackStates()[0].mixDuration).toBe(0)
    expect(cur.next).toMatchObject({ mixDuration: 0, delay: 2 })
    a.setTrackMixOptions(0, { additive: true, mixInterpolation: 'smooth' }) // ignored on Pixi 7
    expect(a.getTrackStates()[0]).not.toHaveProperty('additive')
  })

  it('getTrackStates reports mixDuration 0 by default; destroy clears it', () => {
    const s = fakeState()
    const a = new TestAdapter(s)
    a.setAnimation(2, 'a', true)
    expect(a.getTrackStates()).toEqual([expect.objectContaining({ trackIndex: 2, mixDuration: 0 })])
    a.setTrackMixOptions(2, { mixDuration: 0.3 })
    a.destroy()
    ;(a as unknown as { _spine: unknown })._spine = { state: s, destroy() {} }
    expect(a.getTrackStates()[0].mixDuration).toBe(0)
  })
})

// Real pixi-spine AnimationState, headless: A (1 s) then B queued with mix 0.5.
describe.each([['3.8', runtime38], ['4.1', runtime41]] as const)('BasePixi7Adapter on the real %s AnimationState', (version, mod) => {
  // TODO: remove when @pixi-spine ships typed runtime modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any
  function setup(durations: Record<string, number>) {
    const anims: Record<string, unknown> = {}
    for (const [n, d] of Object.entries(durations)) anims[n] = new m.Animation(n, [], d)
    const state = new m.AnimationState(new m.AnimationStateData({ findAnimation: (n: string) => anims[n] ?? null }))
    return { state, adapter: new TestAdapter(state, m, version) }
  }
  const DT = 1 / 60
  // the runtime advances trackLast only in apply(); no timelines, so an empty skeleton is enough
  const skeleton = { slots: [], bones: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step = (state: any) => { state.update(DT); state.apply(skeleton) }

  it('B starts 0.5 s before A ends and mixes in over 0.5 s, from its own start', () => {
    const { state, adapter } = setup({ A: 1, B: 1 })
    adapter.setTrackMixOptions(0, { mixDuration: 0.5 })
    adapter.setAnimation(0, 'A', false)
    adapter.addAnimation(0, 'B', false)

    let t = 0
    while (state.getCurrent(0).animation.name === 'A' && t < 2) { step(state); t += DT }
    const b = state.getCurrent(0)
    expect(b.animation.name).toBe('B')
    expect(t).toBeCloseTo(0.5, 1)
    expect(b.trackTime).toBeLessThan(2 * DT) // no mid-animation start
    expect(b.mixingFrom?.animation.name).toBe('A')
    expect(b.mixDuration).toBe(0.5)

    let mixT = 0
    while (b.mixingFrom && mixT < 2) { step(state); mixT += DT }
    expect(mixT).toBeCloseTo(0.5, 1)
  })

  it('clamps the delay when mix exceeds the predecessor, so B never starts mid-animation', () => {
    const { state, adapter } = setup({ A: 0.3, B: 1 })
    adapter.setTrackMixOptions(0, { mixDuration: 0.5 })
    adapter.setAnimation(0, 'A', false)
    adapter.addAnimation(0, 'B', false)
    expect(state.getCurrent(0).next.delay).toBe(0)
    step(state) // first frame only records A's track time
    step(state)
    const b = state.getCurrent(0)
    expect(b.animation.name).toBe('B')
    expect(b.trackTime).toBeLessThan(3 * DT)
  })

  it('without the clamp the runtime would start B mid-animation (why the clamp exists)', () => {
    const { state, adapter } = setup({ A: 0.3, B: 1 })
    adapter.setAnimation(0, 'A', false)
    adapter.addAnimation(0, 'B', false)
    const queued = state.getCurrent(0).next
    queued.mixDuration = 0.5
    queued.delay = 0.3 - 0.5 // what 3.8/4.0/4.1 leave without a clamp
    step(state)
    step(state)
    expect(state.getCurrent(0).trackTime).toBeGreaterThan(0.2)
  })
})

describe('BasePixi7Adapter override hook (fake skeleton)', () => {
  it('writes overrides after state.apply and before the original world update, at once and on every update', () => {
    const log: string[] = []
    const bone = { data: { x: 0, y: 0, rotation: 5, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }, x: 0, y: 0, rotation: 5, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }
    const skeleton = {
      findBone: (n: string) => (n === 'c' ? bone : null),
      updateWorldTransform() { log.push(`world:${bone.rotation}`) },
    }
    const state = { apply() { bone.rotation = 20; log.push('apply') } }
    const a = new TestAdapter(state)
    // SpineBase.update: state.apply(skeleton) then skeleton.updateWorldTransform()
    const update = () => { state.apply(); skeleton.updateWorldTransform() }
    ;(a as unknown as { _spine: unknown })._spine = { state, skeleton, update, destroy() {} }
    ;(a as unknown as { _hookOverrides(s: unknown): void })._hookOverrides(skeleton)

    a.setBoneOverride('c', { rotation: 45 })
    expect(log).toEqual(['apply', 'world:45'])
    a.setBoneOverride('nope', { rotation: 1 }) // unknown bone: ignored
    expect(a.getBoneOverrides()).toEqual({ c: { rotation: 45 } })
    log.length = 0
    update()
    expect(log).toEqual(['apply', 'world:45'])

    log.length = 0
    a.setBoneOverride('c', null)
    expect(log).toEqual(['apply', 'world:20'])
  })
})

describe.each(['3.8', '4.0', '4.1'] as const)('BasePixi7Adapter on the %s fixture', ver => {
  it('reads local shear, applied pose after IK and world shear', async () => {
    const a = await loadFixtureAdapter(ver)
    step(a, 0)
    expect(local(a, 'c')).toEqual({ x: 40, y: 0, rotation: 5, scaleX: 1.2, scaleY: 1, shearX: 10, shearY: -5 })
    expect(applied(a, 'c')).toEqual(local(a, 'c'))
    // IK bends a and b away from their unconstrained rotation
    expect(local(a, 'a').rotation).toBe(90)
    expect(Math.abs(applied(a, 'a').rotation - 90)).toBeGreaterThan(1)
    expect(world(a, 'c').shearY).toBeCloseTo(-15, 4)
    expect(world(a, 'a').shearY).toBeCloseTo(0, 4)
    expect(a.getBoneSetupTransform('c')).toEqual(local(a, 'c'))
  })

  it('holds an override over a keyed rotate, while paused and after setToSetupPose; release returns to setup', async () => {
    const a = await loadFixtureAdapter(ver)
    a.setAnimation(0, 'anim', true)
    step(a, 0.6)
    expect(local(a, 'c').rotation).toBeCloseTo(55, 4) // keyed: setup 5 + 50

    a.setBoneOverride('c', { rotation: 45 })
    a.setBoneOverride('c', { shearX: 3 })
    expect(a.getBoneOverrides()).toEqual({ c: { rotation: 45, shearX: 3 } })
    step(a, 0.1)
    expect(local(a, 'c')).toMatchObject({ rotation: 45, shearX: 3 })
    expect(local(a, 'c').x).not.toBe(40) // keyed translate still plays

    a.setTimeScale(0)
    a.setBoneOverride('c', { rotation: 30 })
    step(a, 0.016)
    expect(local(a, 'c').rotation).toBe(30)
    const worldRot = world(a, 'c').rotation

    // the override and the world transform are back before the next frame
    a.setToSetupPose()
    expect(local(a, 'c').rotation).toBe(30)
    expect(world(a, 'c').rotation).toBeCloseTo(worldRot, 4)
    a.setBonesToSetupPose()
    expect(local(a, 'c').rotation).toBe(30)
    step(a, 0)
    expect(local(a, 'c').rotation).toBe(30)

    a.clearTracks()
    a.setBoneOverride('c', null)
    expect(local(a, 'c')).toMatchObject({ rotation: 5, shearX: 10 })
    step(a, 0.016)
    expect(local(a, 'c')).toMatchObject({ rotation: 5, shearX: 10 })
    expect(a.getBoneOverrides()).toEqual({})
  })

  // a reload mounts and replays a fresh adapter, then the app may render before the Spine ticker runs
  it('is posed before its first tick: mount, replayed seek and override, then a setup-pose reset', async () => {
    const a = await loadFixtureAdapter(ver)
    const pose = () => a.getBoneTransforms().map(b => [b.name, b.x, b.y, b.rotation])
    a.mount({ addChild() {}, removeChild() {} })
    expect(world(a, 'c').x).not.toBe(0)
    a.setAnimation(0, 'anim', true)
    a.seekTo(0, 0.6)
    a.setBoneOverride('c', { shearX: 3 })
    expect(local(a, 'c')).toMatchObject({ rotation: expect.closeTo(55, 4), shearX: 3 })
    const posed = pose()
    step(a, 0)
    expect(pose()).toEqual(posed)

    a.setBoneOverride('c', { rotation: 33 })
    a.clearTracks()
    a.setToSetupPose()
    expect(local(a, 'c')).toMatchObject({ rotation: 33, shearX: 3, x: 40 })
    const reset = pose()
    step(a, 0)
    expect(pose()).toEqual(reset)
  })

  it('release on an unkeyed bone writes the setup value once', async () => {
    const a = await loadFixtureAdapter(ver)
    a.setBoneOverride('tail', { rotation: 70, x: 5 })
    step(a, 0.016)
    expect(local(a, 'tail')).toMatchObject({ rotation: 70, x: 5 })
    a.setBoneOverride('tail', null)
    a.setBoneOverride('tail', { x: 5 }) // partial release = release all, then set what stays
    step(a, 0.016)
    expect(local(a, 'tail')).toMatchObject({ rotation: 30, x: 5 })
  })
})
