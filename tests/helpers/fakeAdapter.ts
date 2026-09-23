import { vi } from 'vitest'
import type { ISpineAdapter, TrackState } from '@/core/types/ISpineAdapter'

export interface FakeSpineObject {
  x: number
  y: number
  zIndex: number
  scale: { value: number; set(v: number): void }
}

/** In-memory ISpineAdapter: records calls, keeps a track list and placeholder containers. */
export function makeFakeAdapter(tracks: TrackState[] = []) {
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
    animations: [] as string[],
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
    setPlaceholderLabels:   vi.fn(),
    clearPlaceholderLabels: vi.fn(),
    addImageToPlaceholder:      vi.fn(),
    removeImageFromPlaceholder: vi.fn(),
    setImageTransform:          vi.fn(),
    spineObj,
    containers,
  }
  return adapter as typeof adapter & ISpineAdapter
}

export const track = (trackIndex: number, animationName: string, time = 0, loop = true): TrackState =>
  ({ trackIndex, animationName, time, duration: 2, loop, timeScale: 1, queue: [] })
