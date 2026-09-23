/**
 * @file useViewportSync.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'

/**
 * Manages viewport position state (baseX/Y) and derived overlays (origin cross,
 * bone cross, slot bounds). Owns applyViewport() and syncZOrder() which write
 * position/zIndex directly onto Pixi display objects.
 *
 * @param mountedSpineObjects - shared Map keyed by slotId; mutated in-place by applyViewport
 * @param getBgSprite         - returns current background sprite (or null)
 * @param getUiAdapter        - returns the active UI adapter (child or main)
 */
export function useViewportSync(
  mountedSpineObjects: Map<string, PixiSpriteObject>,
  getBgSprite: () => PixiSpriteObject | null,
  getUiAdapter: () => ISpineAdapter | null,
) {
  const viewerStore    = useViewerStore()
  const fileLoaderStore = useFileLoaderStore()
  const backgroundStore = useBackgroundStore()
  const skeletonStore  = useSkeletonStore()
  const inspectorStore = useInspectorStore()

  const baseX = ref(0)
  const baseY = ref(0)

  const originScreenX = computed(() => baseX.value + viewerStore.posX)
  const originScreenY = computed(() => baseY.value + viewerStore.posY)

  const selectedBonePos = computed(() => {
    const name = skeletonStore.selectedBone
    if (!name) return null
    const bt = inspectorStore.boneTransforms.find(b => b.name === name)
    if (!bt) return null
    return {
      x: baseX.value + viewerStore.posX + bt.x * viewerStore.zoom,
      y: baseY.value + viewerStore.posY - bt.y * viewerStore.zoom,
    }
  })

  const selectedSlotRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

  function applyViewport(): void {
    const x = baseX.value + viewerStore.posX
    const y = baseY.value + viewerStore.posY
    const z = viewerStore.zoom
    for (const [slotId, obj] of mountedSpineObjects.entries()) {
      const slot = fileLoaderStore.spineSlots.find(s => s.id === slotId)
      if (slot?.parentSlotId) continue
      // Pixi 7 sets transform=null on destroy; Pixi 8 has no .transform but has .destroyed flag.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _t = (obj as any)?.transform
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _isStale = (_t !== undefined && !_t) || (obj as any)?.destroyed === true
      if (_isStale) { mountedSpineObjects.delete(slotId); continue }
      obj.x = x + (slot?.indPosX ?? 0) * z
      obj.y = y + (slot?.indPosY ?? 0) * z
      obj.scale.set(z * (slot?.indZoom ?? 1))
    }
    const bgSprite = getBgSprite()
    if (bgSprite) {
      if (backgroundStore.syncEnabled) {
        bgSprite.x = x + backgroundStore.posX * z
        bgSprite.y = y + backgroundStore.posY * z
        bgSprite.scale.set(z * backgroundStore.zoom)
      } else {
        bgSprite.x = baseX.value + backgroundStore.posX
        bgSprite.y = baseY.value + backgroundStore.posY
        bgSprite.scale.set(backgroundStore.zoom)
      }
    }
  }

  function syncZOrder(): void {
    // child slots live inside placeholders; the list and backgroundStore.listIndex count top-level slots only
    const slots = fileLoaderStore.spineSlots.filter(s => !s.parentSlotId)
    const n = slots.length
    const bgListIdx = Math.max(0, Math.min(n, backgroundStore.listIndex))

    slots.forEach((slot, spineArrIdx) => {
      const obj = mountedSpineObjects.get(slot.id)
      if (!obj) return
      const mergedPos = spineArrIdx < bgListIdx ? spineArrIdx : spineArrIdx + 1
      obj.zIndex = n - mergedPos
    })

    const bgSprite = getBgSprite()
    if (bgSprite) {
      bgSprite.zIndex = n - bgListIdx
    }
  }

  function updateSelectedSlotRect(): void {
    const name = skeletonStore.selectedSlot
    if (!name) { selectedSlotRect.value = null; return }
    const bounds = getUiAdapter()?.getSlotBounds(name)
    if (!bounds) { selectedSlotRect.value = null; return }
    const sx = baseX.value + viewerStore.posX
    const sy = baseY.value + viewerStore.posY
    const z  = viewerStore.zoom
    selectedSlotRect.value = {
      left:   sx + bounds.minX * z,
      top:    sy - bounds.maxY * z,
      width:  Math.max(1, (bounds.maxX - bounds.minX) * z),
      height: Math.max(1, (bounds.maxY - bounds.minY) * z),
    }
  }

  return {
    baseX,
    baseY,
    originScreenX,
    originScreenY,
    selectedBonePos,
    selectedSlotRect,
    applyViewport,
    syncZOrder,
    updateSelectedSlotRect,
  }
}
