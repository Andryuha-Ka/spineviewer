import { vi } from 'vitest'
import type { ISpineAdapter, SliderInfo, TrackState } from '@/core/types/ISpineAdapter'

export interface FakeSpineObject {
  x: number
  y: number
  zIndex: number
  scale: { value: number; set(v: number): void }
}

/** Animation names the fake skeleton has unless a test passes its own. */
export const FAKE_ANIMATIONS = ['idle', 'run', 'stop', 'win', 'blink', 'wave', 'off', 'a', 'b', 'c', 'x', 'y']

/** In-memory ISpineAdapter: records calls, keeps a track list and placeholder containers. */
export function makeFakeAdapter(tracks: TrackState[] = [], animations: string[] = FAKE_ANIMATIONS) {
  const spineObj: FakeSpineObject = {
    x: 0, y: 0, zIndex: 0,
    scale: { value: 1, set(v: number) { this.value = v } },
  }
  const containers = new Map<string, { children: unknown[]; addChild(c: unknown): void }>()
  const container = (ph: string) => {
    if (!containers.has(ph)) {
      const c = { children: [] as unknown[], addChild(child: unknown) { this.children.push(child) } }
      containers.set(ph, c)
    }
    return containers.get(ph)!
  }
  const adapter = {
    animations: [...animations],
    skins: [] as string[],
    bones: [], slots: [], events: [],
    tracks,
    load:           vi.fn(async () => {}),
    mount:          vi.fn(),
    destroy:        vi.fn(),
    setAnimation:   vi.fn(),
    addAnimation:   vi.fn(),
    seekTo:         vi.fn(),
    setSkins:       vi.fn(),
    setTimeScale:   vi.fn(),
    getTrackStates: vi.fn(() => adapter.tracks),
    getSpineObject: vi.fn(() => spineObj),
    getPlaceholderContainer: vi.fn((ph: string) => container(ph)),
    getFreeBones:           vi.fn(() => []),
    getAllAttachments:      vi.fn(() => []),
    getActiveAttachments:   vi.fn(() => []),
    getAnimationEvents:     vi.fn(() => []),
    onEvent:                vi.fn(() => () => {}),
    setTrackTimeScale:      vi.fn(),
    setTrackMixOptions:     vi.fn(),
    setPlaceholderLabels:   vi.fn(),
    clearPlaceholderLabels: vi.fn(),
    addImageToPlaceholder:      vi.fn(),
    removeImageFromPlaceholder: vi.fn(),
    setImageTransform:          vi.fn(),
    setImageZIndex:             vi.fn(),
    spineObj,
    containers,
  }
  return adapter as typeof adapter & ISpineAdapter
}

/** Mix interpolation names a 4.3 runtime reports, in declaration order. */
export const FAKE_MIX_INTERPOLATIONS = ['linear', 'smooth', 'slowFast', 'fastSlow', 'circle'] as const

export const slider = (name: string, over: Partial<SliderInfo> = {}): SliderInfo => ({
  name, animation: name, bone: null, property: null,
  time: 0, mix: 1, setupTime: 0, setupMix: 1, loop: false, additive: false, ...over,
})

/** Turns a fake into a Spine 4.3 adapter: sliders, mix interpolations and recording slider setters. */
export function withSpine43<A extends ReturnType<typeof makeFakeAdapter>>(adapter: A, sliders: SliderInfo[] = []) {
  const ext = {
    sliders,
    mixInterpolations: [...FAKE_MIX_INTERPOLATIONS] as readonly string[],
    getSliders:         vi.fn(() => ext.sliders),
    setSliderPose:      vi.fn(),
    resetSlider:        vi.fn(),
  }
  return Object.assign(adapter, ext)
}

export const track = (trackIndex: number, animationName: string, time = 0, loop = true): TrackState =>
  ({ trackIndex, animationName, time, duration: 2, loop, timeScale: 1, queue: [], mixDuration: 0 })
