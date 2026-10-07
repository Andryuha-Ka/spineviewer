/**
 * @file useSlotSwitch.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { Ref, watch } from 'vue'
import { createSpineAdapter } from '@/core/AdapterFactory'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import { useEventsStore } from '@/core/stores/useEventsStore'
import { useAtlasStore } from '@/core/stores/useAtlasStore'
import { useProfilerStore } from '@/core/stores/useProfilerStore'
import { useComplexityStore } from '@/core/stores/useComplexityStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import type { useChildAdapters } from '@/core/composables/stage/useChildAdapters'
import type { BoneOverrides, ISpineAdapter, TrackMixOptions, TrackState } from '@/core/types/ISpineAdapter'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { FileSet, PHChildEntry } from '@/core/types/FileSet'
import { applySavedBoneOverrides, applySavedTrackMix, buildSlotSavedState, playlistsOf, queueTrackList, replaySavedTracks, trackMixOf, trackTimesOf } from '@/core/utils/slotState'

/** The active top-level slot on stage; while a child spine is active this is its parent. */
export interface ActiveStage {
  adapter: ISpineAdapter | null
  obj: unknown
}

interface SlotSwitchContext {
  onStage: ActiveStage
  mountedAdapters: Map<string, ISpineAdapter>
  mountedSpineObjects: Map<string, PixiSpriteObject>
  children: ReturnType<typeof useChildAdapters>
  getPixiApp: () => IPixiApp | null
  loading: Ref<boolean>
  spineLoaded: Ref<boolean>
  spineError: Ref<string | null>
  phItems: Ref<Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>>
  loadSpine: (fileSet: FileSet, slotId?: string, resetViewport?: boolean) => Promise<void>
  /** loadSpine = createLoadedAdapter + attachLoaded; reloadSlot uses the halves for its double-buffered swap */
  createLoadedAdapter: (fileSet: FileSet) => Promise<ISpineAdapter>
  attachLoaded: (adapter: ISpineAdapter, fileSet: FileSet, slotId?: string, resetViewport?: boolean) => void
  applySkins: () => void
  applyPlaceholderLabels: () => void
  drainPlaceholderActions: () => Promise<void>
  applyViewport: () => void
  syncZOrder: () => void
}

/**
 * Active-slot switching (park / destroy / restore, child spine activation) and the pin watcher.
 * Call in setup; start() registers the watchers once the Pixi app exists.
 */
function hasPlaylists(p: Record<number, unknown[]> | undefined): p is Record<number, unknown[]> {
  return !!p && Object.values(p).some(l => l.length > 0)
}

export function useSlotSwitch(ctx: SlotSwitchContext) {
  const {
    onStage, mountedAdapters, mountedSpineObjects, children, getPixiApp,
    loading, spineLoaded, spineError, phItems,
    loadSpine, createLoadedAdapter, attachLoaded,
    applySkins, applyPlaceholderLabels, drainPlaceholderActions, applyViewport, syncZOrder,
  } = ctx

  const versionStore           = useVersionStore()
  const viewerStore            = useViewerStore()
  const skeletonStore          = useSkeletonStore()
  const animationStore         = useAnimationStore()
  const inspectorStore         = useInspectorStore()
  const eventsStore            = useEventsStore()
  const atlasStore             = useAtlasStore()
  const profilerStore          = useProfilerStore()
  const complexityStore        = useComplexityStore()
  const fileLoaderStore        = useFileLoaderStore()
  const slotSelectionStore     = useSlotSelectionStore()
  const placeholderImagesStore = usePlaceholderImagesStore()

  // Slot-transition guards
  let _pendingChildSlotId: string | null = null
  let _redirectedFromSlotId: string | null = null
  let _suppressAnimPlay = false
  let _pendingSeekTimes: Record<number, number> | null = null
  let _uiReloading = false

  // The live store wins over the saved snapshot: it also holds edits made while the slot was not on stage.
  function restoreSlotImages(adapter: ISpineAdapter | null, slotId: string, saved: Record<string, PHChildEntry[]> | undefined): void {
    const live = placeholderImagesStore.hasSlot(slotId)
    const source = live ? placeholderImagesStore.getSlotImages(slotId) : saved
    if (!source) return
    if (!live) placeholderImagesStore.setSlotImages(slotId, source)
    if (!adapter) return
    for (const [phName, entries] of Object.entries(source)) {
      for (const entry of entries) {
        if (entry.kind !== 'image') continue
        adapter.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
        adapter.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
      }
      children.orderPlaceholderChildren(adapter, slotId, phName)
    }
  }

  function saveLeavingSlot(slotId: string, states: readonly TrackState[]): void {
    fileLoaderStore.saveSlotState(slotId, buildSlotSavedState({
      playback:             animationStore,
      activeSkins:          skeletonStore.activeSkins,
      showPlaceholders:     viewerStore.showPlaceholders,
      disabledPlaceholders: viewerStore.disabledPlaceholders,
      slot:                 fileLoaderStore.spineSlots.find(s => s.id === slotId),
      trackTimes:           trackTimesOf(states),
      placeholderChildren:  placeholderImagesStore.getSlotImages(slotId),
      boneOverrides:        onStage.adapter?.getBoneOverrides(),
    }))
  }

  function saveLeaving(effectiveOldId: string, fromId: string | null | undefined): void {
    if (children.activeChildAdapter.value) {
      if (fromId) children.saveChildState(fromId)
      children.activeChildAdapter.value = null
      const parentSs = fileLoaderStore.spineSlots.find(s => s.id === effectiveOldId)?.savedState
      if (parentSs && onStage.adapter) {
        const states = onStage.adapter.getTrackStates()
        const trackMix = { ...parentSs.trackMix, ...trackMixOf(states) }
        const boneOverrides = onStage.adapter.getBoneOverrides()
        fileLoaderStore.saveSlotState(effectiveOldId, {
          ...parentSs,
          trackTimes: trackTimesOf(states),
          ...(Object.keys(trackMix).length > 0 ? { trackMix } : {}),
          boneOverrides: Object.keys(boneOverrides).length > 0 ? boneOverrides : undefined,
          placeholderChildren: placeholderImagesStore.getSlotImages(effectiveOldId),
        })
      }
    } else {
      saveLeavingSlot(effectiveOldId, onStage.adapter?.getTrackStates() ?? [])
    }
  }

  function unloadLeaving(effectiveOldId: string, newId: string): void {
    if (!onStage.adapter) return
    for (const action of placeholderImagesStore.peekActions()) {
      if (action.type === 'move-child' && action.kind === 'image' && action.slotId === effectiveOldId && action.imageId) {
        onStage.adapter.removeImageFromPlaceholder(action.phName, action.imageId)
      }
    }
    if (slotSelectionStore.isPinned(effectiveOldId) || effectiveOldId === newId) {
      mountedAdapters.set(effectiveOldId, onStage.adapter)
      if (onStage.obj) mountedSpineObjects.set(effectiveOldId, onStage.obj as PixiSpriteObject)
    } else {
      children.destroyChildAdaptersForSlot(effectiveOldId)
      onStage.adapter.destroy()
      mountedAdapters.delete(effectiveOldId)
      mountedSpineObjects.delete(effectiveOldId)
    }
    onStage.adapter = null
    onStage.obj = null
  }

  function isChildMounted(childSlotId: string): boolean {
    for (const meta of children.childAdapterMeta.values()) {
      if (meta.childSlotId === childSlotId) return true
    }
    return false
  }

  function start(watchStage: typeof watch): void {
    // ── Active slot watcher ───────────────────────────────────────────────────
    watchStage(
      () => slotSelectionStore.activeSlotId,
      async (newId, oldId) => {
        if (!newId || newId === oldId || loading.value) return

        const _fromId = _redirectedFromSlotId ?? oldId
        _redirectedFromSlotId = null
        const prevSlot = _fromId ? fileLoaderStore.spineSlots.find(s => s.id === _fromId) : null
        const effectiveOldId = prevSlot?.parentSlotId ?? _fromId

        // Guard 1 — child slot activation
        const newSlot = fileLoaderStore.spineSlots.find(s => s.id === newId)
        if (newSlot?.parentSlotId) {
          placeholderImagesStore.setActiveImage(null)

          let childAdapterRef: ISpineAdapter | null = null
          for (const [entryId, meta] of children.childAdapterMeta) {
            if (meta.childSlotId === newId) { childAdapterRef = children.childAdapters.get(entryId) ?? null; break }
          }
          if (!childAdapterRef) {
            _redirectedFromSlotId = _fromId
            _pendingChildSlotId = newId
            slotSelectionStore.setActiveSlot(newSlot.parentSlotId!)
            return
          }

          const parentId = newSlot.parentSlotId
          if (effectiveOldId && effectiveOldId !== parentId && onStage.adapter) {
            saveLeaving(effectiveOldId, _fromId)
            unloadLeaving(effectiveOldId, newId)
          } else if (!children.activeChildAdapter.value && onStage.adapter && effectiveOldId) {
            saveLeavingSlot(effectiveOldId, onStage.adapter.getTrackStates())
          } else if (children.activeChildAdapter.value && prevSlot?.parentSlotId && _fromId) {
            children.saveChildState(_fromId)
          }
          if (!onStage.adapter && mountedAdapters.has(parentId)) {
            onStage.adapter = mountedAdapters.get(parentId)!
            onStage.obj = mountedSpineObjects.get(parentId) ?? null
          }

          children.activeChildAdapter.value = childAdapterRef

          _suppressAnimPlay = true
          skeletonStore.clear()
          animationStore.reset()
          eventsStore.clear()
          inspectorStore.clear()
          skeletonStore.populateFrom(childAdapterRef)
          childAdapterRef.onEvent(e => eventsStore.push(e))
          if (newSlot.fileSet && typeof newSlot.fileSet.atlas.fileBody === 'string') {
            atlasStore.load(newSlot.fileSet.atlas.fileBody, newSlot.fileSet.images)
          } else {
            atlasStore.clear()
          }
          if (newSlot.fileSet) complexityStore.analyze(childAdapterRef, newSlot.fileSet, atlasStore.pages)

          const childSs = newSlot.savedState
          const liveChildPlaylists = hasPlaylists(childSs?.trackPlaylists)
            ? childSs!.trackPlaylists
            : playlistsOf(childAdapterRef.getTrackStates())
          animationStore.speed             = childSs?.speed ?? 1
          animationStore.selectedAnimation = childSs?.selectedAnimation ?? null
          animationStore.currentTrack      = childSs?.currentTrack ?? 0
          animationStore.loop              = childSs?.loop ?? false
          animationStore.trackEnabled      = childSs?.trackEnabled ? { ...childSs.trackEnabled } : {}
          animationStore.trackMix          = { ...(childSs?.trackMix ?? trackMixOf(childAdapterRef.getTrackStates())) }
          for (const [idxStr, playlist] of Object.entries(liveChildPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
          }
          if (childSs?.selectedSkins?.length) skeletonStore.activeSkins = [...childSs.selectedSkins]
          animationStore.isPaused = false
          animationStore.isPlaying = childSs?.wasPlaying ?? false

          await nextTick()
          _suppressAnimPlay = false
          childAdapterRef.setTimeScale((childSs?.wasPlaying ?? false) ? (childSs?.speed ?? 1) : 0)
          applyPlaceholderLabels()
          await drainPlaceholderActions()
          return
        }

        // Step 1: Save state of leaving slot; Step 2: park or destroy old adapter
        if (effectiveOldId) {
          saveLeaving(effectiveOldId, _fromId)
          unloadLeaving(effectiveOldId, newId)
        }

        // Step 3: Clear stores
        skeletonStore.clear()
        animationStore.reset()
        inspectorStore.clear()
        eventsStore.clear()
        atlasStore.clear()
        profilerStore.clear()
        complexityStore.clear()
        placeholderImagesStore.setActiveImage(null)
        phItems.value = []
        viewerStore.showPlaceholders = localStorage.getItem('svp:viewer:showPlaceholders') !== 'false'
        viewerStore.clearDisabledPlaceholders()
        spineLoaded.value = false

        // Step 4: Get new slot
        const slot = fileLoaderStore.spineSlots.find(s => s.id === newId)
        if (!slot?.fileSet) return

        const restoreState = (s: typeof slot.savedState) => {
          if (!s) return
          animationStore.speed              = s.speed
          animationStore.selectedAnimation  = s.selectedAnimation
          animationStore.currentTrack       = s.currentTrack
          animationStore.loop               = s.loop
          animationStore.trackEnabled       = { ...s.trackEnabled }
          animationStore.trackMix           = { ...s.trackMix }
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
          }
          if (onStage.adapter) {
            applySavedTrackMix(onStage.adapter, s.trackMix)
            applySavedBoneOverrides(onStage.adapter, s)
            skeletonStore.refreshBoneOverrides()
          }
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            const trackIndex = Number(idxStr)
            if (!onStage.adapter || !animationStore.isTrackEnabled(trackIndex)) continue
            queueTrackList(onStage.adapter, trackIndex, playlist)
          }
          if (s.wasPlaying) {
            if (s.trackTimes && Object.keys(s.trackTimes).length > 0) {
              _pendingSeekTimes = { ...s.trackTimes }
            }
            animationStore.isPaused = false
            animationStore.play()
          } else if (s.trackTimes) {
            for (const [idxStr, time] of Object.entries(s.trackTimes)) {
              onStage.adapter?.seekTo(Number(idxStr), time)
            }
          }
          if (s.selectedSkins?.length) {
            skeletonStore.activeSkins = [...s.selectedSkins]
          }
          if (s.showPlaceholders !== undefined) {
            viewerStore.showPlaceholders = s.showPlaceholders
          }
          if (s.disabledPlaceholders?.length) {
            viewerStore.disabledPlaceholders = new Set(s.disabledPlaceholders)
          }
          const target = slot
          if (target) {
            target.syncEnabled = s.syncEnabled ?? true
            target.indPosX     = s.indPosX ?? 0
            target.indPosY     = s.indPosY ?? 0
            target.indZoom     = s.indZoom ?? 1
          }
          applyViewport()
          restoreSlotImages(onStage.adapter, slot.id, s.placeholderChildren)
        }

        // Step 5a: Reuse pinned adapter
        if (mountedAdapters.has(newId)) {
          loading.value = true
          try {
            onStage.adapter = mountedAdapters.get(newId)!
            onStage.obj = mountedSpineObjects.get(newId) ?? null
            spineLoaded.value = true

            skeletonStore.populateFrom(onStage.adapter)
            onStage.adapter.onEvent(e => eventsStore.push(e))
            if (typeof slot.fileSet.atlas.fileBody === 'string') {
              atlasStore.load(slot.fileSet.atlas.fileBody, slot.fileSet.images)
            }
            complexityStore.analyze(onStage.adapter, slot.fileSet, atlasStore.pages)

            const PH_RE_5A = /placeholder/i
            const phSlots5A = new Set(onStage.adapter.slots.filter(s => PH_RE_5A.test(s.name)).map(s => s.name))
            phItems.value = [
              ...[...phSlots5A].map(name => ({ name, kind: 'slot' as const })),
              ...onStage.adapter.bones
                .filter(b => PH_RE_5A.test(b.name) && !phSlots5A.has(b.name))
                .map(b => ({ name: b.name, kind: 'bone' as const })),
            ]
            fileLoaderStore.setSlotPlaceholders(
              slot.id,
              phItems.value
                .filter(p => p.kind !== 'attachment')
                .map(p => ({ name: p.name, kind: p.kind as 'bone' | 'slot' })),
            )
            {
              const ss = slot.savedState
              const livePlaylists = hasPlaylists(ss?.trackPlaylists)
                ? ss!.trackPlaylists
                : playlistsOf(onStage.adapter.getTrackStates())
              animationStore.speed             = ss?.speed ?? 1
              animationStore.selectedAnimation = ss?.selectedAnimation ?? null
              animationStore.currentTrack      = ss?.currentTrack ?? 0
              animationStore.loop              = ss?.loop ?? false
              animationStore.trackEnabled      = ss?.trackEnabled ? { ...ss.trackEnabled } : {}
              animationStore.trackMix          = { ...(ss?.trackMix ?? trackMixOf(onStage.adapter.getTrackStates())) }
              for (const [idxStr, playlist] of Object.entries(livePlaylists)) {
                animationStore.setTrackPlaylist(Number(idxStr), playlist)
              }
              _suppressAnimPlay = true
              animationStore.isPaused = false
              animationStore.isPlaying = ss?.wasPlaying ?? true
              if (ss?.selectedSkins?.length) skeletonStore.activeSkins = [...ss.selectedSkins]
              if (ss?.showPlaceholders !== undefined) viewerStore.showPlaceholders = ss.showPlaceholders
              if (ss?.disabledPlaceholders?.length) viewerStore.disabledPlaceholders = new Set(ss.disabledPlaceholders)
              const pinnedSlot = slot
              if (pinnedSlot) {
                pinnedSlot.syncEnabled = ss?.syncEnabled ?? true
                pinnedSlot.indPosX     = ss?.indPosX ?? 0
                pinnedSlot.indPosY     = ss?.indPosY ?? 0
                pinnedSlot.indZoom     = ss?.indZoom ?? 1
              }
              applyViewport()
              syncZOrder()
              await nextTick()
              _suppressAnimPlay = false
              onStage.adapter?.setTimeScale((ss?.wasPlaying ?? true) ? (ss?.speed ?? 1) : 0)
            }
            applySkins()
            applyPlaceholderLabels()
            restoreSlotImages(onStage.adapter, newId, slot.savedState?.placeholderChildren)
            await drainPlaceholderActions()
            if (onStage.adapter) await children.reloadChildAdaptersForSlot(onStage.adapter, newId)
            if (_pendingChildSlotId) {
              const _pendingId = _pendingChildSlotId
              _pendingChildSlotId = null
              if (isChildMounted(_pendingId)) {
                await nextTick()
                slotSelectionStore.setActiveSlot(_pendingId)
              } else {
                console.warn('[PreviewStage] child spine could not be mounted, staying on parent:', _pendingId)
              }
            }
          } catch (e) {
            spineError.value = e instanceof Error ? e.message : 'Failed to restore spine'
            console.error('[PreviewStage] restore pinned error:', e)
          } finally {
            loading.value = false
          }
        } else {
          // Step 5b: Fresh load
          await loadSpine(slot.fileSet, newId, false)
          restoreState(slot.savedState)
          if (!slot.savedState) restoreSlotImages(onStage.adapter, newId, undefined)
          applySkins()
          applyPlaceholderLabels()
          await drainPlaceholderActions()
          if (onStage.adapter) await children.reloadChildAdaptersForSlot(onStage.adapter, newId)
          if (_pendingChildSlotId) {
            const _pendingId = _pendingChildSlotId
            _pendingChildSlotId = null
            if (isChildMounted(_pendingId)) {
              await nextTick()
              slotSelectionStore.setActiveSlot(_pendingId)
            } else {
              console.warn('[PreviewStage] child spine could not be mounted, staying on parent:', _pendingId)
            }
          }
        }
      },
    )

    // ── Pinned slot watcher ───────────────────────────────────────────────────
    watchStage(
      () => slotSelectionStore.pinnedSlotIds,
      async (newPinned) => {
        const pixiApp = getPixiApp()
        if (!pixiApp) return
        const _activeParentSlotId = slotSelectionStore.activeSlot?.parentSlotId ?? null
        for (const [slotId, adapter] of [...mountedAdapters.entries()]) {
          if (slotId === slotSelectionStore.activeSlotId) continue
          if (slotId === _activeParentSlotId) continue
          // unpin + switch in one tick: the slot watcher still has to save and unload this adapter
          if (adapter === onStage.adapter) continue
          if (!newPinned.has(slotId)) {
            children.destroyChildAdaptersForSlot(slotId)
            adapter.destroy()
            mountedAdapters.delete(slotId)
            mountedSpineObjects.delete(slotId)
          }
        }
        for (const slotId of newPinned) {
          if (slotId === slotSelectionStore.activeSlotId) continue
          if (mountedAdapters.has(slotId)) continue
          const slot = fileLoaderStore.spineSlots.find(s => s.id === slotId)
          if (!slot?.fileSet) continue
          if (slot.parentSlotId) continue
          try {
            const adapter = await createSpineAdapter(
              versionStore.pixiVersion!,
              versionStore.spineVersion!,
              slot.fileSet,
            )
            await adapter.load(slot.fileSet)
            adapter.mount(pixiApp.stage)
            const ss = slot.savedState
            if (ss) {
              replaySavedTracks(adapter, ss)
              adapter.setTimeScale(ss.wasPlaying ? ss.speed : 0)
              if (ss.selectedSkins?.length) adapter.setSkins(ss.selectedSkins)
              restoreSlotImages(adapter, slotId, ss.placeholderChildren)
            }
            const obj = pixiApp.getLastStageChild()
            mountedAdapters.set(slotId, adapter)
            if (obj) mountedSpineObjects.set(slotId, obj as PixiSpriteObject)
            await children.reloadChildAdaptersForSlot(adapter, slotId)
            applyViewport()
            syncZOrder()
          } catch (e) {
            console.error('[PreviewStage] failed to mount pinned spine:', slotId, e)
            slotSelectionStore.setPinned(slotId, false)
          }
        }
      },
    )
  }

  /** Snapshots the slot on stage (and its active child) before the stage goes away, e.g. viewer → compare. */
  function saveActive(): void {
    const activeId = slotSelectionStore.activeSlotId
    if (!activeId || !onStage.adapter) return
    const active = fileLoaderStore.spineSlots.find(s => s.id === activeId)
    saveLeaving(active?.parentSlotId ?? activeId, activeId)
  }

  /** Rebuilds the live track chains on a fresh adapter: current entry, queued entries and times; animations it lacks are skipped. */
  function replayChains(
    to: ISpineAdapter,
    states: readonly TrackState[],
    trackMix: Record<number, TrackMixOptions> | undefined,
    overrides: BoneOverrides,
    isEnabled: (track: number) => boolean,
  ): void {
    applySavedTrackMix(to, trackMix)
    applySavedBoneOverrides(to, { boneOverrides: overrides })
    const known = new Set(to.animations)
    for (const ts of states) {
      if (!known.has(ts.animationName)) continue
      to.setAnimation(ts.trackIndex, ts.animationName, ts.loop)
      for (const q of ts.queue) if (known.has(q.animationName)) to.addAnimation(ts.trackIndex, q.animationName, q.loop)
      to.seekTo(ts.trackIndex, ts.time)
      if (!isEnabled(ts.trackIndex)) to.setTrackTimeScale(ts.trackIndex, 0)
    }
  }

  type SliderPoses = Array<{ name: string; time: number; mix: number }>

  /** 4.3 slider poses that differ from setup; empty on runtimes without sliders. */
  function posedSliders(adapter: ISpineAdapter): SliderPoses {
    return (adapter.getSliders?.() ?? [])
      .filter(sl => sl.time !== sl.setupTime || sl.mix !== sl.setupMix)
      .map(sl => ({ name: sl.name, time: sl.time, mix: sl.mix }))
  }

  /** Re-poses sliders the new data still has; the UI copy is refreshed when `adapter` is the UI adapter. */
  function applySliders(adapter: ISpineAdapter, poses: SliderPoses, ui: boolean): void {
    if (!adapter.setSliderPose || poses.length === 0) return
    const known = new Set((adapter.getSliders?.() ?? []).map(sl => sl.name))
    for (const p of poses) if (known.has(p.name)) adapter.setSliderPose(p.name, { time: p.time, mix: p.mix })
    if (ui) skeletonStore.sliders = adapter.getSliders?.() ?? []
  }

  /** Drops list entries and the selection the reloaded skeleton no longer has (a revert removes created animations). */
  function pruneMissingAnimations(adapter: ISpineAdapter): void {
    const known = new Set(adapter.animations)
    for (const [idxStr, list] of Object.entries(animationStore.trackPlaylists)) {
      const kept = list.filter(e => known.has(e.animationName))
      if (kept.length === list.length) continue
      if (kept.length > 0) animationStore.setTrackPlaylist(Number(idxStr), kept)
      else animationStore.clearTrackPlaylist(Number(idxStr))
    }
    if (animationStore.selectedAnimation && !known.has(animationStore.selectedAnimation)) animationStore.selectedAnimation = null
  }

  /** populateFrom keeps the selection; a bone or slot the new data lacks is deselected. */
  function keepSelection(adapter: ISpineAdapter): void {
    if (skeletonStore.selectedBone && !adapter.bones.some(b => b.name === skeletonStore.selectedBone)) skeletonStore.selectedBone = null
    if (skeletonStore.selectedSlot && !adapter.slots.some(s => s.name === skeletonStore.selectedSlot)) skeletonStore.selectedSlot = null
    pruneMissingAnimations(adapter)
  }

  function attachUi(adapter: ISpineAdapter): void {
    skeletonStore.populateFrom(adapter)
    adapter.onEvent(e => eventsStore.push(e))
    keepSelection(adapter)
  }

  function childEntryOf(childSlotId: string): { entryId: string; adapter: ISpineAdapter } | null {
    for (const [entryId, meta] of children.childAdapterMeta) {
      const adapter = children.childAdapters.get(entryId)
      if (meta.childSlotId === childSlotId && adapter) return { entryId, adapter }
    }
    return null
  }

  function relinkActiveChild(childSlotId: string): void {
    const mounted = childEntryOf(childSlotId)
    if (!mounted) return
    children.activeChildAdapter.value = mounted.adapter
    attachUi(mounted.adapter)
    const slot = fileLoaderStore.spineSlots.find(s => s.id === childSlotId)
    if (slot?.fileSet) complexityStore.analyze(mounted.adapter, slot.fileSet, atlasStore.pages)
  }

  /** The active top-level slot: the new adapter loads while the old one renders, then one synchronous swap. */
  async function reloadOnStage(slotId: string, fileSet: FileSet): Promise<void> {
    const old = onStage.adapter!
    const fresh = await createLoadedAdapter(fileSet)
    if (onStage.adapter !== old || children.activeChildAdapter.value || slotSelectionStore.activeSlotId !== slotId) {
      fresh.destroy()
      return
    }
    // snapshot after the load, so the times are those of the last frame the old adapter rendered
    const states = old.getTrackStates()
    const overrides = old.getBoneOverrides()
    const sliders = posedSliders(old)
    saveLeavingSlot(slotId, states)

    _suppressAnimPlay = true
    children.destroyChildAdaptersForSlot(slotId)
    old.destroy()
    mountedAdapters.delete(slotId)
    mountedSpineObjects.delete(slotId)
    onStage.adapter = null
    onStage.obj = null
    inspectorStore.clear()
    complexityStore.clear()
    attachLoaded(fresh, fileSet, slotId, false)
    keepSelection(fresh)
    // skins first: setSkins resets slot attachments, the replayed seek then poses the first rendered frame
    applySkins()
    replayChains(fresh, states, animationStore.trackMix, overrides, t => animationStore.isTrackEnabled(t))
    fresh.setTimeScale(animationStore.isPlaying ? animationStore.speed : 0)
    applySliders(fresh, sliders, true)
    skeletonStore.refreshBoneOverrides()
    applyPlaceholderLabels()
    restoreSlotImages(fresh, slotId, undefined)
    await nextTick()
    _suppressAnimPlay = false

    await drainPlaceholderActions()
    if (onStage.adapter === fresh) await children.reloadChildAdaptersForSlot(fresh, slotId)
  }

  /** A child spine: destroy + mount from its new FileSet (the snapshot and replay already exist); a short pop is accepted. */
  async function reloadChild(childSlotId: string): Promise<void> {
    const mounted = childEntryOf(childSlotId)
    if (!mounted) return
    const meta = children.childAdapterMeta.get(mounted.entryId)!
    const parent = mountedAdapters.get(meta.parentSlotId) ?? onStage.adapter
    const entry = placeholderImagesStore.getPlaceholderSpineEntries(meta.parentSlotId, meta.phName)
      .find(e => e.imageId === mounted.entryId)
    if (!parent || !entry) return
    const wasActive = children.activeChildAdapter.value === mounted.adapter
    const sliders = posedSliders(mounted.adapter)
    if (wasActive) children.saveChildState(childSlotId)
    _uiReloading = wasActive
    try {
      children.destroyChildAdapter(mounted.entryId)
      if (wasActive) children.activeChildAdapter.value = null
      await children.mountChildAdapter(parent, meta.parentSlotId, meta.phName, entry)
      if (wasActive) relinkActiveChild(childSlotId)
      const fresh = childEntryOf(childSlotId)?.adapter
      if (fresh) applySliders(fresh, sliders, wasActive)
    } finally {
      _uiReloading = false
    }
    if (!childEntryOf(childSlotId)) throw new Error('The edited skeleton could not be loaded')
  }

  /** A slot that renders but is not the UI adapter (pinned, or the parent of the active child); replays from its saved state. */
  async function reloadParked(slotId: string, fileSet: FileSet, old: ISpineAdapter): Promise<void> {
    const pixiApp = getPixiApp()
    if (!pixiApp) return
    const fresh = await createLoadedAdapter(fileSet)
    if (mountedAdapters.get(slotId) !== old && onStage.adapter !== old) {
      fresh.destroy()
      return
    }
    const ss = fileLoaderStore.spineSlots.find(s => s.id === slotId)?.savedState
    const states = old.getTrackStates()
    const overrides = old.getBoneOverrides()
    const sliders = posedSliders(old)
    const childSliders = new Map<string, SliderPoses>()
    for (const meta of children.childAdapterMeta.values()) {
      if (meta.parentSlotId !== slotId) continue
      const kid = childEntryOf(meta.childSlotId)?.adapter
      if (kid) childSliders.set(meta.childSlotId, posedSliders(kid))
    }
    if (ss) {
      fileLoaderStore.saveSlotState(slotId, {
        ...ss,
        trackTimes: trackTimesOf(states),
        boneOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      })
    }
    const active = slotSelectionStore.activeSlot
    const activeChildId = active?.parentSlotId === slotId && children.activeChildAdapter.value ? active.id : null
    if (activeChildId) children.saveChildState(activeChildId)

    _uiReloading = !!activeChildId
    try {
      children.destroyChildAdaptersForSlot(slotId)
      if (activeChildId) children.activeChildAdapter.value = null
      old.destroy()
      fresh.mount(pixiApp.stage)
      const obj = pixiApp.getLastStageChild()
      mountedAdapters.set(slotId, fresh)
      if (obj) mountedSpineObjects.set(slotId, obj as PixiSpriteObject)
      if (onStage.adapter === old) {
        onStage.adapter = fresh
        onStage.obj = obj
      }
      if (ss?.selectedSkins?.length) fresh.setSkins(ss.selectedSkins)
      replayChains(fresh, states, ss?.trackMix, overrides, t => ss?.trackEnabled[t] !== false)
      fresh.setTimeScale(ss && !ss.wasPlaying ? 0 : (ss?.speed ?? 1))
      applySliders(fresh, sliders, false)
      restoreSlotImages(fresh, slotId, ss?.placeholderChildren)
      applyViewport()
      syncZOrder()
      await children.reloadChildAdaptersForSlot(fresh, slotId)
      if (activeChildId) relinkActiveChild(activeChildId)
      for (const [kidId, poses] of childSliders) {
        const kid = childEntryOf(kidId)?.adapter
        if (kid) applySliders(kid, poses, kidId === activeChildId)
      }
    } finally {
      _uiReloading = false
    }
  }

  /**
   * Rebuilds a slot from its current `fileSet` after a data edit, keeping playback, skins, overrides,
   * placeholders, pin and selection. A slot that is not rendered needs nothing: its next load reads the new FileSet.
   * Throws when the new data cannot be loaded; the top-level and parked paths then leave the old adapter untouched.
   */
  async function reloadSlot(slotId: string): Promise<void> {
    const slot = fileLoaderStore.spineSlots.find(s => s.id === slotId)
    if (!slot?.fileSet) return
    if (slot.parentSlotId) return reloadChild(slotId)
    const active = slotSelectionStore.activeSlot
    const onStageId = active?.parentSlotId ?? active?.id
    if (slotId === onStageId && onStage.adapter && !children.activeChildAdapter.value) {
      return reloadOnStage(slotId, slot.fileSet)
    }
    const old = slotId === onStageId && onStage.adapter ? onStage.adapter : mountedAdapters.get(slotId)
    if (old) await reloadParked(slotId, slot.fileSet, old)
  }

  return {
    start,
    saveActive,
    reloadSlot,
    /** True while the UI adapter is being replaced; the ticker must not drive the stores from another adapter meanwhile. */
    isUiReloading: () => _uiReloading,
    /** The isPlaying watcher must not replay playlists while a switch sets isPlaying itself. */
    isAnimPlaySuppressed: () => _suppressAnimPlay,
    /** Track times a restore wants applied after the next play; cleared once taken. */
    takePendingSeekTimes: (): Record<number, number> | null => {
      const times = _pendingSeekTimes
      _pendingSeekTimes = null
      return times
    },
  }
}
