import { describe, it, expect } from 'vitest'
import {
  BasePixi8Adapter, classifyAttachment, meshVertexCount,
  type Pixi8SpineLike, type Pixi8TrackEntry, type Pixi8LabelPose,
} from '@/adapters/pixi8/BasePixi8Adapter'

function entry(name: string, duration: number, next: Pixi8TrackEntry | null = null): Pixi8TrackEntry {
  return { animation: { name, duration }, trackTime: 0, loop: false, timeScale: 1, mixDuration: 0, delay: 0, next }
}

const DURATIONS: Record<string, number> = { a: 2, b: 1, c: 0.4 }

class TestAdapter extends BasePixi8Adapter<Pixi8SpineLike> {
  readonly detectedVersion = 'test'
  tracks: Array<Pixi8TrackEntry | null> = []
  onEntry: Array<[number, Pixi8TrackEntry]> = []

  constructor() {
    super()
    const tracks = this.tracks
    this._spine = {
      state: {
        timeScale: 1,
        // runtime-like: default mix 0, a queued entry's delay = predecessor's complete (non-looping duration)
        setAnimation(track, name, loop) {
          const e = { ...entry(name, DURATIONS[name] ?? 1), loop }
          tracks[track] = e
          return e
        },
        addAnimation(track, name, loop, delay) {
          let last = tracks[track]
          const e = { ...entry(name, DURATIONS[name] ?? 1), loop }
          if (!last) { tracks[track] = e; return e }
          while (last.next) last = last.next
          last.next = e
          e.delay = delay <= 0 ? delay + last.animation!.duration : delay
          return e
        },
        clearTrack() {}, clearTracks() {},
        addListener() {}, removeListener() {},
      },
      skeleton: { slots: [] },
      destroy() {},
    }
  }

  protected _onEntry(track: number, e: Pixi8TrackEntry): void { this.onEntry.push([track, e]) }

  async load(): Promise<void> {}
  setSkin(): void {}
  setSkins(): void {}
  setToSetupPose(): void {}
  setBonesToSetupPose(): void {}
  setSlotsToSetupPose(): void {}
  getBoneTransforms() { return [] }
  getActiveAttachments() { return [] }
  getAllAttachments() { return [] }
  getSlotBounds() { return null }
  getFreeBones() { return [] }
  setBoneLocalTransform(): void {}
  getBoneSetupTransform() { return null }

  protected _trackEntry(track: number): Pixi8TrackEntry | null { return this.tracks[track] ?? null }
  protected _labelPose(): Pixi8LabelPose | null { return null }
  protected _slotAlpha(): number { return 1 }
}

describe('BasePixi8Adapter track operations', () => {
  it('getTrackStates reports current entries with their queue', () => {
    const a = new TestAdapter()
    const e = entry('idle', 2, entry('walk', 1, entry('run', 0.5)))
    e.next!.loop = true
    e.trackTime = 0.3
    e.loop = true
    e.timeScale = 0.5
    a.tracks[1] = e
    a.tracks[2] = { ...entry('x', 1), animation: null }
    expect(a.getTrackStates()).toEqual([{
      trackIndex: 1, animationName: 'idle', time: 0.3, duration: 2, loop: true, timeScale: 0.5,
      queue: [{ animationName: 'walk', loop: true }, { animationName: 'run', loop: false }],
      mixDuration: 0,
    }])
  })

  it('getTrackStates is empty when nothing is loaded', () => {
    const a = new TestAdapter()
    a.tracks[0] = entry('idle', 1)
    a.destroy()
    expect(a.getTrackStates()).toEqual([])
  })

  it('setTrackLoop, setTrackTimeScale and seekTo write through _trackEntry', () => {
    const a = new TestAdapter()
    const e = entry('idle', 2)
    a.tracks[0] = e
    a.setTrackLoop(0, true)
    a.setTrackTimeScale(0, 2)
    a.seekTo(0, 1.25)
    expect(e).toMatchObject({ loop: true, timeScale: 2, trackTime: 1.25 })
    expect(() => { a.setTrackLoop(5, true); a.setTrackTimeScale(5, 1); a.seekTo(5, 1) }).not.toThrow()
  })

  it('removeQueueEntry unlinks the queued entry at index', () => {
    const a = new TestAdapter()
    const e = entry('a', 1, entry('b', 1, entry('c', 1, entry('d', 1))))
    a.tracks[0] = e
    a.removeQueueEntry(0, 1) // removes 'c'
    expect(a.getTrackStates()[0].queue.map(q => q.animationName)).toEqual(['b', 'd'])
    a.removeQueueEntry(0, 0) // removes 'b'
    expect(a.getTrackStates()[0].queue.map(q => q.animationName)).toEqual(['d'])
    a.removeQueueEntry(0, 5) // out of range: no-op
    expect(a.getTrackStates()[0].queue.map(q => q.animationName)).toEqual(['d'])
  })
})

describe('BasePixi8Adapter track mix duration', () => {
  it('set entry gets the duration, delay untouched; first entry on an empty track too', () => {
    const a = new TestAdapter()
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    a.setAnimation(0, 'a', false)
    expect(a.tracks[0]).toMatchObject({ mixDuration: 0.5, delay: 0 })
    a.addAnimation(1, 'b', false) // empty track: behaves like set
    expect(a.tracks[1]).toMatchObject({ mixDuration: 0, delay: 0 })
  })

  it('queued entry delay = complete - mix, clamped at 0; explicit delay kept', () => {
    const a = new TestAdapter()
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    a.setAnimation(0, 'a', false)
    a.addAnimation(0, 'b', false)
    a.addAnimation(0, 'c', false) // predecessor b lasts 1
    a.addAnimation(0, 'a', false, 3)
    const q1 = a.tracks[0]!.next!
    expect(q1).toMatchObject({ mixDuration: 0.5, delay: 1.5 })
    expect(q1.next).toMatchObject({ mixDuration: 0.5, delay: 0.5 })
    expect(q1.next!.next).toMatchObject({ mixDuration: 0.5, delay: 3 })

    a.setTrackMixOptions(1, { mixDuration: 1 })
    a.setAnimation(1, 'c', false)
    a.addAnimation(1, 'a', false) // c lasts 0.4 < 1
    expect(a.tracks[1]!.next).toMatchObject({ mixDuration: 1, delay: 0 })
  })

  it('a patch re-times only next entries and reports via getTrackStates', () => {
    const a = new TestAdapter()
    a.setAnimation(0, 'a', false)
    a.addAnimation(0, 'b', false)
    a.onEntry = []
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    const cur = a.tracks[0]!
    expect(cur).toMatchObject({ mixDuration: 0, delay: 0 })
    expect(cur.next).toMatchObject({ mixDuration: 0.5, delay: 1.5 })
    expect(a.onEntry).toEqual([[0, cur.next]])
    expect(a.getTrackStates()[0].mixDuration).toBe(0.5)

    a.setTrackMixOptions(0, { mixDuration: -1 })
    expect(a.getTrackStates()[0].mixDuration).toBe(0)
    expect(cur.next).toMatchObject({ mixDuration: 0, delay: 2 })
    a.onEntry = []
    a.setTrackMixOptions(0, { additive: true })
    expect(a.onEntry).toEqual([])
  })

  it('_onEntry runs after the duration is applied for set and queued entries', () => {
    const a = new TestAdapter()
    a.setTrackMixOptions(2, { mixDuration: 0.25 })
    a.setAnimation(2, 'a', true)
    a.addAnimation(2, 'b', false)
    expect(a.onEntry.map(([t, e]) => [t, e.animation!.name, e.mixDuration])).toEqual([[2, 'a', 0.25], [2, 'b', 0.25]])
  })

  it('destroy clears the per-track durations', () => {
    const a = new TestAdapter()
    a.setTrackMixOptions(0, { mixDuration: 0.5 })
    a.destroy()
    expect((a as unknown as { _mixDurations: Map<number, number> })._mixDurations.size).toBe(0)
  })
})

describe('classifyAttachment / meshVertexCount', () => {
  class RegionAttachment { width = 10; height = 10 }
  class MeshAttachment { triangles = [0, 1, 2]; worldVerticesLength = 8 }
  class ClippingAttachment { endSlot = null; worldVerticesLength = 6 }

  it('classifies by constructor name', () => {
    expect(classifyAttachment(new RegionAttachment())).toBe('region')
    expect(classifyAttachment(new MeshAttachment())).toBe('mesh')
    expect(classifyAttachment(new ClippingAttachment())).toBe('clipping')
    expect(classifyAttachment(null)).toBe('other')
  })

  it('falls back to property shape for minified names', () => {
    expect(classifyAttachment({ width: 1, height: 1 })).toBe('region')
    expect(classifyAttachment({ triangles: [], worldVerticesLength: 4 })).toBe('mesh')
    // linked mesh: own triangles come from the parent, shape is still a mesh
    expect(classifyAttachment({ triangles: [0, 1, 2], parentMesh: {}, worldVerticesLength: 6 })).toBe('mesh')
    expect(classifyAttachment({ endSlot: null })).toBe('clipping')
  })

  it('counts mesh vertices only', () => {
    expect(meshVertexCount(new MeshAttachment())).toBe(4)
    expect(meshVertexCount({ triangles: [0, 1, 2], parentMesh: {}, worldVerticesLength: 6 })).toBe(3)
    expect(meshVertexCount(new RegionAttachment())).toBeUndefined()
    expect(meshVertexCount(new ClippingAttachment())).toBeUndefined()
    expect(meshVertexCount({ triangles: [] })).toBeUndefined()
  })
})
