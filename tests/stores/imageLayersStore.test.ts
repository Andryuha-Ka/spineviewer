import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import type { SpineSlot } from '@/core/types/FileSet'

const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, ...extra })

function seed(ids: string[]) {
  useFileLoaderStore().setSlots(ids.map(id => slot(id)), '4.1')
  return useImageLayersStore()
}

const keys = () => useImageLayersStore().rows.map(r => r.id)
const topIds = () => useFileLoaderStore().spineSlots.filter(s => !s.parentSlotId).map(s => s.id)
const addBg = (name = 'bg.png') => {
  const layers = useImageLayersStore()
  const id = layers.addLayer({ name, dataUrl: 'data:bg', scale: 1 })
  layers.setBackground(id)
  return id
}
const layer = (id: string) => useImageLayersStore().layers.find(l => l.id === id)!
const flagged = () => useImageLayersStore().layers.filter(l => l.background).map(l => l.id)

function setViewer(zoom: number, posX: number, posY: number) {
  const v = useViewerStore()
  v.zoom = zoom
  v.posX = posX
  v.posY = posY
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

describe('useImageLayersStore background layer', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addLayer with background is the last row, flagged, synced at the origin with scale 1', () => {
    seed(['a'])
    const bg = addBg()
    expect(keys()).toEqual(['a', bg])
    expect(layer(bg)).toMatchObject({ background: true, syncEnabled: true, posX: 0, posY: 0, scale: 1 })
  })

  it('keeps the background last when a slot or a normal layer is added', () => {
    const layers = seed(['a'])
    const bg = addBg()
    useFileLoaderStore().addSlot(slot('b'))
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    expect(keys()).toEqual([hat, 'a', 'b', bg])
    expect(layer(bg).background).toBe(true)
  })

  it('a second background leaves the first unflagged directly above it', () => {
    seed(['a'])
    const first = addBg('one.png')
    const second = addBg('two.png')
    expect(keys()).toEqual(['a', first, second])
    expect(flagged()).toEqual([second])
  })

  it('a desynced old background is converted to the scene model when replaced', () => {
    const layers = seed(['a'])
    const first = addBg()
    setViewer(2, 10, 5)
    layers.setSync(first, false)
    layers.setTransform(first, 30, 25, 4)
    addBg('two.png')
    expect(layer(first)).toMatchObject({ background: false, syncEnabled: false, posX: 10, posY: 10, scale: 2 })
  })

  it('setBackground on a middle row moves it last and the old background stays in place', () => {
    const layers = seed(['a', 'b'])
    const x = layers.addLayer({ name: 'x.png', dataUrl: 'data:x', scale: 1 })
    layers.placeRow(x, 'b', 'before')
    const oldBg = addBg()
    expect(keys()).toEqual(['a', x, 'b', oldBg])
    layers.setBackground(x)
    expect(keys()).toEqual(['a', 'b', oldBg, x])
    expect(flagged()).toEqual([x])
  })

  it('setBackground(null) keeps the former background last and unflagged', () => {
    const layers = seed(['a'])
    const bg = addBg()
    layers.setBackground(null)
    expect(keys()).toEqual(['a', bg])
    expect(flagged()).toEqual([])
  })

  it('setSync on the background converts between scene and screen without moving it', () => {
    const layers = seed(['a'])
    const bg = addBg()
    layers.setTransform(bg, 3, 4, 1.5)
    setViewer(2, 10, 5)
    layers.setSync(bg, false)
    expect(layer(bg)).toMatchObject({ posX: 10 + 3 * 2, posY: 5 + 4 * 2, scale: 2 * 1.5 })
    layers.setSync(bg, true)
    expect(layer(bg)).toMatchObject({ posX: 3, posY: 4, scale: 1.5 })
  })

  it('setSync on a normal layer never converts', () => {
    const layers = seed(['a'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.setTransform(hat, 3, 4, 1.5)
    setViewer(2, 10, 5)
    layers.setSync(hat, false)
    expect(layer(hat)).toMatchObject({ syncEnabled: false, posX: 3, posY: 4, scale: 1.5 })
  })

  it('checking a desynced normal layer and unchecking a desynced background both convert', () => {
    const layers = seed(['a'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.setTransform(hat, 3, 4, 1.5)
    layers.setSync(hat, false)
    setViewer(2, 10, 5)
    layers.setBackground(hat)
    expect(layer(hat)).toMatchObject({ background: true, posX: 16, posY: 13, scale: 3 })
    layers.setBackground(null)
    expect(layer(hat)).toMatchObject({ background: false, posX: 3, posY: 4, scale: 1.5 })
  })

  it('setAllSync skips the background layer', () => {
    const layers = seed(['a'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    const bg = addBg()
    layers.setAllSync(false)
    expect(layer(hat).syncEnabled).toBe(false)
    expect(layer(bg).syncEnabled).toBe(true)
  })

  it('removing the background leaves no flagged layer', () => {
    const layers = seed(['a'])
    layers.removeLayer(addBg())
    expect(flagged()).toEqual([])
  })
})

describe('useImageLayersStore mutations', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addLayer creates a synced layer at the origin with the given scale, at the top', () => {
    const layers = seed(['a'])
    const id = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 2 })
    expect(layers.layers).toEqual([{ id, name: 'hat.png', dataUrl: 'data:h', posX: 0, posY: 0, scale: 2, syncEnabled: true, background: false }])
    expect(keys()).toEqual([id, 'a'])
  })

  it('setActive on the background layer clears the active placeholder image', () => {
    const layers = seed(['a'])
    const id = addBg()
    const ph = usePlaceholderImagesStore()
    ph.setActiveImage('img-1')
    layers.setActive(id)
    expect(layers.activeLayerId).toBe(id)
    expect(ph.activeImageId).toBeNull()
  })

  it('deactivateItems clears an active background layer', () => {
    const layers = seed(['a'])
    layers.setActive(addBg())
    layers.deactivateItems()
    expect(layers.activeLayerId).toBeNull()
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
    expect(keys()).toEqual([id2, 'a'])
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

  it('a row dropped on the background, either half, lands directly above it', () => {
    const layers = seed(['a', 'b'])
    const bg = addBg()
    layers.placeRow('a', bg, 'after')
    expect(keys()).toEqual(['b', 'a', bg])
    expect(topIds()).toEqual(['b', 'a'])
    layers.placeRow('b', bg, 'before')
    expect(keys()).toEqual(['a', 'b', bg])
  })

  it('ignores moving the background row', () => {
    const layers = seed(['a', 'b'])
    const bg = addBg()
    layers.placeRow(bg, 'a', 'before')
    expect(keys()).toEqual(['a', 'b', bg])
  })

  it('moving a layer leaves the slot order', () => {
    const layers = seed(['a', 'b'])
    const hat = layers.addLayer({ name: 'hat.png', dataUrl: 'data:h', scale: 1 })
    layers.placeRow(hat, 'a', 'before')
    expect(keys()).toEqual([hat, 'a', 'b'])
    expect(topIds()).toEqual(['a', 'b'])
  })

  it('ignores an unknown key or target', () => {
    const layers = seed(['a', 'b'])
    layers.placeRow('zz', 'a', 'before')
    layers.placeRow('a', 'zz', 'before')
    expect(keys()).toEqual(['a', 'b'])
  })
})

describe('useImageLayersStore.placeOnTop', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('puts new slots on top in the given order after a picker load', () => {
    seed(['a', 'b'])
    const loader = useFileLoaderStore()
    loader.addSlot(slot('c'))
    loader.addSlot(slot('d'))
    useImageLayersStore().placeOnTop(['c', 'd'])
    expect(keys()).toEqual(['c', 'd', 'a', 'b'])
    expect(topIds()).toEqual(['c', 'd', 'a', 'b'])
  })

  it('keeps the background last and ignores unknown keys', () => {
    const layers = seed(['a'])
    const bg = addBg()
    useFileLoaderStore().addSlot(slot('b'))
    layers.placeOnTop(['ghost', 'b'])
    expect(keys()).toEqual(['b', 'a', bg])
    expect(layer(bg).background).toBe(true)
  })
})
