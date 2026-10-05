import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'

describe('SettingsPopover', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => wrapper.unmount())

  it('names the focusable palette trigger "Palette"', async () => {
    wrapper = mount(SettingsPopover, { attachTo: document.body })
    await wrapper.find('.settings-btn').trigger('click')
    await nextTick()

    const trigger = document.body.querySelector('.n-base-selection-label[tabindex="0"]')
    expect(trigger).not.toBeNull()
    const labelId = trigger!.getAttribute('aria-labelledby')
    expect(document.getElementById(labelId ?? '')?.textContent).toBe('Palette')
    expect(trigger!.getAttribute('role')).toBe('button')
    expect(trigger!.getAttribute('aria-haspopup')).toBe('listbox')
  })
})
