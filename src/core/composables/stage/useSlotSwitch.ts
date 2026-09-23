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
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { FileSet, PHChildEntry } from '@/core/types/FileSet'
import { buildSlotSavedState, playlistsOf, queueTrackList, replaySavedTracks, trackTimesOf } from '@/core/utils/slotState'

/** The active top-level slot on stage; while a child spine is active this is its parent. */
export interface ActiveStage {
  adapter: ISpineAdapter | null
  obj: unknown
}

export interface SlotSwitchContext {
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
    loadSpine, applySkins, applyPlaceholderLabels, drainPlaceholderActions, applyViewport, syncZOrder,
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
    }
  }

  function saveLeavingSlot(slotId: string, trackTimes: Record<number, number>): void {
    fileLoaderStore.saveSlotState(slotId, buildSlotSavedState({
      playback:             animationStore,
      activeSkins:          skeletonStore.activeSkins,
      showPlaceholders:     viewerStore.showPlaceholders,
      disabledPlaceholders: viewerStore.disabledPlaceholders,
      slot:                 fileLoaderStore.spineSlots.find(s => s.id === slotId),
      trackTimes,
      placeholderChildren:  placeholderImagesStore.getSlotImages(slotId),
    }))
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

          if (!children.activeChildAdapter.value && onStage.adapter && effectiveOldId) {
            saveLeavingSlot(effectiveOldId, trackTimesOf(onStage.adapter.getTrackStates()))
            if (effectiveOldId !== newSlot.parentSlotId) {
              if (slotSelectionStore.isPinned(effectiveOldId)) {
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
          } else if (children.activeChildAdapter.value && prevSlot?.parentSlotId && oldId) {
            children.saveChildState(oldId)
          }

          children.activeChildAdapter.value = childAdapterRef

          _suppressAnimPlay = true
          skeletonStore.clear()
          animationStore.reset()
          eventsStore.clear()
          inspectorStore.clear()
          skeletonStore.attachAdapter(childAdapterRef)
          skeletonStore.populate({
            animations: childAdapterRef.animations,
            skins:      childAdapterRef.skins,
            bones:      childAdapterRef.bones,
            slots:      childAdapterRef.slots,
            events:     childAdapterRef.events,
            freeBones:  childAdapterRef.getFreeBones(),
          })
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
          for (const [idxStr, playlist] of Object.entries(liveChildPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
          }
          if (childSs?.selectedSkins?.length) skeletonStore.activeSkins = [...childSs.selectedSkins]
          animationStore.isPaused = false
          animationStore.isPlaying = childSs?.wasPlaying ?? false

          await nextTick()
          _suppressAnimPlay = false
          childAdapterRef.setTimeScale((childSs?.wasPlaying ?? false) ? (childSs?.speed ?? 1) : 0)
          return
        }

        // Step 1: Save state of leaving slot
        if (effectiveOldId) {
          if (children.activeChildAdapter.value) {
            if (oldId) children.saveChildState(oldId)
            children.activeChildAdapter.value = null
            const parentSs = fileLoaderStore.spineSlots.find(s => s.id === effectiveOldId)?.savedState
            if (parentSs && onStage.adapter) {
              fileLoaderStore.saveSlotState(effectiveOldId, {
                ...parentSs,
                trackTimes: trackTimesOf(onStage.adapter.getTrackStates()),
                placeholderChildren: placeholderImagesStore.getSlotImages(effectiveOldId),
              })
            }
          } else {
            saveLeavingSlot(effectiveOldId, trackTimesOf(onStage.adapter?.getTrackStates() ?? []))
          }
        }

        // Step 2: Park or destroy old adapter
        if (effectiveOldId && onStage.adapter) {
          for (const action of placeholderImagesStore.peekActions()) {
            if (action.type === 'move-child' && action.kind === 'image' && action.slotId === effectiveOldId && action.imageId) {
              onStage.adapter.removeImageFromPlaceholder(action.phName, action.imageId)
            }
          }
        }
        if (effectiveOldId && onStage.adapter) {
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
          for (const [idxStr, playlist] of Object.entries(s.trackPlaylists)) {
            animationStore.setTrackPlaylist(Number(idxStr), playlist)
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

            skeletonStore.attachAdapter(onStage.adapter)
            skeletonStore.populate({
              animations: onStage.adapter.animations,
              skins:      onStage.adapter.skins,
              bones:      onStage.adapter.bones,
              slots:      onStage.adapter.slots,
              events:     onStage.adapter.events,
              freeBones:  onStage.adapter.getFreeBones(),
            })
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

  return {
    start,
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
