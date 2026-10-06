import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FreeBonePanel from '@/components/panels/FreeBonePanel.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import type { SliderInfo } from '@/core/types/ISpineAdapter'

const BLINK: SliderInfo = {
  name: 'blink', animation: 'blink', bone: null, property: null,
  time: 0.2, mix: 1, setupTime: 0.2, setupMix: 1, loop: false, additive: false,
}

function populate(freeBones: string[], sliders: SliderInfo[]) {
  const store = useSkeletonStore()
  store.populate({ animations: [], skins: [], bones: [], slots: [], events: [], freeBones, sliders })
  return store
}

describe('FreeBonePanel sliders', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  async function commit(index: number, value: string) {
    const input = wrapper.findAll('.slider-list input')[index]
    await input.setValue(value) // fires input + change
    return input.element as HTMLInputElement
  }

  it('shows only the Sliders section when there are no free bones', () => {
    populate([], [BLINK])
    wrapper = mount(FreeBonePanel)
    expect(wrapper.text()).not.toContain('not keyframed')
    expect(wrapper.text()).toContain('Sliders')
    expect(wrapper.text()).toContain('1 slider')
    const [time, mix] = wrapper.findAll('.slider-list input').map(i => i.element as HTMLInputElement)
    expect([time.value, mix.value]).toEqual(['0.2', '1'])
  })

  it('keeps the free-bone hint and hides Sliders without sliders', () => {
    populate(['a', 'b'], [])
    wrapper = mount(FreeBonePanel)
    expect(wrapper.text()).toContain('2 bones · not keyframed')
    expect(wrapper.text()).not.toContain('Sliders')
  })

  it('applies committed values, clamps them and ignores non-numeric input', async () => {
    const store = populate([], [BLINK])
    const spy = vi.spyOn(store, 'setSliderPose')
    wrapper = mount(FreeBonePanel)
    await commit(0, '0.5')
    expect((await commit(1, '2')).value).toBe('1')
    await commit(0, '-3')
    expect((await commit(0, 'x')).value).toBe('0')
    expect(spy.mock.calls).toEqual([['blink', { time: 0.5 }], ['blink', { mix: 1 }], ['blink', { time: 0 }]])
  })

  it('↺ resets inputs and the slider; a skeleton switch drops edits', async () => {
    const store = populate([], [BLINK])
    const spy = vi.spyOn(store, 'resetSlider')
    wrapper = mount(FreeBonePanel)
    await commit(0, '0.7')
    await wrapper.find('.slider-list .reset-btn').trigger('click')
    expect(spy).toHaveBeenCalledWith('blink')
    expect((wrapper.findAll('.slider-list input')[0].element as HTMLInputElement).value).toBe('0.2')
    await commit(0, '0.9')
    store.sliders = [{ ...BLINK }]
    await nextTick()
    expect((wrapper.findAll('.slider-list input')[0].element as HTMLInputElement).value).toBe('0.2')
  })
})
