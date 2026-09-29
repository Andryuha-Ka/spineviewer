/**
 * @file useImageLayersStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { useFileLoaderStore } from './useFileLoaderStore'
import { useViewerStore } from './useViewerStore'
import { usePlaceholderImagesStore } from './usePlaceholderImagesStore'

export interface ImageLayer {
  id: string
  name: string
  dataUrl: string
  posX: number
  posY: number
  scale: number
  syncEnabled: boolean
  background: boolean
}

export interface LayerRow {
  kind: 'slot' | 'layer'
  id: string
}

export const useImageLayersStore = defineStore('image-layers', () => {
  const layers = ref<ImageLayer[]>([])
  const rowOrder = ref<string[]>([])
  const activeLayerId = ref<string | null>(null)

  const fileLoaderStore = useFileLoaderStore()
  const viewerStore = useViewerStore()
  const placeholderImagesStore = usePlaceholderImagesStore()

  // ── Query ─────────────────────────────────────────────────────────────────────
  const rows = computed<LayerRow[]>(() => {
    const slotIds = fileLoaderStore.spineSlots.filter(s => !s.parentSlotId).map(s => s.id)
    const slotSet = new Set(slotIds)
    const layerSet = new Set(layers.value.map(l => l.id))
    const result: LayerRow[] = []
    for (const id of rowOrder.value) {
      if (slotSet.has(id)) result.push({ kind: 'slot', id })
      else if (layerSet.has(id)) result.push({ kind: 'layer', id })
    }
    const placed = new Set(result.map(r => r.id))
    for (const id of slotIds) if (!placed.has(id)) result.push({ kind: 'slot', id })
    const bg = result.findIndex(r => r.kind === 'layer' && findLayer(r.id)?.background)
    if (bg >= 0) result.push(...result.splice(bg, 1))
    return result
  })

  function findLayer(id: string): ImageLayer | undefined {
    return layers.value.find(l => l.id === id)
  }

  // ── Mutation ──────────────────────────────────────────────────────────────────
  const isScreen = (l: ImageLayer) => l.background && !l.syncEnabled

  function setFlags(l: ImageLayer, background: boolean, sync: boolean): void {
    const was = isScreen(l)
    l.background = background
    l.syncEnabled = sync
    const now = isScreen(l)
    if (was === now) return
    const { posX, posY, zoom } = viewerStore
    if (now) {
      l.posX = posX + l.posX * zoom
      l.posY = posY + l.posY * zoom
      l.scale = zoom * l.scale
    } else {
      const z = zoom > 0 ? zoom : 1
      l.posX = (l.posX - posX) / z
      l.posY = (l.posY - posY) / z
      l.scale = l.scale / z
    }
  }

  function addLayer(src: { name: string; dataUrl: string; scale: number }): string {
    const id = crypto.randomUUID()
    layers.value.push({ id, name: src.name, dataUrl: src.dataUrl, posX: 0, posY: 0, scale: src.scale, syncEnabled: true, background: false })
    placeOnTop([id])
    return id
  }

  function placeOnTop(keys: string[]): void {
    const top = new Set(keys)
    rowOrder.value = [...keys, ...rows.value.map(r => r.id).filter(id => !top.has(id))]
    fileLoaderStore.setTopLevelOrder(rows.value.filter(r => r.kind === 'slot').map(r => r.id))
  }

  function setBackground(id: string | null): void {
    rowOrder.value = rows.value.map(r => r.id)
    for (const l of layers.value) setFlags(l, l.id === id, l.syncEnabled)
  }

  function removeLayer(id: string): void {
    layers.value = layers.value.filter(l => l.id !== id)
    if (activeLayerId.value === id) activeLayerId.value = null
  }

  function setTransform(id: string, x: number, y: number, s: number): void {
    const layer = findLayer(id)
    if (!layer) return
    layer.posX = x
    layer.posY = y
    layer.scale = s
  }

  function setSync(id: string, v: boolean): void {
    const layer = findLayer(id)
    if (layer) setFlags(layer, layer.background, v)
  }

  function setAllSync(v: boolean): void {
    for (const l of layers.value) if (!l.background) l.syncEnabled = v
  }

  function setActive(id: string | null): void {
    activeLayerId.value = id
    if (id === null) return
    placeholderImagesStore.setActiveImage(null)
  }

  function deactivateItems(): void {
    activeLayerId.value = null
  }

  function placeRow(key: string, targetKey: string, where: 'before' | 'after'): void {
    if (key === targetKey || findLayer(key)?.background) return
    const before = rows.value
    const moved = before.find(r => r.id === key)
    if (!moved) return
    const next = before.filter(r => r.id !== key)
    const t = next.findIndex(r => r.id === targetKey)
    if (t < 0) return
    next.splice(where === 'before' ? t : t + 1, 0, moved)
    rowOrder.value = next.map(r => r.id)
    fileLoaderStore.setTopLevelOrder(next.filter(r => r.kind === 'slot').map(r => r.id))
  }

  function clear(): void {
    layers.value = []
    rowOrder.value = []
    activeLayerId.value = null
  }

  return {
    layers,
    rowOrder,
    activeLayerId,
    // Query
    rows,
    // Mutation
    addLayer,
    setBackground,
    removeLayer,
    setTransform,
    setSync,
    setAllSync,
    setActive,
    deactivateItems,
    placeRow,
    placeOnTop,
    clear,
  }
})
