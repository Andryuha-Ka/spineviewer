import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolbarTrackControls from '@/components/ui/ToolbarTrackControls.vue'
import AnimationSelect from '@/components/ui/AnimationSelect.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'

describe('ToolbarTrackControls skin picker', () => {
  let wrapper: VueWrapper
  let store: ReturnType<typeof useSkeletonStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useSkeletonStore()
    store.animations = ['idle']
    store.skins = ['default', 'red', 'blue']
    store.activeSkins = ['red']
  })
  afterEach(() => wrapper.unmount())

  const skinPicker = () => wrapper.findAllComponents(AnimationSelect)[0]

  it('is the first control and shows the active skin', () => {
    wrapper = mount(ToolbarTrackControls, { attachTo: document.body })
    const first = wrapper.find('.track-controls').element.firstElementChild!
    expect(first.classList.contains('track-controls__skin')).toBe(true)
    expect(skinPicker().props('value')).toBe('red')
  })

  it('pick applies one skin, leaves Composer and emits setSkins', async () => {
    store.activeSkins = ['red', 'blue']
    store.composerMode = true
    wrapper = mount(ToolbarTrackControls, { attachTo: document.body })
    expect(skinPicker().props('value')).toBe('Composite (2)')
    skinPicker().vm.$emit('select', 'blue')
    await wrapper.vm.$nextTick()
    expect(store.activeSkins).toEqual(['blue'])
    expect(store.composerMode).toBe(false)
    expect(wrapper.emitted('setSkins')).toEqual([[['blue']]])
  })

  it('is disabled with "No skins" when the skeleton has none', () => {
    store.skins = []
    store.activeSkins = []
    wrapper = mount(ToolbarTrackControls, { attachTo: document.body })
    expect(skinPicker().props('disabled')).toBe(true)
    expect(skinPicker().props('placeholder')).toBe('No skins')
  })
})
