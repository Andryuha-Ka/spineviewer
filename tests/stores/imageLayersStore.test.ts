import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import type { SpineSlot } from '@/core/types/FileSet'

const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, ...extra })

function seed(ids: string[]) {
  useFileLoaderStore().setSlots(ids.map(id => slot(id)), '4.1')
  return useImageLayersStore()
}

const keys = () => useImageLayersStore().rows.map(r => r.id)
const stack = () => useImageLayersStore().stackRows.map(r => (r.kind === 'bg' ? 'BG' : r.id))
const topIds = () => useFileLoaderStore().spineSlots.filter(s => !s.parentSlotId).map(s => s.id)

function loadBg(listIndex: number) {
  const bg = useBackgroundStore()
  bg.set({ dataUrl: 'data:bg', width: 1, height: 1 })
  bg.setListIndex(listIndex)
  return bg
}

describe('useImageLayersStore.rows', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is the top-level slots when there are no layers', () => {
    const loader = useFileLoaderStore()
    loader.setSlots([slot('a'), slot('a1', { parentSlotId: 'a' }), slot('b')], '4.1')
    expect(useImageLayersStore().rows).toEqual([{ kind: 'slot', id: 'a' }, { kind: 'slot', id: 'b' }])
  })

  it('keeps a layer between two skeletons when the skeleton above is removed or becomes a child', () => {
    const layers = seed(['x', 'y', 'z'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.placeRow(hat, 'y', 'before')
    expect(keys()).toEqual(['x', hat, 'y', 'z'])

    useFileLoaderStore().spineSlots.find(s => s.id === 'x')!.parentSlotId = 'z'
    expect(keys()).toEqual([hat, 'y', 'z'])

    useFileLoaderStore().removeSlot('y')
    expect(keys()).toEqual([hat, 'z'])
  })

  it('appends a new slot at the bottom', () => {
    const layers = seed(['a'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.placeRow(hat, 'a', 'before')
    useFileLoaderStore().addSlot(slot('b'))
    expect(keys()).toEqual([hat, 'a', 'b'])
  })
})

describe('useImageLayersStore.stackRows', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('has no background row without a background', () => {
    seed(['a', 'b'])
    expect(stack()).toEqual(['a', 'b'])
  })

  it('puts the background before slot listIndex, below layers in that gap, or at the end', () => {
    const layers = seed(['a', 'b'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.placeRow(hat, 'b', 'before')
    const bg = loadBg(1)
    expect(stack()).toEqual(['a', hat, 'BG', 'b'])
    bg.setListIndex(0)
    expect(stack()).toEqual(['BG', 'a', hat, 'b'])
    bg.setListIndex(5)
    expect(stack()).toEqual(['a', hat, 'b', 'BG'])
  })
})

describe('useImageLayersStore mutations', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addLayer creates a synced layer at the origin with the given scale, at the bottom', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 2 })
    expect(layers.layers).toEqual([{ id, name: 'hat.png', dataUrl: 'data:h', posX: 0, posY: 0, scale: 2, syncEnabled: true }])
    expect(keys()).toEqual(['a', id])
  })

  it('setActive clears the Background and the active placeholder image', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    const bg = useBackgroundStore()
    const ph = usePlaceholderImagesStore()
    bg.setActive(true)
    ph.setActiveImage('img-1')
    layers.setActive(id)
    expect(layers.activeLayerId).toBe(id)
    expect(bg.isActive).toBe(false)
    expect(ph.activeImageId).toBeNull()
  })

  it('deactivateItems clears the Background and the layer', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.setActive(id)
    useBackgroundStore().setActive(true)
    layers.deactivateItems()
    expect(layers.activeLayerId).toBeNull()
    expect(useBackgroundStore().isActive).toBe(false)
  })

  it('setTransform, setSync, setAllSync and removeLayer', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    const id2 = layers.addLayer({ name: 'cap.png', dataUrl: 'data:c', scale: 1 })
    layers.setTransform(id, 10, 20, 3)
    expect(layers.layers[0]).toMatchObject({ posX: 10, posY: 20, scale: 3 })
    layers.setSync(id, false)
    expect(layers.layers[0].syncEnabled).toBe(false)
    layers.setAllSync(false)
    expect(layers.layers.every(l => !l.syncEnabled)).toBe(true)
    layers.setActive(id)
    layers.removeLayer(id)
    expect(layers.layers.map(l => l.id)).toEqual([id2])
    expect(layers.activeLayerId).toBeNull()
    expect(keys()).toEqual(['a', id2])
  })

  it('clear empties layers, rowOrder and activeLayerId', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.setActive(id)
    layers.clear()
    expect(layers.layers).toEqual([])
    expect(layers.rowOrder).toEqual([])
    expect(layers.activeLayerId).toBeNull()
  })
})

describe('useImageLayersStore.placeRow', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moving a skeleton rewrites the spineSlots top-level order', () => {
    const layers = seed(['a', 'b', 'c'])
    layers.placeRow('c', 'a', 'before')
    expect(keys()).toEqual(['c', 'a', 'b'])
    expect(topIds()).toEqual(['c', 'a', 'b'])
    layers.placeRow('c', 'b', 'after')
    expect(topIds()).toEqual(['a', 'b', 'c'])
  })

  it('shifts listIndex when a skeleton crosses the background, both ways', () => {
    const layers = seed(['a', 'b', 'c'])
    const bg = loadBg(1)
    layers.placeRow('c', 'a', 'before')
    expect(stack()).toEqual(['c', 'a', 'BG', 'b'])
    layers.placeRow('c', 'b', 'after')
    expect(stack()).toEqual(['a', 'BG', 'b', 'c'])
    layers.placeRow('a', 'b', 'after')
    expect(stack()).toEqual(['BG', 'b', 'a', 'c'])
    layers.placeRow('c', 'a', 'before')
    expect(bg.listIndex).toBe(0)
  })

  it('moving a layer leaves listIndex and the slot order', () => {
    const layers = seed(['a', 'b'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    const bg = loadBg(1)
    layers.placeRow(hat, 'a', 'before')
    expect(keys()).toEqual([hat, 'a', 'b'])
    expect(bg.listIndex).toBe(1)
    expect(topIds()).toEqual(['a', 'b'])
  })

  it('ignores an unknown key or target', () => {
    const layers = seed(['a', 'b'])
    layers.placeRow('zz', 'a', 'before')
    layers.placeRow('a', 'zz', 'before')
    expect(keys()).toEqual(['a', 'b'])
  })
})

describe('useImageLayersStore.detachTopLevel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('decrements listIndex for a skeleton above the background, leaves it for one below', () => {
    const layers = seed(['a', 'b', 'c'])
    const bg = loadBg(2)
    layers.detachTopLevel('c')
    expect(bg.listIndex).toBe(2)
    layers.detachTopLevel('a')
    expect(bg.listIndex).toBe(1)
  })
})
