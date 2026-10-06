import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import type { SliderInfo } from '@/core/types/ISpineAdapter'

vi.mock('@/components/stage/PreviewStage.vue', () => ({ default: { name: 'PreviewStage', render: () => null } }))
const { default: ViewerPage } = await import('@/components/pages/ViewerPage.vue')

const SLIDER = {
  name: 's', animation: 's', bone: null, property: null,
  time: 0, mix: 1, setupTime: 0, setupMix: 1, loop: false, additive: false,
} satisfies SliderInfo

function hasBonesTab(freeBones: string[], sliders: SliderInfo[]): boolean {
  useSkeletonStore().populate({ animations: [], skins: [], bones: [], slots: [], events: [], freeBones, sliders })
  const w = shallowMount(ViewerPage, { global: { renderStubDefaultSlot: true } })
  const found = w.findAll('tab-pane-stub').some(p => p.attributes('name') === 'bones')
  w.unmount()
  return found
}

describe('ViewerPage Bones tab', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is hidden without free bones or sliders', () => expect(hasBonesTab([], [])).toBe(false))
  it('shows for free bones', () => expect(hasBonesTab(['a'], [])).toBe(true))
  it('shows for sliders only', () => expect(hasBonesTab([], [SLIDER])).toBe(true))
})
