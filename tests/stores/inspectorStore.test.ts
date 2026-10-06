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
