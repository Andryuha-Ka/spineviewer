/**
 * @file usePanAndDrag.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { ChildAdapterMeta } from './useChildAdapters'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { hitTestOverlay } from '@/core/overlay/overlayMath'
import { resetLoopState } from '@/core/overlay/overlayMath'
import type { IProgressOverlay } from '@/core/types/IProgressOverlay'
import type { TrackLoopState } from '@/core/overlay/overlayMath'

type PanTarget = 'global' | 'background' | 'slot' | 'image' | 'layer'
type Matrix = { a: number; b: number; c: number; d: number; tx: number; ty: number }

/**
 * Manages pan, zoom (5 branches) and overlay hover tracking.
 * Stores and background can be imported directly; complex adapter access is provided via getters.
 */
export function usePanAndDrag(
  containerRef: Ref<HTMLElement | null>,
  getSpineAdapter: () => ISpineAdapter | null,
  getMountedAdapters: () => Map<string, ISpineAdapter>,
  getMountedSpineObjects: () => Map<string, PixiSpriteObject>,
  getChildAdapters: () => Map<string, ISpineAdapter>,
  getChildAdapterMeta: () => Map<string, ChildAdapterMeta>,
  getActiveChildAdapter: () => ISpineAdapter | null,
  getSpineObj: () => unknown,
  getBaseX: () => number,
  getBaseY: () => number,
  getProgressOverlay: () => IProgressOverlay | null,
  getLoopStates: () => Map<number, TrackLoopState>,
  getUiAdapter: () => ISpineAdapter | null,
  getActiveChildParentMatrix: () => Matrix | null,
  applyViewport: () => void,
  seekDragStartFn: () => void,
  dcRaw: (number | null)[],
) {
  const viewerStore            = useViewerStore()
  const backgroundStore        = useBackgroundStore()
  const slotSelectionStore     = useSlotSelectionStore()
  const fileLoaderStore        = useFileLoaderStore()
  const placeholderImagesStore = usePlaceholderImagesStore()
  const animationStore         = useAnimationStore()
  const layersStore            = useImageLayersStore()

  function desyncedActiveLayer() {
    const l = layersStore.layers.find(x => x.id === layersStore.activeLayerId)
    return l && !l.syncEnabled ? l : null
  }

  const isPanning = ref(false)
  let panStart = {
    x: 0, y: 0, px: 0, py: 0,
    imageId: '',
    imageMatrix: null as Matrix | null,
  }
  let panTarget: PanTarget = 'global'
  let _overlayHoverTrackIndex = -1

  function getOverlayHoverTrackIndex() { return _overlayHoverTrackIndex }

  function onWheel(e: WheelEvent) {
    if (!containerRef.value) return
    e.preventDefault()

    const rect = containerRef.value.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const dz = e.deltaMode === 0
      ? Math.exp(-e.deltaY * 0.004)
      : e.deltaY < 0 ? 1.15 : 1 / 1.15

    const baseX = getBaseX()
    const baseY = getBaseY()
    const activeSlot = slotSelectionStore.activeSlot
    const spineAdapter = getSpineAdapter()

    if (e.shiftKey) {
      const newZoom = Math.min(20, Math.max(0.05, viewerStore.zoom * dz))
      if (newZoom === viewerStore.zoom) return
      const spineX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
      const spineY = (my - baseY - viewerStore.posY) / viewerStore.zoom
      viewerStore.posX = mx - baseX - spineX * newZoom
      viewerStore.posY = my - baseY - spineY * newZoom
      viewerStore.zoom = newZoom
    } else if (backgroundStore.isActive && !backgroundStore.syncEnabled) {
      const newZoom = Math.min(20, Math.max(0.05, backgroundStore.zoom * dz))
      if (newZoom === backgroundStore.zoom) return
      const spineX = (mx - baseX - backgroundStore.posX) / backgroundStore.zoom
      const spineY = (my - baseY - backgroundStore.posY) / backgroundStore.zoom
      backgroundStore.setTransform(
        mx - baseX - spineX * newZoom,
        my - baseY - spineY * newZoom,
        newZoom,
      )
    } else if ((() => {
      const aid = placeholderImagesStore.activeImageId
      if (!aid) return false
      const ctx = placeholderImagesStore.getChildContext(aid)
      const _wheelActiveSlot = slotSelectionStore.activeSlot
      const _wheelEffectiveSlotId = _wheelActiveSlot?.parentSlotId ?? slotSelectionStore.activeSlotId
      return !!(ctx && !ctx.entry.syncEnabled && ctx.slotId === _wheelEffectiveSlotId)
    })()) {
      const aid = placeholderImagesStore.activeImageId!
      const ctx = placeholderImagesStore.getChildContext(aid)!
      const curScale = ctx.entry.scale
      const curPosX  = ctx.entry.posX
      const curPosY  = ctx.entry.posY
      const newScale = Math.min(20, Math.max(0.05, curScale * dz))
      if (newScale === curScale) return
      const m = spineAdapter?.getImageContainerWorldTransform(aid)
      if (!m) {
        placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, aid, curPosX, curPosY, newScale)
        spineAdapter?.setImageTransform(aid, curPosX, curPosY, newScale)
        return
      }
      const det = m.a * m.d - m.b * m.c
      if (Math.abs(det) < 1e-10) return
      const cursorLocalX = (m.d * (mx - m.tx) - m.c * (my - m.ty)) / det
      const cursorLocalY = (-m.b * (mx - m.tx) + m.a * (my - m.ty)) / det
      const spriteLocalX = curScale !== 0 ? (cursorLocalX - curPosX) / curScale : 0
      const spriteLocalY = curScale !== 0 ? (cursorLocalY - curPosY) / curScale : 0
      const newPosX = cursorLocalX - spriteLocalX * newScale
      const newPosY = cursorLocalY - spriteLocalY * newScale
      placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, aid, newPosX, newPosY, newScale)
      spineAdapter?.setImageTransform(aid, newPosX, newPosY, newScale)
    } else if (desyncedActiveLayer()) {
      const layer = desyncedActiveLayer()!
      const newScale = Math.min(20, Math.max(0.05, layer.scale * dz))
      if (newScale === layer.scale) return
      const pX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
      const pY = (my - baseY - viewerStore.posY) / viewerStore.zoom
      const qX = (pX - layer.posX) / layer.scale
      const qY = (pY - layer.posY) / layer.scale
      layersStore.setTransform(layer.id, pX - qX * newScale, pY - qY * newScale, newScale)
    } else if (activeSlot?.parentSlotId && activeSlot.syncEnabled === false) {
      const curZoom = activeSlot.indZoom ?? 1
      const curPosX = activeSlot.indPosX ?? 0
      const curPosY = activeSlot.indPosY ?? 0
      const newZoom = Math.min(20, Math.max(0.05, curZoom * dz))
      if (newZoom === curZoom) return
      const m = getActiveChildParentMatrix()
      if (m) {
        const det = m.a * m.d - m.b * m.c
        if (Math.abs(det) < 1e-10) return
        const localX = (m.d * (mx - m.tx) - m.c * (my - m.ty)) / det
        const localY = (-m.b * (mx - m.tx) + m.a * (my - m.ty)) / det
        const spineLocalX = curZoom !== 0 ? (localX - curPosX) / curZoom : 0
        const spineLocalY = curZoom !== 0 ? (localY - curPosY) / curZoom : 0
        activeSlot.indPosX = localX - spineLocalX * newZoom
        activeSlot.indPosY = localY - spineLocalY * newZoom
      } else {
        const pX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
        const pY = (my - baseY - viewerStore.posY) / viewerStore.zoom
        const qX = curZoom !== 0 ? (pX - curPosX) / curZoom : 0
        const qY = curZoom !== 0 ? (pY - curPosY) / curZoom : 0
        activeSlot.indPosX = pX - qX * newZoom
        activeSlot.indPosY = pY - qY * newZoom
      }
      activeSlot.indZoom = newZoom
    } else if (activeSlot && activeSlot.syncEnabled === false) {
      const curZoom = activeSlot.indZoom ?? 1
      const curPosX = activeSlot.indPosX ?? 0
      const curPosY = activeSlot.indPosY ?? 0
      const newZoom = Math.min(20, Math.max(0.05, curZoom * dz))
      if (newZoom === curZoom) return
      const pX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
      const pY = (my - baseY - viewerStore.posY) / viewerStore.zoom
      const qX = (pX - curPosX) / curZoom
      const qY = (pY - curPosY) / curZoom
      activeSlot.indPosX = pX - qX * newZoom
      activeSlot.indPosY = pY - qY * newZoom
      activeSlot.indZoom = newZoom
    } else {
      const newZoom = Math.min(20, Math.max(0.05, viewerStore.zoom * dz))
      if (newZoom === viewerStore.zoom) return
      const spineX = (mx - baseX - viewerStore.posX) / viewerStore.zoom
      const spineY = (my - baseY - viewerStore.posY) / viewerStore.zoom
      viewerStore.posX = mx - baseX - spineX * newZoom
      viewerStore.posY = my - baseY - spineY * newZoom
      viewerStore.zoom = newZoom
    }
    applyViewport()
  }

  function onPanStart(e: MouseEvent) {
    if (e.button !== 0) return

    const progressOverlay = getProgressOverlay()
    if (progressOverlay && animationStore.tracks.length > 0 && containerRef.value) {
      const rect = containerRef.value.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const seekResult = progressOverlay.handleSeekClick(localX, localY)
      if (seekResult) {
        const track = animationStore.tracks.find(t => t.trackIndex === seekResult.trackIndex)
        if (track) {
          getUiAdapter()?.seekTo(seekResult.trackIndex, seekResult.pct * track.duration)
          const ls = getLoopStates().get(seekResult.trackIndex)
          if (ls) resetLoopState(ls, seekResult.pct)
        }
        seekDragStartFn()
        return
      }
    }

    isPanning.value = true

    const _hitRect = containerRef.value ? containerRef.value.getBoundingClientRect() : null
    const _hitCx   = _hitRect ? e.clientX - _hitRect.left : 0
    const _hitCy   = _hitRect ? e.clientY - _hitRect.top  : 0

    let _imageHitOnActiveSlot = false
    const spineAdapter = getSpineAdapter()
    const mountedAdapters = getMountedAdapters()
    const childAdapters = getChildAdapters()
    const childAdapterMeta = getChildAdapterMeta()
    const activeChildAdapter = getActiveChildAdapter()
    const spineObj = getSpineObj()
    // When a child spine is active, images belong to the parent slot — compare against parent.
    const _activeSlotForImages = slotSelectionStore.activeSlot
    const _effectiveActiveSlotId = _activeSlotForImages?.parentSlotId ?? slotSelectionStore.activeSlotId

    if (!e.shiftKey && _hitRect) {
      // Priority 1 — desynced image on the ACTIVE slot (or its parent when a child spine is active)
      if (spineAdapter) {
        const hitId = spineAdapter.getImageAtCanvasPoint(_hitCx, _hitCy)
        if (hitId) {
          const hitCtx = placeholderImagesStore.getChildContext(hitId)
          if (hitCtx && !hitCtx.entry.syncEnabled && hitCtx.slotId === _effectiveActiveSlotId) {
            placeholderImagesStore.setActiveImage(hitId)
            _imageHitOnActiveSlot = true
          }
        }
      }

      // Deactivate image when this click didn't land on the active-slot image.
      // Priority 2 may immediately override this with a different slot's image.
      if (!_imageHitOnActiveSlot) placeholderImagesStore.setActiveImage(null)

      // Priority 2 — desynced image on a NON-ACTIVE mounted slot
      for (const [slotId, adapter] of mountedAdapters) {
        if (slotId === slotSelectionStore.activeSlotId) continue
        const slotData = fileLoaderStore.spineSlots.find(s => s.id === slotId)
        const hasTracks = slotData?.savedState?.selectedAnimation ||
          Object.values(slotData?.savedState?.trackPlaylists ?? {}).some(pl => pl.length > 0)
        if (!hasTracks) continue
        const hitId = adapter.getImageAtCanvasPoint(_hitCx, _hitCy)
        if (!hitId) continue
        const hitCtx = placeholderImagesStore.getChildContext(hitId)
        if (!hitCtx || hitCtx.entry.syncEnabled) continue
        const matrix = adapter.getImageContainerWorldTransform(hitId)
        slotSelectionStore.setActiveSlot(slotId)
        placeholderImagesStore.setActiveImage(hitId)
        panTarget = 'image'
        panStart = { x: e.clientX, y: e.clientY, px: hitCtx.entry.posX, py: hitCtx.entry.posY, imageId: hitId, imageMatrix: matrix }
        return
      }

      // Priority 2b — click on a child spine in a placeholder.
      // Selection: topmost visual child wins (highest zIndex).
      // Child zIndex = its index in the placeholder's mixed image/spine list (sortableChildren render order).
      // Tiebreaker for equal zIndex: active child is preferred.
      if (!_imageHitOnActiveSlot) {
        const _activeChildSlotId = slotSelectionStore.activeSlot?.parentSlotId
          ? slotSelectionStore.activeSlotId
          : null
        let _p2bMeta: ChildAdapterMeta | null = null
        let _p2bTopZ = -Infinity
        for (const [entryId, meta] of childAdapterMeta) {
          const childAdapter = childAdapters.get(entryId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const childObj = childAdapter?.getSpineObject() as any
          if (!childObj) continue
          const b = childObj.getBounds?.()
          if (b && b.width > 0 && b.height > 0 && _hitCx >= b.x && _hitCx <= b.x + b.width && _hitCy >= b.y && _hitCy <= b.y + b.height) {
            const _childZIdx: number = childObj.zIndex ?? 0
            // Strictly-greater replaces; equal zIndex defers to active child (tiebreaker).
            if (_childZIdx > _p2bTopZ ||
                (_childZIdx === _p2bTopZ && _activeChildSlotId && meta.childSlotId === _activeChildSlotId)) {
              _p2bTopZ = _childZIdx
              _p2bMeta = meta
            }
          }
        }
        if (_p2bMeta) {
          const meta = _p2bMeta
          const childSlot = fileLoaderStore.spineSlots.find(s => s.id === meta.childSlotId)
          slotSelectionStore.setActiveSlot(meta.childSlotId)
          layersStore.deactivateItems()
          if (childSlot && childSlot.syncEnabled === false) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wt = (meta.phContainer as any)?.worldTransform
            const matrix = wt ? { a: wt.a, b: wt.b, c: wt.c, d: wt.d, tx: wt.tx, ty: wt.ty } : null
            panTarget = 'slot'
            panStart = { x: e.clientX, y: e.clientY, px: childSlot.indPosX ?? 0, py: childSlot.indPosY ?? 0, imageId: '', imageMatrix: matrix }
          } else {
            const parentSlot = fileLoaderStore.spineSlots.find(s => s.id === meta.parentSlotId)
            if (parentSlot?.syncEnabled === false) {
              slotSelectionStore.setActiveSlot(meta.parentSlotId)
              panTarget = 'slot'
              panStart = { x: e.clientX, y: e.clientY, px: parentSlot.indPosX ?? 0, py: parentSlot.indPosY ?? 0, imageId: '', imageMatrix: null }
            } else {
              panTarget = 'global'
              panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
            }
          }
          return
        }
      }

      // Priority 2c — parent spine bounds when its child slot is active
      if (activeChildAdapter && spineObj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pb = (spineObj as any)?.getBounds?.()
        if (pb && pb.width > 0 && pb.height > 0 && _hitCx >= pb.x && _hitCx <= pb.x + pb.width && _hitCy >= pb.y && _hitCy <= pb.y + pb.height) {
          const parentSlotId = slotSelectionStore.activeSlot?.parentSlotId
          if (parentSlotId) {
            slotSelectionStore.setActiveSlot(parentSlotId)
            layersStore.deactivateItems()
            const parentSlot = fileLoaderStore.spineSlots.find(s => s.id === parentSlotId)
            if (parentSlot?.syncEnabled === false) {
              panTarget = 'slot'
              panStart = { x: e.clientX, y: e.clientY, px: parentSlot.indPosX ?? 0, py: parentSlot.indPosY ?? 0, imageId: '', imageMatrix: null }
            } else {
              panTarget = 'global'
              panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
            }
            return
          }
        }
      }

      // Priority 3 — spine bounds of a NON-ACTIVE slot
      const mountedSpineObjects = getMountedSpineObjects()
      if (mountedSpineObjects.size > 1) {
        // Guard: if the active desynced slot is visually on top of (or at same level as) the
        // non-active slot at the click point, the active slot claims the drag.
        // Comparison is by zIndex (set by syncZOrder): higher zIndex = rendered on top.
        const _activeSlotP3 = slotSelectionStore.activeSlot
        const _activeObjP3 = getSpineObj()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _activeBP3 = (_activeObjP3 as any)?.getBounds?.()
        const _activeZIndexP3 = (_activeObjP3 as PixiSpriteObject | null)?.zIndex ?? 0
        const _activeDesyncedP3 = _activeSlotP3?.syncEnabled === false
        const _activeBContainsClick = _activeDesyncedP3 &&
          _activeBP3 && _activeBP3.width > 0 && _activeBP3.height > 0 &&
          _hitCx >= _activeBP3.x && _hitCx <= _activeBP3.x + _activeBP3.width &&
          _hitCy >= _activeBP3.y && _hitCy <= _activeBP3.y + _activeBP3.height
        for (const [slotId, obj] of mountedSpineObjects) {
          if (slotId === slotSelectionStore.activeSlotId) continue
          const slotData = fileLoaderStore.spineSlots.find(s => s.id === slotId)
          const hasTracks = slotData?.savedState?.selectedAnimation ||
            Object.values(slotData?.savedState?.trackPlaylists ?? {}).some(pl => pl.length > 0)
          if (!hasTracks) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = (obj as any)?.getBounds?.()
          if (b && b.width > 0 && b.height > 0 && _hitCx >= b.x && _hitCx <= b.x + b.width && _hitCy >= b.y && _hitCy <= b.y + b.height) {
            // Active desynced slot is on top (zIndex >= this slot) — it claims the click, skip.
            if (_activeBContainsClick && _activeZIndexP3 >= obj.zIndex) continue
            placeholderImagesStore.setActiveImage(null)
            slotSelectionStore.setActiveSlot(slotId)
            const hitSlot = slotSelectionStore.activeSlot
            if (hitSlot && hitSlot.syncEnabled === false) {
              panTarget = 'slot'
              panStart = { x: e.clientX, y: e.clientY, px: hitSlot.indPosX ?? 0, py: hitSlot.indPosY ?? 0, imageId: '', imageMatrix: null }
            } else {
              panTarget = 'global'
              panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
            }
            return
          }
        }
      }
    }

    // Default pan target
    const activeSlot = slotSelectionStore.activeSlot
    if (e.shiftKey) {
      panTarget = 'global'
      panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
    } else if (backgroundStore.isActive && !backgroundStore.syncEnabled) {
      panTarget = 'background'
      panStart = { x: e.clientX, y: e.clientY, px: backgroundStore.posX, py: backgroundStore.posY, imageId: '', imageMatrix: null }
    } else if (!_imageHitOnActiveSlot && desyncedActiveLayer()) {
      const layer = desyncedActiveLayer()!
      panTarget = 'layer'
      panStart = { x: e.clientX, y: e.clientY, px: layer.posX, py: layer.posY, imageId: layer.id, imageMatrix: null }
    } else {
      const aid = placeholderImagesStore.activeImageId
      const imgCtx = aid ? placeholderImagesStore.getChildContext(aid) : null
      if (_imageHitOnActiveSlot && imgCtx && !imgCtx.entry.syncEnabled && imgCtx.slotId === _effectiveActiveSlotId) {
        panTarget = 'image'
        panStart = {
          x: e.clientX, y: e.clientY,
          px: imgCtx.entry.posX, py: imgCtx.entry.posY,
          imageId: aid!,
          imageMatrix: spineAdapter?.getImageContainerWorldTransform(aid!) ?? null,
        }
      } else if (activeSlot && activeSlot.syncEnabled === false) {
        panTarget = 'slot'
        const matrix = activeSlot.parentSlotId ? getActiveChildParentMatrix() : null
        panStart = { x: e.clientX, y: e.clientY, px: activeSlot.indPosX ?? 0, py: activeSlot.indPosY ?? 0, imageId: '', imageMatrix: matrix }
      } else {
        panTarget = 'global'
        panStart = { x: e.clientX, y: e.clientY, px: viewerStore.posX, py: viewerStore.posY, imageId: '', imageMatrix: null }
      }
    }
  }

  function onPanMove(e: MouseEvent) {
    const progressOverlay = getProgressOverlay()
    if (progressOverlay && animationStore.tracks.length > 0 && containerRef.value) {
      const rect = containerRef.value.getBoundingClientRect()
      const hasDC = dcRaw.some(v => v !== null)
      const hit = hitTestOverlay(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        animationStore.tracks.length,
        hasDC,
      )
      _overlayHoverTrackIndex = hit.inOverlay ? hit.trackRowIndex : -1
    } else {
      _overlayHoverTrackIndex = -1
    }

    if (!isPanning.value) return

    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y

    if (panTarget === 'background') {
      backgroundStore.setTransform(panStart.px + dx, panStart.py + dy, backgroundStore.zoom)
    } else if (panTarget === 'layer') {
      const layer = layersStore.layers.find(l => l.id === panStart.imageId)
      if (!layer) return
      const gz = viewerStore.zoom > 0 ? viewerStore.zoom : 1
      layersStore.setTransform(layer.id, panStart.px + dx / gz, panStart.py + dy / gz, layer.scale)
    } else if (panTarget === 'image') {
      const m = panStart.imageMatrix
      if (!m) return
      const det = m.a * m.d - m.b * m.c
      if (Math.abs(det) < 1e-10) return
      const localDX = (m.d * dx - m.c * dy) / det
      const localDY = (-m.b * dx + m.a * dy) / det
      const newPosX = panStart.px + localDX
      const newPosY = panStart.py + localDY
      const ctx = placeholderImagesStore.getChildContext(panStart.imageId)
      if (!ctx) return
      placeholderImagesStore.updateImageTransform(ctx.slotId, ctx.phName, panStart.imageId, newPosX, newPosY, ctx.entry.scale)
      getSpineAdapter()?.setImageTransform(panStart.imageId, newPosX, newPosY, ctx.entry.scale)
    } else if (panTarget === 'slot') {
      const slot = slotSelectionStore.activeSlot
      if (slot) {
        if (slot.parentSlotId && panStart.imageMatrix) {
          const m = panStart.imageMatrix
          const det = m.a * m.d - m.b * m.c
          if (Math.abs(det) < 1e-10) return
          const localDX = (m.d * dx - m.c * dy) / det
          const localDY = (-m.b * dx + m.a * dy) / det
          slot.indPosX = panStart.px + localDX
          slot.indPosY = panStart.py + localDY
        } else {
          const gz = viewerStore.zoom > 0 ? viewerStore.zoom : 1
          slot.indPosX = panStart.px + dx / gz
          slot.indPosY = panStart.py + dy / gz
        }
      }
    } else {
      viewerStore.posX = panStart.px + dx
      viewerStore.posY = panStart.py + dy
    }
    applyViewport()
  }

  function onPanEnd() {
    isPanning.value = false
  }

  return {
    isPanning,
    onPanStart,
    onPanMove,
    onPanEnd,
    onWheel,
    getOverlayHoverTrackIndex,
  }
}
