import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useExportStore } from '@/core/stores/useExportStore'

describe('export store settings', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults to 1× and no background', () => {
    const store = useExportStore()
    expect(store.scale).toBe(1)
    expect(store.includeBackground).toBe(false)
    expect(store.notice).toBeNull()
  })

  it('round-trips scale and background through localStorage', async () => {
    const store = useExportStore()
    store.scale = 4
    store.includeBackground = true
    await nextTick()
    expect(localStorage.getItem('svp:export:scale')).toBe('4')
    expect(localStorage.getItem('svp:export:background')).toBe('true')

    setActivePinia(createPinia())
    const reloaded = useExportStore()
    expect(reloaded.scale).toBe(4)
    expect(reloaded.includeBackground).toBe(true)
  })

  it('falls back to defaults for invalid stored values', () => {
    localStorage.setItem('svp:export:scale', '3')
    localStorage.setItem('svp:export:background', 'yes')
    const store = useExportStore()
    expect(store.scale).toBe(1)
    expect(store.includeBackground).toBe(false)
  })

  it('clears the notice when an export starts', () => {
    const store = useExportStore()
    store.notice = 'Scale reduced to 2× (GPU limit)'
    store.start('png')
    expect(store.notice).toBeNull()
  })
})
