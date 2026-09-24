import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToolbarTrackControls from '@/components/ui/ToolbarTrackControls.vue'
import AnimationSelect from '@/components/ui/AnimationSelect.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'

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

describe('ToolbarTrackControls empty-track Loop', () => {
  it('does not follow a track change', async () => {
    setActivePinia(createPinia())
    const skeleton = useSkeletonStore()
    skeleton.animations = ['idle']
    const anim = useAnimationStore()
    anim.currentTrack = 3
    const wrapper = mount(ToolbarTrackControls, { attachTo: document.body })
    wrapper.findComponent({ name: 'Checkbox' }).vm.$emit('update:checked', true)
    await wrapper.vm.$nextTick()
    anim.currentTrack = 5
    await wrapper.vm.$nextTick()
    wrapper.findAllComponents(AnimationSelect)[1].vm.$emit('select', 'idle')
    expect(wrapper.emitted('setAnimation')).toEqual([[5, 'idle', false]])
    wrapper.unmount()
  })
})
