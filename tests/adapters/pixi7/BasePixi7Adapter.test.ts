import { describe, it, expect } from 'vitest'
import * as runtime38 from '@pixi-spine/runtime-3.8'
import * as runtime41 from '@pixi-spine/runtime-4.1'
import { BasePixi7Adapter } from '@/adapters/pixi7/BasePixi7Adapter'

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
