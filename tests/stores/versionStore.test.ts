import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVersionStore } from '@/core/stores/useVersionStore'

describe('useVersionStore restore (B22)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  const restore = (stored: object) => {
    localStorage.setItem('svp-version', JSON.stringify(stored))
    const store = useVersionStore()
    return [store.pixiVersion, store.spineVersion]
  }

  it('discards an unknown Pixi version together with the Spine version', () => {
    expect(restore({ pixiVersion: 9, spineVersion: '4.2' })).toEqual([null, null])
    setActivePinia(createPinia())
    expect(restore({ pixiVersion: '8', spineVersion: '4.2' })).toEqual([null, null])
  })

  it('restores a valid pair', () => {
    expect(restore({ pixiVersion: 7, spineVersion: '4.1' })).toEqual([7, '4.1'])
  })

  it('drops a Spine version the Pixi version does not offer', () => {
    expect(restore({ pixiVersion: 8, spineVersion: '4.1' })).toEqual([8, null])
  })
})
