import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/core/stores/useSettingsStore'

const KEY = 'svp:theme:palette'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useSettingsStore palette', () => {
  it('defaults to darkroom without writing the key', async () => {
    const store = useSettingsStore()
    await nextTick()
    expect(store.palette).toBe('darkroom')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to darkroom on an unknown stored value', () => {
    localStorage.setItem(KEY, 'neon')
    expect(useSettingsStore().palette).toBe('darkroom')
  })

  it('restores a stored palette and persists a change', async () => {
    localStorage.setItem(KEY, 'slate')
    localStorage.setItem('sv-theme', 'light')
    localStorage.setItem('sv-fontsize', 'lg')
    const store = useSettingsStore()
    expect(store.palette).toBe('slate')

    store.palette = 'rose'
    await nextTick()
    expect(localStorage.getItem(KEY)).toBe('rose')
    expect(localStorage.getItem('sv-theme')).toBe('light')
    expect(localStorage.getItem('sv-fontsize')).toBe('lg')
  })
})
