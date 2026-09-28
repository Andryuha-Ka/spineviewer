import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePanAndDrag } from '@/core/composables/stage/usePanAndDrag'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useViewerStore } from '@/core/stores/useViewerStore'

const BASE = 100

function setup() {
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as unknown as HTMLElement
  return usePanAndDrag(
    ref(el), () => null, () => new Map(), () => new Map(), () => new Map(), () => new Map(), () => null, () => null,
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
