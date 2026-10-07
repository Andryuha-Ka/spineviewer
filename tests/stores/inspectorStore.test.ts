import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import { slider } from '../helpers/fakeAdapter'

describe('inspector store sliders', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('update() writes sliders and clear() empties them', () => {
    const store = useInspectorStore()
    store.update([], [], [slider('blink', { time: 0.5 })])
    expect(store.sliders.map(s => s.name)).toEqual(['blink'])
    store.update([], [])
    expect(store.sliders).toEqual([])
    store.update([], [], [slider('blink')])
    store.clear()
    expect(store.sliders).toEqual([])
  })
})

describe('inspector store bone effects', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('update() indexes effects by name, omitting them empties the record, clear() resets', () => {
    const store = useInspectorStore()
    const glow = { name: 'glow', visible: false, reason: 'no-attachments' as const, keyed: true, constraints: [] }
    const arm = { name: 'arm', visible: true, reason: null, keyed: false, constraints: ['arm-ik'] }
    store.update([], [], [], [glow, arm])
    expect(store.boneEffects.glow).toEqual(glow)
    expect(store.boneEffects.arm.constraints).toEqual(['arm-ik'])
    store.update([], [])
    expect(store.boneEffects).toEqual({})
    store.update([], [], [], [glow])
    store.clear()
    expect(store.boneEffects).toEqual({})
  })

  it('update() keeps the record object while effects are unchanged and replaces it on any change', () => {
    const store = useInspectorStore()
    const make = (over = {}) => [
      { name: 'arm', visible: true, reason: null, keyed: false, constraints: ['arm-ik'] },
      { name: 'glow', visible: false, reason: 'hidden' as const, keyed: false, constraints: [], ...over },
    ]
    store.update([], [], [], make())
    const first = store.boneEffects
    store.update([], [], [], make())
    expect(store.boneEffects).toBe(first)
    for (const over of [{ visible: true, reason: null }, { keyed: true }, { constraints: ['c'] }]) {
      const prev = store.boneEffects
      store.update([], [], [], make(over))
      expect(store.boneEffects).not.toBe(prev)
    }
    const prev = store.boneEffects
    store.update([], [], [], make().slice(0, 1))
    expect(store.boneEffects).not.toBe(prev)
  })
})
