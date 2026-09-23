import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CompareFileSlot from '@/components/compare/CompareFileSlot.vue'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useCompareStore } from '@/core/stores/useCompareStore'
import type { SpineSlot } from '@/core/types/FileSet'

describe('CompareFileSlot (B4)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('selects the picked skeleton when an errored slot precedes it', async () => {
    const slots: SpineSlot[] = [
      { id: 'x', name: 'X', error: 'Missing atlas' },
      { id: 'y', name: 'Y' },
      { id: 'z', name: 'Z' },
    ]
    useFileLoaderStore().spineSlots = slots
    const wrapper = mount(CompareFileSlot, { props: { side: 'left' }, attachTo: document.body })

    await wrapper.find('.slot-btn').trigger('click')
    const pick = () => wrapper.findAll('.dropdown-item').find(b => b.text() === 'Z')!
    expect(wrapper.findAll('.dropdown-item-name').map(n => n.text())).toEqual(['Y', 'Z'])
    await pick().trigger('click')

    expect(useCompareStore().leftSlot).toMatchObject({ source: 'loaded', slotIndex: 2, label: 'Z' })

    await wrapper.find('.slot-btn').trigger('click')
    expect(pick().classes()).toContain('dropdown-item--active')
    wrapper.unmount()
  })
})
