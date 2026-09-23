/**
 * @file useChildAdapters.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { createSpineAdapter } from '@/core/AdapterFactory'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { PHSpineEntry } from '@/core/types/FileSet'
import { buildSlotSavedState, playlistsOf, replaySavedTracks, trackTimesOf } from '@/core/utils/slotState'

export interface ChildAdapterMeta {
  parentSlotId: string
  phName: string
  childSlotId: string
  phContainer: unknown
}

/**
 * Manages child spine adapters that live inside placeholder containers of parent spines.
 * Owns childAdapters/childAdapterMeta Maps and the activeChildAdapter ref.
 */
export function useChildAdapters() {
  const versionStore            = useVersionStore()
  const fileLoaderStore         = useFileLoaderStore()
  const placeholderImagesStore  = usePlaceholderImagesStore()
  const animationStore          = useAnimationStore()
  const skeletonStore           = useSkeletonStore()
  const viewerStore             = useViewerStore()
  const slotSelectionStore      = useSlotSelectionStore()

  const childAdapters    = new Map<string, ISpineAdapter>()
  const childAdapterMeta = new Map<string, ChildAdapterMeta>()
  const activeChildAdapter = shallowRef<ISpineAdapter | null>(null)

  function saveChildState(childSlotId: string): void {
    const childSlot = fileLoaderStore.spineSlots.find(s => s.id === childSlotId)
    if (!childSlot) return
    fileLoaderStore.saveSlotState(childSlotId, buildSlotSavedState({
      playback:             animationStore,
      activeSkins:          skeletonStore.activeSkins,
      showPlaceholders:     viewerStore.showPlaceholders,
      disabledPlaceholders: viewerStore.disabledPlaceholders,
      slot:                 childSlot,
      trackTimes:           trackTimesOf(activeChildAdapter.value?.getTrackStates() ?? []),
      placeholderChildren:  {},
    }))
  }

  /** Keeps a child's live tracks in its savedState so a later remount resumes them. */
  function snapshotChildState(childSlotId: string, adapter: ISpineAdapter): void {
    const childSlot = fileLoaderStore.spineSlots.find(s => s.id === childSlotId)
    if (!childSlot) return
    const states = adapter.getTrackStates()
    const prev = childSlot.savedState
    const trackPlaylists = slotSelectionStore.activeSlotId === childSlotId
      ? Object.fromEntries(Object.entries(animationStore.trackPlaylists).map(([t, l]) => [t, l.map(e => ({ ...e }))]))
      : prev && Object.values(prev.trackPlaylists).some(l => l.length > 0)
        ? prev.trackPlaylists
        : playlistsOf(states)
    const trackTimes = trackTimesOf(states)
    fileLoaderStore.saveSlotState(childSlotId, {
      speed:                prev?.speed ?? 1,
      selectedAnimation:    prev?.selectedAnimation ?? null,
      currentTrack:         prev?.currentTrack ?? 0,
      loop:                 prev?.loop ?? false,
      trackEnabled:         { ...prev?.trackEnabled },
      trackPlaylists,
      // a child that was never activated plays at the default time scale
      wasPlaying:           prev?.wasPlaying ?? true,
      trackTimes,
      selectedSkins:        [...(prev?.selectedSkins ?? [])],
      showPlaceholders:     prev?.showPlaceholders ?? viewerStore.showPlaceholders,
      disabledPlaceholders: [...(prev?.disabledPlaceholders ?? [])],
      syncEnabled:          childSlot.syncEnabled ?? true,
      indPosX:              childSlot.indPosX ?? 0,
      indPosY:              childSlot.indPosY ?? 0,
      indZoom:              childSlot.indZoom ?? 1,
      placeholderChildren:  {},
    })
  }

  function destroyChildAdapter(entryId: string): void {
    const adapter = childAdapters.get(entryId)
    const meta = childAdapterMeta.get(entryId)
    if (adapter && meta) snapshotChildState(meta.childSlotId, adapter)
    adapter?.destroy()
    childAdapters.delete(entryId)
    childAdapterMeta.delete(entryId)
  }

  function destroyChildAdaptersForSlot(slotId: string): void {
    for (const [entryId, meta] of [...childAdapterMeta.entries()]) {
      if (meta.parentSlotId !== slotId) continue
      destroyChildAdapter(entryId)
    }
  }

  function applyChildTransform(entryId: string): void {
    const meta = childAdapterMeta.get(entryId)
    if (!meta) return
    const childSlot = fileLoaderStore.spineSlots.find(s => s.id === meta.childSlotId)
    const childAdapter = childAdapters.get(entryId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineObj = childAdapter?.getSpineObject() as any
    if (!spineObj || !childSlot) return
    spineObj.x = childSlot.indPosX ?? 0
    spineObj.y = childSlot.indPosY ?? 0
    spineObj.scale.set(childSlot.indZoom ?? 1)
  }

  function getActiveChildParentMatrix(): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null {
    const active = slotSelectionStore.activeSlot
    if (!active?.parentSlotId) return null
    for (const [, meta] of childAdapterMeta) {
      if (meta.childSlotId === active.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wt = (meta.phContainer as any)?.worldTransform
        if (!wt) return null
        return { a: wt.a, b: wt.b, c: wt.c, d: wt.d, tx: wt.tx, ty: wt.ty }
      }
    }
    return null
  }

  // In-flight mounts by entry id: the drain and reloadChildAdaptersForSlot can request the same entry concurrently.
  const mountsInFlight = new Map<string, Promise<void>>()

  function mountChildAdapter(
    parentAdapter: ISpineAdapter,
    parentSlotId: string,
    phName: string,
    entry: PHSpineEntry,
  ): Promise<void> {
    const inFlight = mountsInFlight.get(entry.imageId)
    if (inFlight) return inFlight
    const mount = mountChildAdapterNow(parentAdapter, parentSlotId, phName, entry)
      .finally(() => mountsInFlight.delete(entry.imageId))
    mountsInFlight.set(entry.imageId, mount)
    return mount
  }

  async function mountChildAdapterNow(
    parentAdapter: ISpineAdapter,
    parentSlotId: string,
    phName: string,
    entry: PHSpineEntry,
  ): Promise<void> {
    if (childAdapters.has(entry.imageId)) return
    const phContainer = parentAdapter.getPlaceholderContainer(phName)
    if (!phContainer) {
      console.warn('[useChildAdapters] getPlaceholderContainer returned null for', phName)
      return
    }
    const childSlotForLoad = fileLoaderStore.spineSlots.find(s => s.id === entry.childSlotId)
    if (!childSlotForLoad?.fileSet) {
      console.warn('[useChildAdapters] no fileSet for child slot', entry.childSlotId)
      return
    }
    try {
      // Count existing children in this specific placeholder to assign the correct zIndex.
      // zIndex determines both visual stacking (via sortableChildren on the child container)
      // and hit-test priority in Priority 2b of usePanAndDrag.
      const _existingInPh = [...childAdapterMeta.values()].filter(
        m => m.parentSlotId === parentSlotId && m.phName === phName,
      ).length
      const childAdapter = await createSpineAdapter(versionStore.pixiVersion!, versionStore.spineVersion!)
      await childAdapter.load(childSlotForLoad.fileSet)
      childAdapter.mount(phContainer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spineObj = childAdapter.getSpineObject() as any
      if (spineObj) {
        spineObj.x = entry.posX
        spineObj.y = entry.posY
        spineObj.scale.set(entry.scale)
        spineObj.zIndex = _existingInPh
      }
      childAdapters.set(entry.imageId, childAdapter)
      childAdapterMeta.set(entry.imageId, { parentSlotId, phName, childSlotId: entry.childSlotId, phContainer })
      applyChildTransform(entry.imageId)
      const childSlot = fileLoaderStore.spineSlots.find(s => s.id === entry.childSlotId)
      if (childSlot?.savedState) {
        const ss = childSlot.savedState
        replaySavedTracks(childAdapter, ss)
        if (ss.selectedSkins.length > 0) childAdapter.setSkins(ss.selectedSkins)
        childAdapter.setTimeScale(ss.wasPlaying ? ss.speed : 0)
      }
    } catch (e) {
      console.error('[useChildAdapters] mountChildAdapter error:', e)
    }
  }

  async function reloadChildAdaptersForSlot(parentAdapter: ISpineAdapter, slotId: string): Promise<void> {
    const children = placeholderImagesStore.getSlotImages(slotId)
    for (const [phName, entries] of Object.entries(children)) {
      for (const entry of entries) {
        if (entry.kind !== 'spine') continue
        if (childAdapters.has(entry.imageId)) continue
        await mountChildAdapter(parentAdapter, slotId, phName, entry as PHSpineEntry)
      }
    }
  }

  /**
   * Reparents a mounted child spine into another placeholder without reloading it.
   * Destroys the adapter when the destination parent is not on stage — its tracks are
   * snapshotted first and replayed when reloadChildAdaptersForSlot remounts it.
   */
  function moveChildAdapter(
    entryId: string,
    dstParentAdapter: ISpineAdapter | null,
    dstParentSlotId: string,
    dstPhName: string,
  ): void {
    const meta = childAdapterMeta.get(entryId)
    const childAdapter = childAdapters.get(entryId)
    if (!meta || !childAdapter) return
    const dstContainer = dstParentAdapter?.getPlaceholderContainer(dstPhName)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spineObj = childAdapter.getSpineObject() as any
    if (!dstContainer || !spineObj) {
      destroyChildAdapter(entryId)
      return
    }
    const zIndex = [...childAdapterMeta.entries()].filter(
      ([id, m]) => id !== entryId && m.parentSlotId === dstParentSlotId && m.phName === dstPhName,
    ).length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(dstContainer as any).addChild(spineObj)
    spineObj.zIndex = zIndex
    childAdapterMeta.set(entryId, { ...meta, parentSlotId: dstParentSlotId, phName: dstPhName, phContainer: dstContainer })
    applyChildTransform(entryId)
  }

  function destroyAll(): void {
    for (const adapter of childAdapters.values()) adapter.destroy()
    childAdapters.clear()
    childAdapterMeta.clear()
  }

  return {
    childAdapters,
    childAdapterMeta,
    activeChildAdapter,
    saveChildState,
    destroyChildAdaptersForSlot,
    applyChildTransform,
    getActiveChildParentMatrix,
    mountChildAdapter,
    moveChildAdapter,
    reloadChildAdaptersForSlot,
    destroyAll,
  }
}
