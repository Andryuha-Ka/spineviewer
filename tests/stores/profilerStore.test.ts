import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProfilerStore } from '@/core/stores/useProfilerStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useProfilerStore FPS history', () => {
  it('returns fewer than 120 samples in order', () => {
    const store = useProfilerStore()
    for (const fps of [10, 20, 30]) store.recordFrame(fps, 16)
    expect(store.getFpsHistory()).toEqual([10, 20, 30])
  })

  it('keeps the last 120 of 125 samples, oldest first', () => {
    const store = useProfilerStore()
    for (let i = 1; i <= 125; i++) store.recordFrame(i, 16)
    const history = store.getFpsHistory()
    expect(history).toHaveLength(120)
    expect(history[0]).toBe(6)
    expect(history[119]).toBe(125)
    expect(history).toEqual(Array.from({ length: 120 }, (_, i) => i + 6))
  })

  it('updates latestFps after recordFrame', () => {
    const store = useProfilerStore()
    expect(store.latestFps).toBe(0)
    store.recordFrame(42, 16)
    expect(store.latestFps).toBe(42)
    store.recordFrame(58, 16)
    expect(store.latestFps).toBe(58)
  })

  it('clear() empties the history and resets latestFps', () => {
    const store = useProfilerStore()
    store.recordFrame(60, 16)
    expect(store.latestFps).toBe(60)
    store.clear()
    expect(store.getFpsHistory()).toEqual([])
    expect(store.latestFps).toBe(0)
  })
})

describe('useProfilerStore warm-up window', () => {
  function frames(store: ReturnType<typeof useProfilerStore>, n: number, fps: number): void {
    for (let i = 0; i < n; i++) store.recordFrame(fps, 100)
  }

  it('does not log slow frames during the first 30 frames but keeps them in history', () => {
    const store = useProfilerStore()
    frames(store, 30, 10)
    expect(store.slowFrames).toEqual([])
    expect(store.getFpsHistory()).toHaveLength(30)
  })

  it('logs the 31st slow frame', () => {
    const store = useProfilerStore()
    frames(store, 30, 10)
    store.recordFrame(20, 50)
    expect(store.slowFrames).toHaveLength(1)
    expect(store.slowFrames[0].fps).toBe(20)
  })

  it('reopens the window after clear()', () => {
    const store = useProfilerStore()
    frames(store, 31, 10)
    store.clear()
    frames(store, 30, 10)
    expect(store.slowFrames).toEqual([])
  })

  it('reopens the window after restartWarmup() and keeps the FPS history', () => {
    const store = useProfilerStore()
    frames(store, 31, 10)
    store.restartWarmup()
    store.clearSlowFrames()
    frames(store, 30, 10)
    expect(store.slowFrames).toEqual([])
    expect(store.getFpsHistory()).toHaveLength(61)
  })

  it('does not reopen the window after clearSlowFrames()', () => {
    const store = useProfilerStore()
    frames(store, 31, 10)
    store.clearSlowFrames()
    store.recordFrame(20, 50)
    expect(store.slowFrames).toHaveLength(1)
  })
})
