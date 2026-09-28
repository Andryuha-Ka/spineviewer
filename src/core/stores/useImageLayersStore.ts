/**
 * @file useImageLayersStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { useFileLoaderStore } from './useFileLoaderStore'
import { useBackgroundStore } from './useBackgroundStore'
import { usePlaceholderImagesStore } from './usePlaceholderImagesStore'

export interface ImageLayer {
  id: string
  name: string
  dataUrl: string
  posX: number
  posY: number
  scale: number
  syncEnabled: boolean
}

export interface LayerRow {
  kind: 'slot' | 'layer'
  id: string
}

export type StackRow = LayerRow | { kind: 'bg' }

export const useImageLayersStore = defineStore('image-layers', () => {
  const layers = ref<ImageLayer[]>([])
  const rowOrder = ref<string[]>([])
  const activeLayerId = ref<string | null>(null)

  const fileLoaderStore = useFileLoaderStore()
  const backgroundStore = useBackgroundStore()
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
    return result
  })

  const stackRows = computed<StackRow[]>(() => {
    const result: StackRow[] = [...rows.value]
    if (!backgroundStore.isLoaded) return result
    let slotIdx = 0
    const at = result.findIndex(r => r.kind === 'slot' && slotIdx++ === backgroundStore.listIndex)
    result.splice(at < 0 ? result.length : at, 0, { kind: 'bg' })
    return result
  })

  function slotIndex(list: LayerRow[], id: string): number {
    return list.filter(r => r.kind === 'slot').findIndex(r => r.id === id)
  }

  function findLayer(id: string): ImageLayer | undefined {
    return layers.value.find(l => l.id === id)
  }

  // ── Mutation ──────────────────────────────────────────────────────────────────
  function addLayer(src: { name: string; dataUrl: string; scale: number }): string {
    const id = crypto.randomUUID()
    const keys = rows.value.map(r => r.id)
    layers.value.push({ id, name: src.name, dataUrl: src.dataUrl, posX: 0, posY: 0, scale: src.scale, syncEnabled: true })
    rowOrder.value = [...keys, id]
    return id
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
    if (layer) layer.syncEnabled = v
  }

  function setAllSync(v: boolean): void {
    for (const l of layers.value) l.syncEnabled = v
  }

  function setActive(id: string | null): void {
    activeLayerId.value = id
    if (id === null) return
    backgroundStore.setActive(false)
    placeholderImagesStore.setActiveImage(null)
  }

  function deactivateItems(): void {
    backgroundStore.setActive(false)
    activeLayerId.value = null
  }

  function placeRow(key: string, targetKey: string, where: 'before' | 'after'): void {
    if (key === targetKey) return
    const before = rows.value
    const moved = before.find(r => r.id === key)
    if (!moved) return
    const next = before.filter(r => r.id !== key)
    const t = next.findIndex(r => r.id === targetKey)
    if (t < 0) return
    next.splice(where === 'before' ? t : t + 1, 0, moved)
    rowOrder.value = next.map(r => r.id)
    fileLoaderStore.setTopLevelOrder(next.filter(r => r.kind === 'slot').map(r => r.id))
    if (moved.kind !== 'slot' || !backgroundStore.isLoaded) return
    const bg = backgroundStore.listIndex
    const srcTop = slotIndex(before, key)
    const dstTop = slotIndex(next, key)
    if (srcTop < bg && bg <= dstTop) backgroundStore.setListIndex(bg - 1)
    else if (dstTop < bg && bg <= srcTop) backgroundStore.setListIndex(bg + 1)
  }

  function detachTopLevel(slotId: string): void {
    if (!backgroundStore.isLoaded) return
    const srcTop = slotIndex(rows.value, slotId)
    if (srcTop >= 0 && srcTop < backgroundStore.listIndex) backgroundStore.setListIndex(backgroundStore.listIndex - 1)
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
    stackRows,
    // Mutation
    addLayer,
    removeLayer,
    setTransform,
    setSync,
    setAllSync,
    setActive,
    deactivateItems,
    placeRow,
    detachTopLevel,
    clear,
  }
})
