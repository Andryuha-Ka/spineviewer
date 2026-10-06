import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SkeletonPanel from '@/components/panels/SkeletonPanel.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'

describe('SkeletonPanel sliders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSkeletonStore().populate({ animations: ['idle'], skins: [], bones: [], slots: [], events: [] })
  })

  it('has no Sliders section without sliders', () => {
    const w = mount(SkeletonPanel)
    expect(w.find('.section--sliders').exists()).toBe(false)
    w.unmount()
  })

  it('lists live time and mix with two decimals', () => {
    useInspectorStore().sliders = [{
      name: 'blink', animation: 'blink', bone: null, property: null,
      time: 0.456, mix: 1, setupTime: 0, setupMix: 1, loop: false, additive: false,
    }]
    const w = mount(SkeletonPanel)
    const section = w.find('.section--sliders')
    expect(section.text()).toContain('Sliders')
    expect(section.text()).toContain('(1)')
    expect(section.find('.slider-row').text()).toBe('blinktime 0.46 · mix 1.00')
    w.unmount()
  })
})
