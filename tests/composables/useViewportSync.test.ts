import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useViewportSync } from '@/core/composables/stage/useViewportSync'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'

function obj(): PixiSpriteObject & { s: number } {
  const o = { x: 0, y: 0, zIndex: 0, s: 1, scale: { set: (v: number) => { o.s = v } } }
  return o
}

describe('useViewportSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useFileLoaderStore().setSlots([{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], '4.1')
  })

  it('syncZOrder gives rows [layer, A, B, bgLayer] descending zIndex with the background lowest', () => {
    const layers = useImageLayersStore()
    const id = layers.addLayer({ name: 'l.png', dataUrl: 'data:l', scale: 1 })
    layers.placeRow(id, 'A', 'before')
    const bgId = layers.addLayer({ name: 'bg.png', dataUrl: 'data:bg', scale: 1, background: true })
    const a = obj(), b = obj(), bgS = obj(), l = obj()
    const vp = useViewportSync(new Map([['A', a], ['B', b]]), () => new Map([[id, l], [bgId, bgS]]), () => null)
    vp.syncZOrder()
    expect([l.zIndex, a.zIndex, b.zIndex, bgS.zIndex]).toEqual([4, 3, 2, 1])
  })

  it('positions a desynced background in screen pixels and a synced one with the skeleton formula', () => {
    const viewer = useViewerStore()
    viewer.zoom = 2
    viewer.posX = 10
    const layers = useImageLayersStore()
    const id = layers.addLayer({ name: 'bg.png', dataUrl: 'data:bg', scale: 1, background: true })
    layers.setSync(id, false)
    layers.setTransform(id, 50, 20, 0.5)
    const l = obj()
    const vp = useViewportSync(new Map(), () => new Map([[id, l]]), () => null)
    vp.baseX.value = 300
    vp.baseY.value = 100
    vp.applyViewport()
    expect([l.x, l.y, l.s]).toEqual([350, 120, 0.5])
    viewer.zoom = 4
    vp.applyViewport()
    expect([l.x, l.y, l.s]).toEqual([350, 120, 0.5])
    layers.setSync(id, true)
    layers.setTransform(id, 5, 0, 0.5)
    vp.applyViewport()
    expect([l.x, l.s]).toEqual([300 + 10 + 20, 2])
  })

  it('positions a desynced layer with the skeleton formula, independent of sync', () => {
    const viewer = useViewerStore()
    viewer.zoom = 2
    viewer.posX = 10
    const layers = useImageLayersStore()
    const id = layers.addLayer({ name: 'l.png', dataUrl: 'data:l', scale: 0.5 })
    layers.setTransform(id, 100, 0, 0.5)
    layers.setSync(id, false)
    const l = obj()
    const vp = useViewportSync(new Map(), () => new Map([[id, l]]), () => null)
    vp.baseX.value = 300
    vp.applyViewport()
    expect(l.x).toBe(300 + 10 + 200)
    expect(l.s).toBe(1)
    layers.setSync(id, true)
    vp.applyViewport()
    expect(l.x).toBe(510)
    expect(l.s).toBe(1)
  })
})
