import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { FAKE_MIX_INTERPOLATIONS, makeFakeAdapter, slider, withSpine43 } from '../helpers/fakeAdapter'

describe('skeleton store populateFrom', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('fills sliders and mix interpolations from a 4.3 adapter and resets every slider', () => {
    const store = useSkeletonStore()
    const adapter = withSpine43(makeFakeAdapter([], ['idle']), [slider('blink'), slider('look', { bone: 'ctrl', property: 'rotate' })])
    store.populateFrom(adapter)
    expect(store.animations).toEqual(['idle'])
    expect(store.sliders.map(s => s.name)).toEqual(['blink', 'look'])
    expect(store.mixInterpolations).toEqual([...FAKE_MIX_INTERPOLATIONS])
    expect(adapter.resetSlider.mock.calls).toEqual([['blink'], ['look']])
  })

  it('leaves both fields empty for a pre-4.3 adapter', () => {
    const store = useSkeletonStore()
    store.populateFrom(withSpine43(makeFakeAdapter(), [slider('blink')]))
    store.populateFrom(makeFakeAdapter())
    expect(store.sliders).toEqual([])
    expect(store.mixInterpolations).toEqual([])
  })

  it('forwards slider edits to the attached adapter', () => {
    const store = useSkeletonStore()
    const adapter = withSpine43(makeFakeAdapter(), [slider('blink')])
    store.populateFrom(adapter)
    store.setSliderPose('blink', { time: 0.5 })
    store.resetSlider('blink')
    expect(adapter.setSliderPose).toHaveBeenCalledWith('blink', { time: 0.5 })
    expect(adapter.resetSlider).toHaveBeenLastCalledWith('blink')
    store.clear()
    expect(store.sliders).toEqual([])
    expect(store.mixInterpolations).toEqual([])
  })
})

describe('skeleton store composerMode', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to false, can be set, and clear() resets it', () => {
    const store = useSkeletonStore()
    expect(store.composerMode).toBe(false)
    store.composerMode = true
    expect(store.composerMode).toBe(true)
    store.clear()
    expect(store.composerMode).toBe(false)
  })
})
