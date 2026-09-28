import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePanAndDrag } from '@/core/composables/stage/usePanAndDrag'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { SpineSlot } from '@/core/types/FileSet'

const BASE = 100

function setup(adapter: ISpineAdapter | null = null, objs = new Map<string, PixiSpriteObject>()) {
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as unknown as HTMLElement
  return usePanAndDrag(
    ref(el), () => adapter, () => new Map(), () => objs, () => new Map(), () => new Map(), () => null, () => objs.get('A') ?? null,
    () => BASE, () => BASE, () => null, () => new Map(), () => null, () => null, () => {}, () => {}, [],
  )
}

const wheel = (x: number, y: number, shiftKey = false) =>
  ({ clientX: x, clientY: y, deltaY: -100, deltaMode: 0, shiftKey, preventDefault() {} }) as unknown as WheelEvent
const mouse = (x: number, y: number, shiftKey = false) =>
  ({ clientX: x, clientY: y, button: 0, shiftKey }) as unknown as MouseEvent

describe('usePanAndDrag — image layer target', () => {
  let layerId: string

  beforeEach(() => {
    setActivePinia(createPinia())
    useFileLoaderStore().setSlots([{ id: 'A', name: 'A', syncEnabled: false, indPosX: 5, indPosY: 5, indZoom: 1.5 }], '4.1')
    useSlotSelectionStore().setActiveSlot('A')
    const viewer = useViewerStore()
    viewer.zoom = 2
    viewer.posX = 20
    viewer.posY = 0
    const layers = useImageLayersStore()
    layerId = layers.addLayer({ name: 'l.png', dataUrl: 'data:l', scale: 1 })
    layers.setTransform(layerId, 30, 10, 1)
    layers.setSync(layerId, false)
    layers.setActive(layerId)
  })

  const layer = () => useImageLayersStore().layers.find(l => l.id === layerId)!
  const screenOf = (px: number, py: number) => {
    const l = layer(), z = useViewerStore().zoom
    return [BASE + 20 + (l.posX + px * l.scale) * z, BASE + (l.posY + py * l.scale) * z]
  }

  it('wheel scales only the desynced active layer, keeping the point under the cursor', () => {
    const [mx, my] = [400, 300]
    const z = useViewerStore().zoom
    const px = ((mx - BASE - 20) / z - 30) / 1
    const py = ((my - BASE) / z - 10) / 1
    setup().onWheel(wheel(mx, my))
    expect(layer().scale).toBeGreaterThan(1)
    const [sx, sy] = screenOf(px, py)
    expect(sx).toBeCloseTo(mx)
    expect(sy).toBeCloseTo(my)
    const slot = useSlotSelectionStore().activeSlot!
    expect([slot.indPosX, slot.indPosY, slot.indZoom]).toEqual([5, 5, 1.5])
    expect(useViewerStore().zoom).toBe(2)
  })

  it('drag moves the layer by d / zoom', () => {
    const pd = setup()
    pd.onPanStart(mouse(200, 200))
    pd.onPanMove(mouse(260, 180))
    expect([layer().posX, layer().posY, layer().scale]).toEqual([60, 0, 1])
    expect(useViewerStore().posX).toBe(20)
  })

  it('a synced layer or Shift pans the global scene', () => {
    let pd = setup()
    pd.onPanStart(mouse(200, 200, true))
    pd.onPanMove(mouse(260, 200, true))
    expect(useViewerStore().posX).toBe(80)
    expect(layer().posX).toBe(30)

    useImageLayersStore().setSync(layerId, true)
    useFileLoaderStore().spineSlots[0].syncEnabled = true
    pd = setup()
    pd.onPanStart(mouse(200, 200))
    pd.onPanMove(mouse(210, 200))
    expect(useViewerStore().posX).toBe(90)
    expect(layer().posX).toBe(30)
  })
})

describe('usePanAndDrag — background layer and one active item', () => {
  let bgId: string

  beforeEach(() => {
    setActivePinia(createPinia())
    useFileLoaderStore().setSlots([
      { id: 'A', name: 'A' },
      { id: 'Y', name: 'Y', syncEnabled: false, indPosX: 0, indPosY: 0, indZoom: 1, savedState: { selectedAnimation: 'idle' } } as unknown as SpineSlot,
    ], '4.1')
    useSlotSelectionStore().setActiveSlot('A')
    const viewer = useViewerStore()
    viewer.zoom = 2
    viewer.posX = 20
    viewer.posY = 0
    const layers = useImageLayersStore()
    bgId = layers.addLayer({ name: 'bg.png', dataUrl: 'data:bg', scale: 1, background: true })
    layers.setSync(bgId, false)
    layers.setTransform(bgId, 50, 20, 1)
    layers.setActive(bgId)
  })

  const bg = () => useImageLayersStore().layers.find(l => l.id === bgId)!
  const addImage = () => {
    const ph = usePlaceholderImagesStore()
    ph.addImageData('A', 'p', { fileName: 'i.png', dataURL: 'data:i', scale: 1 })
    const img = ph.getPlaceholderImages('A', 'p')[0]
    img.syncEnabled = false
    return img
  }

  it('wheel scales an active desynced background around the cursor in screen space', () => {
    const [mx, my] = [400, 300]
    const px = mx - BASE - 50, py = my - BASE - 20
    setup().onWheel(wheel(mx, my))
    const l = bg()
    expect(l.scale).toBeGreaterThan(1)
    expect(BASE + l.posX + px * l.scale).toBeCloseTo(mx)
    expect(BASE + l.posY + py * l.scale).toBeCloseTo(my)
    expect(useViewerStore().zoom).toBe(2)
  })

  it('drag moves an active desynced background by +dx in screen pixels', () => {
    const pd = setup()
    pd.onPanStart(mouse(200, 200))
    pd.onPanMove(mouse(260, 180))
    expect([bg().posX, bg().posY, bg().scale]).toEqual([110, 0, 1])
    expect(useViewerStore().posX).toBe(20)
  })

  it('wheel scales the active desynced placeholder image, not the background', () => {
    const img = addImage()
    usePlaceholderImagesStore().setActiveImage(img.imageId)
    setup().onWheel(wheel(400, 300))
    expect(img.scale).toBeGreaterThan(1)
    expect(bg().scale).toBe(1)
  })

  it('a P1 image hit deactivates the background and drags the image', () => {
    const img = addImage()
    const adapter = {
      getImageAtCanvasPoint: () => img.imageId,
      getImageContainerWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
      setImageTransform: () => {},
    } as unknown as ISpineAdapter
    const pd = setup(adapter)
    pd.onPanStart(mouse(200, 200))
    expect(useImageLayersStore().activeLayerId).toBeNull()
    pd.onPanMove(mouse(230, 210))
    expect([img.posX, img.posY]).toEqual([30, 10])
    expect([bg().posX, bg().posY, bg().scale]).toEqual([50, 20, 1])
  })

  it('a canvas press on a pinned skeleton deactivates the layer and targets that skeleton', () => {
    const layers = useImageLayersStore()
    const layerId = layers.addLayer({ name: 'l.png', dataUrl: 'data:l', scale: 1 })
    layers.setSync(layerId, false)
    layers.setActive(layerId)
    const box = (x: number) => ({ x: 0, y: 0, zIndex: 0, scale: { set() {} }, getBounds: () => ({ x, y: 0, width: 100, height: 100 }) })
    const objs = new Map([['A', box(0)], ['Y', box(500)]]) as unknown as Map<string, PixiSpriteObject>
    const pd = setup(null, objs)
    pd.onPanStart(mouse(550, 50))
    expect(useSlotSelectionStore().activeSlotId).toBe('Y')
    expect(layers.activeLayerId).toBeNull()
    pd.onPanMove(mouse(570, 50))
    const y = useSlotSelectionStore().activeSlot!
    expect(y.indPosX).toBe(10)
    pd.onPanEnd()
    pd.onWheel(wheel(550, 50))
    expect(y.indZoom).toBeGreaterThan(1)
    expect(layers.layers.find(l => l.id === layerId)!.scale).toBe(1)
  })
})
