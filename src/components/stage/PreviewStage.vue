<!--
 * @file PreviewStage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div
    ref="containerRef"
    class="stage"
    :class="{ 'stage--pan': isPanning }"
    @mousedown="onPanStart"
    @mousemove="onPanMove"
    @mouseup="onPanEnd"
    @mouseleave="onPanEnd"
    @dblclick="onResetView"
  >
    <canvas ref="canvasRef" class="canvas" />

    <!-- Origin crosshair -->
    <div
      v-if="viewerStore.showOrigin && spineLoaded"
      class="origin-cross"
      :style="{ left: originScreenX + 'px', top: originScreenY + 'px' }"
    />

    <!-- Selected bone crosshair -->
    <div
      v-if="selectedBonePos"
      class="bone-cross"
      :style="{ left: selectedBonePos.x + 'px', top: selectedBonePos.y + 'px' }"
    />

    <!-- Selected slot bounds -->
    <div
      v-if="selectedSlotRect"
      class="slot-bounds"
      :style="{
        left:   selectedSlotRect.left   + 'px',
        top:    selectedSlotRect.top    + 'px',
        width:  selectedSlotRect.width  + 'px',
        height: selectedSlotRect.height + 'px',
      }"
    />

    <!-- Top-left overlay: origin toggle + bg color picker + ph list -->
    <div class="overlay-top-left">
      <div class="origin-toggle">
        <input
          id="origin-cb"
          type="checkbox"
          v-model="viewerStore.showOrigin"
          title="Show origin (0,0)"
        />
        <span class="origin-label" title="Center scene" @click="onResetView">origin</span>
        <input
          type="checkbox"
          v-model="viewerStore.showPlaceholders"
          title="Show placeholder labels"
          class="ph-toggle"
        />
        <span class="ph-label">ph</span>
        <input
          type="color"
          class="bg-color-input"
          :value="bgColorHex"
          title="Background color"
          @input="onBgColorInput"
        />
        <span class="bg-color-label">bg</span>
      </div>
      <div v-if="viewerStore.showPlaceholders && phItems.length > 0" class="ph-list">
        <label
          v-for="item in phItems"
          :key="item.name"
          class="ph-list-item"
        >
          <input
            type="checkbox"
            :checked="!viewerStore.disabledPlaceholders.has(item.name)"
            @change="viewerStore.togglePlaceholder(item.name)"
          />
          <span class="ph-list-name">{{ item.name }}</span>
        </label>
      </div>
    </div>

    <div class="overlay-top-right">
      <span class="fps" :class="fpsClass">{{ fps }} FPS</span>
    </div>

    <div v-if="spineError" class="error-banner">
      {{ spineError }}
    </div>

    <div v-if="loading" class="loading">
      <n-spin size="medium" />
      <p class="loading-text">{{ loadingText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { createPixiApp, createSpineAdapter } from '@/core/AdapterFactory'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import { useEventsStore } from '@/core/stores/useEventsStore'
import { useAtlasStore }      from '@/core/stores/useAtlasStore'
import { useProfilerStore }   from '@/core/stores/useProfilerStore'
import { useComplexityStore } from '@/core/stores/useComplexityStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useChildAdapters } from '@/core/composables/stage/useChildAdapters'
import { useLoopStateMachine } from '@/core/composables/stage/useLoopStateMachine'
import { useViewportSync } from '@/core/composables/stage/useViewportSync'
import { usePanAndDrag } from '@/core/composables/stage/usePanAndDrag'
import { useSeekDrag } from '@/core/composables/stage/useSeekDrag'
import { useSlotSwitch, type ActiveStage } from '@/core/composables/stage/useSlotSwitch'
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { IProgressOverlay } from '@/core/types/IProgressOverlay'
import type { TrackDisplayState, MarkerDisplay } from '@/core/types/IProgressOverlay'
import type { ISpineAdapter, AnimationEventMarker } from '@/core/types/ISpineAdapter'
import type { FileSet, PHSpineEntry } from '@/core/types/FileSet'
import { makeLoopState, computeNorm, resetLoopState } from '@/core/overlay/overlayMath'
import { queueTrackList, rearmListLoops, playlistPosition, shouldAutoStop } from '@/core/utils/slotState'
import { fitSequenceScale } from '@/core/utils/exportUtils'

const versionStore   = useVersionStore()
const viewerStore    = useViewerStore()
const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()
const inspectorStore = useInspectorStore()
const eventsStore    = useEventsStore()
const atlasStore      = useAtlasStore()
const profilerStore   = useProfilerStore()
const complexityStore = useComplexityStore()
const fileLoaderStore         = useFileLoaderStore()
const slotSelectionStore      = useSlotSelectionStore()
const backgroundStore         = useBackgroundStore()
const placeholderImagesStore  = usePlaceholderImagesStore()

// ── Mutable adapter/state references ─────────────────────────────────────────
let bgSprite: PixiSpriteObject | null = null
let pixiApp: IPixiApp | null = null
// the active top-level slot on stage (the parent while a child spine is active)
const onStage: ActiveStage = { adapter: null, obj: null }
const mountedAdapters     = new Map<string, ISpineAdapter>()
const mountedSpineObjects = new Map<string, PixiSpriteObject>()

// Watchers created after an await in onMounted are not bound to the component — stop them on unmount.
const stageWatchStops: Array<ReturnType<typeof watch>> = []
const watchStage = ((...args: Parameters<typeof watch>) => {
  const stop = (watch as (...a: Parameters<typeof watch>) => ReturnType<typeof watch>)(...args)
  stageWatchStops.push(stop)
  return stop
}) as typeof watch

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef    = ref<HTMLCanvasElement | null>(null)
const fps         = ref(0)
const loading     = ref(true)
const loadingText = ref('Initializing Pixi…')
const spineError  = ref<string | null>(null)
const spineLoaded = ref(false)

const fpsClass = computed(() => {
  if (fps.value < 30) return 'fps--bad'
  if (fps.value < 55) return 'fps--ok'
  return 'fps--good'
})

// ── Composables ───────────────────────────────────────────────────────────────
const children = useChildAdapters()
const loopSM   = useLoopStateMachine()

function _uiAdapter(): ISpineAdapter | null { return children.activeChildAdapter.value ?? onStage.adapter }

// progressOverlay is assigned in onMounted; the seek callback closes over the variable reference
let progressOverlay: IProgressOverlay | null = null

const seekDrag = useSeekDrag(
  (e: MouseEvent) => {
    if (!progressOverlay || !containerRef.value) return
    const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
    const r = progressOverlay.handleSeekDrag(e.clientX - rect.left, e.clientY - rect.top)
    if (r) {
      const track = animationStore.tracks.find(t => t.trackIndex === r.trackIndex)
      if (track) {
        _uiAdapter()?.seekTo(r.trackIndex, r.pct * track.duration)
        const ls = loopSM.loopStates.get(r.trackIndex)
        if (ls) resetLoopState(ls, r.pct)
      }
    }
  },
  () => {},
)

const viewport = useViewportSync(mountedSpineObjects, () => bgSprite, _uiAdapter)
const { baseX, baseY, originScreenX, originScreenY, selectedBonePos, selectedSlotRect, applyViewport, syncZOrder, updateSelectedSlotRect } = viewport

const panDrag = usePanAndDrag(
  containerRef as Ref<HTMLElement | null>,
  () => onStage.adapter,
  () => mountedAdapters,
  () => mountedSpineObjects,
  () => children.childAdapters,
  () => children.childAdapterMeta,
  () => children.activeChildAdapter.value,
  () => onStage.obj,
  () => baseX.value,
  () => baseY.value,
  () => progressOverlay,
  () => loopSM.loopStates,
  _uiAdapter,
  children.getActiveChildParentMatrix,
  applyViewport,
  seekDrag.startSeekDrag,
  loopSM.dcRaw,
)
const { isPanning, onPanStart, onPanMove, onPanEnd, onWheel } = panDrag

// ── Placeholder items ─────────────────────────────────────────────────────────
const phItems = ref<Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>>([])
const activePHItems = computed(() =>
  phItems.value.filter(i => !viewerStore.disabledPlaceholders.has(i.name)),
)

function applyPlaceholderLabels() {
  if (!onStage.adapter) return
  if (viewerStore.showPlaceholders && activePHItems.value.length > 0) {
    onStage.adapter.setPlaceholderLabels(activePHItems.value)
  } else {
    onStage.adapter.clearPlaceholderLabels()
  }
}

watch(() => viewerStore.showPlaceholders, applyPlaceholderLabels)
watch(() => viewerStore.disabledPlaceholders, applyPlaceholderLabels)

const slotSwitch = useSlotSwitch({
  onStage,
  mountedAdapters,
  mountedSpineObjects,
  children,
  getPixiApp: () => pixiApp,
  loading,
  spineLoaded,
  spineError,
  phItems,
  loadSpine,
  applySkins,
  applyPlaceholderLabels,
  drainPlaceholderActions,
  applyViewport,
  syncZOrder,
})

// ── Drain placeholder actions ──────────────────────────────────────────────────
// While a child spine is active, onStage.adapter still belongs to its parent slot.
function adapterForSlot(slotId: string): ISpineAdapter | null {
  const active = slotSelectionStore.activeSlot
  if (slotId === active?.id || slotId === active?.parentSlotId) return onStage.adapter
  return mountedAdapters.get(slotId) ?? null
}

async function drainPlaceholderActions() {
  if (!onStage.adapter) return
  const actions = placeholderImagesStore.drainActions()
  for (const action of actions) {
    if (action.type === 'reorder-child') {
      const adapter = adapterForSlot(action.slotId)
      if (adapter && action.orderedIds) {
        action.orderedIds.forEach((id, idx) => adapter.setImageZIndex(id, idx))
      }
    } else if (action.type === 'move-child') {
      if (action.kind === 'image') {
        const srcAdapter = adapterForSlot(action.slotId)
        srcAdapter?.removeImageFromPlaceholder(action.phName, action.imageId)
        const dstAdapter = adapterForSlot(action.dstSlotId)
        if (dstAdapter && action.dataURL && action.imageId) {
          dstAdapter.addImageToPlaceholder(action.dstPhName, action.dataURL, action.imageId)
          dstAdapter.setImageTransform(action.imageId, 0, 0, action.scale ?? 1)
          const dstEntries = placeholderImagesStore.getPlaceholderImages(action.dstSlotId, action.dstPhName)
          const zIdx = dstEntries.findIndex(e => e.imageId === action.imageId)
          if (zIdx !== -1) dstAdapter.setImageZIndex(action.imageId, zIdx)
        }
      } else {
        children.moveChildAdapter(action.imageId, adapterForSlot(action.dstSlotId), action.dstSlotId, action.dstPhName)
      }
    } else if (action.type === 'add-spine') {
      const phEntries = placeholderImagesStore.getPlaceholderImages(action.slotId, action.phName)
      const entry = phEntries.find(e => e.imageId === action.imageId && e.kind === 'spine') as PHSpineEntry | undefined
      if (entry && !children.childAdapters.has(entry.imageId)) {
        const parentAdapter = adapterForSlot(action.slotId)
        if (parentAdapter) await children.mountChildAdapter(parentAdapter, action.slotId, action.phName, entry)
      }
    } else if (action.type === 'remove-spine') {
      const childAdapter = children.childAdapters.get(action.imageId)
      if (childAdapter) {
        childAdapter.destroy()
        children.childAdapters.delete(action.imageId)
        children.childAdapterMeta.delete(action.imageId)
      }
    } else {
      // A slot that is not on stage picks its images up from the store when it is restored.
      const adapter = adapterForSlot(action.slotId)
      if (!adapter) continue
      if (action.type === 'add') {
        adapter.addImageToPlaceholder(action.phName, action.dataURL, action.imageId)
        const ctx = placeholderImagesStore.getChildContext(action.imageId)
        if (ctx && (ctx.entry.posX !== 0 || ctx.entry.posY !== 0 || ctx.entry.scale !== 1)) {
          adapter.setImageTransform(action.imageId, ctx.entry.posX, ctx.entry.posY, ctx.entry.scale)
        }
      } else if (action.type === 'remove') {
        adapter.removeImageFromPlaceholder(action.phName, action.imageId)
      }
    }
  }
}

watch(
  () => placeholderImagesStore.hasPendingActions,
  (has) => { if (has) drainPlaceholderActions() },
)

// ── Misc helpers ──────────────────────────────────────────────────────────────
const bgColorHex = computed(() =>
  '#' + viewerStore.bgColor.toString(16).padStart(6, '0'),
)

function onBgColorInput(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  viewerStore.bgColor = parseInt(hex.slice(1), 16)
}

function applySkins() {
  const uiAd = _uiAdapter()
  if (!uiAd) return
  const stored = skeletonStore.activeSkins
  const toApply = stored.length > 0
    ? [...stored]
    : (() => {
        const first = uiAd.skins.find((s: string) => s !== 'default')
        return first ? [first] : []
      })()
  if (toApply.length === 0) return
  uiAd.setSkins(toApply)
  if (stored.length === 0) skeletonStore.activeSkins = toApply
}

function onResetView() {
  viewerStore.resetView()
  applyViewport()
}

// ── Ticker / overlay state ────────────────────────────────────────────────────
let tickerFn: ((dt: number) => void) | null = null
let lastFrameTs    = 0
let lastInspectorTs = 0
const eventMarkersMap = ref<Map<number, AnimationEventMarker[]>>(new Map())

onMounted(async () => {
  const canvas    = canvasRef.value!
  const container = containerRef.value!
  container.addEventListener('wheel', onWheel, { passive: false })
  const { width, height } = container.getBoundingClientRect()

  try {
    pixiApp = await createPixiApp(
      versionStore.pixiVersion!,
      canvas,
      Math.max(width, 1),
      Math.max(height, 1),
    )
    pixiApp.setSortableChildren(true)
    progressOverlay = pixiApp.createProgressOverlay(width, height)

    lastFrameTs = lastInspectorTs = performance.now()
    tickerFn = () => {
      const now = performance.now()
      const ms  = now - lastFrameTs
      lastFrameTs = now

      fps.value = Math.round(pixiApp!.ticker.FPS)
      profilerStore.recordFrame(fps.value, ms)
      rearmOffUiAdapters()
      if (onStage.adapter) {
        onStage.adapter.tickPlaceholderLabels()
        const uiAd = _uiAdapter()!
        const states = uiAd.getTrackStates()
        animationStore.setTracks(states)
        rearmListLoops(uiAd, states, animationStore.trackPlaylists, animationStore.trackEnabled)

        for (const state of states) {
          if (!animationStore.isTrackEnabled(state.trackIndex) && state.timeScale !== 0) {
            uiAd.setTrackTimeScale(state.trackIndex, 0)
          }
        }

        if (animationStore.isPlaying && states.length > 0 && shouldAutoStop(states, {
          isEnabled:  animationStore.isTrackEnabled,
          isListLoop: animationStore.isTrackListLoop,
          listLength: t => animationStore.trackPlaylists[t]?.length ?? 0,
        })) {
          animationStore.stop()
        }

        if (skeletonStore.selectedBone) inspectorStore.updateBones(uiAd.getBoneTransforms())
        if (skeletonStore.selectedSlot) updateSelectedSlotRect()

        // ── Loop state machine ────────────────────────────────────────────────
        const activeTrackIds = new Set(states.map(s => s.trackIndex))
        for (const id of loopSM.loopStates.keys()) {
          if (!activeTrackIds.has(id)) loopSM.loopStates.delete(id)
        }
        const displayTracks: TrackDisplayState[] = states.map(s => {
          if (!loopSM.loopStates.has(s.trackIndex)) loopSM.loopStates.set(s.trackIndex, makeLoopState())
          const loopSt = loopSM.loopStates.get(s.trackIndex)!
          const normPos = computeNorm(s.time, s.duration, s.loop, loopSt)
          return {
            trackIndex:    s.trackIndex,
            animationName: s.animationName,
            normPos,
            displayTime:   normPos * s.duration,
            duration:      s.duration,
          }
        })

        // ── DC sparkline sampling ─────────────────────────────────────────────
        const frameStats = pixiApp!.getStats()
        if (typeof frameStats.drawCalls === 'number') {
          const validTracks = states.filter(t => t.duration > 0 && animationStore.isTrackEnabled(t.trackIndex))
          if (validTracks.length > 0) {
            let normSum = 0
            for (const t of validTracks) {
              const pos = t.loop ? t.time % t.duration : Math.min(t.time, t.duration)
              normSum += pos / t.duration
            }
            const normPos = normSum / validTracks.length
            if (loopSM.lastDcNormPos > 0.5 && normPos < 0.2) {
              loopSM.dcRaw.fill(null)
            }
            loopSM.lastDcNormPos = normPos
            const bucket = Math.min(loopSM.dcRaw.length - 1, Math.floor(normPos * loopSM.dcRaw.length))
            loopSM.dcRaw[bucket] = frameStats.drawCalls
          }
        }

        // ── Progress overlay ──────────────────────────────────────────────────
        if (progressOverlay) {
          const { width: stageW, height: stageH } = (containerRef.value as HTMLElement).getBoundingClientRect()
          const markersPerTrack = new Map<number, MarkerDisplay[]>()
          for (const [trackIdx, markers] of eventMarkersMap.value) {
            const track = states.find(s => s.trackIndex === trackIdx)
            if (!track || track.duration <= 0) continue
            markersPerTrack.set(trackIdx, markers.map(m => ({
              name:    m.name,
              normPos: m.time / track.duration,
            })))
          }
          progressOverlay.update({
            tracks:            displayTracks,
            markersPerTrack,
            dcBuckets:         loopSM.dcRaw,
            stageW,
            stageH,
            hoveredTrackIndex: panDrag.getOverlayHoverTrackIndex(),
          })
        }

        if (now - lastInspectorTs >= 100) {
          lastInspectorTs = now
          const attachments = uiAd.getActiveAttachments()
          inspectorStore.update(uiAd.getBoneTransforms(), attachments)
          atlasStore.markSeen(
            attachments
              .filter(a => a.type === 'region' || a.type === 'mesh')
              .map(a => a.attachmentName),
          )
          profilerStore.updateStats(frameStats, attachments)
        }
      }
    }
    pixiApp.ticker.add(tickerFn)

    watchStage(
      () => viewerStore.bgColor,
      (color) => pixiApp?.setBackground(color),
      { immediate: true },
    )

    watchStage(
      () => backgroundStore.image,
      (img) => {
        if (bgSprite) {
          pixiApp!.removeFromStage(bgSprite)
          bgSprite.destroy?.({ texture: true })
          bgSprite = null
        }
        if (img) {
          bgSprite = pixiApp!.createSprite(img.dataUrl) as PixiSpriteObject
          pixiApp!.addToStage(bgSprite)
          applyViewport()
          syncZOrder()
        }
      },
    )

    watchStage(
      () => backgroundStore.syncEnabled,
      (newSync, oldSync) => {
        if (oldSync !== undefined && newSync !== oldSync) {
          if (oldSync && !newSync) {
            backgroundStore.setTransform(
              viewerStore.posX + backgroundStore.posX * viewerStore.zoom,
              viewerStore.posY + backgroundStore.posY * viewerStore.zoom,
              viewerStore.zoom * backgroundStore.zoom,
            )
          } else if (!oldSync && newSync) {
            const z = viewerStore.zoom > 0 ? viewerStore.zoom : 1
            backgroundStore.setTransform(
              (backgroundStore.posX - viewerStore.posX) / z,
              (backgroundStore.posY - viewerStore.posY) / z,
              backgroundStore.zoom / z,
            )
          }
        }
        applyViewport()
      },
    )

    watchStage(
      () => [backgroundStore.posX, backgroundStore.posY, backgroundStore.zoom],
      () => { if (bgSprite) applyViewport() },
    )

    watchStage(
      () => backgroundStore.listIndex,
      () => syncZOrder(),
    )

    watchStage(
      () => fileLoaderStore.spineSlots.map(s => ({ id: s.id, sync: s.syncEnabled !== false })),
      () => applyViewport(),
      { deep: false },
    )

    watchStage(
      () => {
        const active = slotSelectionStore.activeSlot
        if (!active?.parentSlotId) return null
        return [active.syncEnabled, active.indPosX, active.indPosY, active.indZoom]
      },
      () => {
        const active = slotSelectionStore.activeSlot
        if (!active?.parentSlotId) return
        for (const [entryId, meta] of children.childAdapterMeta) {
          if (meta.childSlotId === active.id) {
            children.applyChildTransform(entryId)
            break
          }
        }
      },
      { deep: true },
    )

    watchStage(
      () => animationStore.tracks.map(t => `${t.trackIndex}:${t.animationName}`).join(','),
      () => { loopSM.dcRaw.fill(null) },
      { deep: false },
    )

    watchStage(
      () => animationStore.tracks.map(t => `${t.trackIndex}:${t.animationName}`),
      () => {
        if (!onStage.adapter) return
        const next = new Map<number, AnimationEventMarker[]>()
        const flat: typeof eventsStore.animationMarkers[0][] = []
        for (const track of animationStore.tracks) {
          const markers = onStage.adapter.getAnimationEvents(track.animationName)
          next.set(track.trackIndex, markers)
          for (const m of markers) flat.push({ ...m, trackIndex: track.trackIndex, animationName: track.animationName })
        }
        eventMarkersMap.value = next
        eventsStore.setAnimationMarkers(flat)
      },
      { deep: false },
    )

    watchStage(
      () => animationStore.speed,
      (newSpeed) => {
        if (animationStore.isPlaying) _uiAdapter()?.setTimeScale(newSpeed)
      },
    )

    watchStage(
      () => animationStore.trackEnabled,
      (enabledMap) => {
        const uiAd = _uiAdapter()
        if (!uiAd || !animationStore.isPlaying) return
        for (const track of animationStore.tracks) {
          const enabled = enabledMap[track.trackIndex] !== false
          uiAd.setTrackTimeScale(track.trackIndex, enabled ? animationStore.speed : 0)
        }
      },
      { deep: true },
    )

    watchStage(
      () => animationStore.isPlaying,
      (playing) => {
        if (slotSwitch.isAnimPlaySuppressed()) return
        const uiAd = _uiAdapter()
        if (!uiAd) return
        if (playing) {
          if (!animationStore.isPaused) {
            loopSM.dcRaw.fill(null)
            loopSM.lastDcNormPos = -1
            for (const [idxStr, playlist] of Object.entries(animationStore.trackPlaylists)) {
              const trackIndex = Number(idxStr)
              if (!animationStore.isTrackEnabled(trackIndex)) continue
              queueTrackList(uiAd, trackIndex, playlist)
            }
            const seekTimes = slotSwitch.takePendingSeekTimes()
            if (seekTimes) {
              for (const [idxStr, time] of Object.entries(seekTimes)) {
                uiAd.seekTo(Number(idxStr), time)
              }
            }
          }
          animationStore.isPaused = false
          uiAd.setTimeScale(animationStore.speed)
          for (const t of animationStore.tracks) {
            if (!animationStore.isTrackEnabled(t.trackIndex)) {
              uiAd.setTrackTimeScale(t.trackIndex, 0)
            }
          }
        } else {
          uiAd.setTimeScale(0)
        }
      },
    )

    slotSwitch.start(watchStage)

    watchStage(
      () => fileLoaderStore.spineSlots.filter(s => !s.parentSlotId).map(s => s.id).join(),
      () => syncZOrder(),
    )

    if (slotSelectionStore.activeSlot?.fileSet) {
      await loadSpine(slotSelectionStore.activeSlot.fileSet, slotSelectionStore.activeSlotId ?? undefined)
      applySkins()
    }
  } catch (e) {
    console.error('[PreviewStage] init error:', e)
    spineError.value = e instanceof Error ? e.message : 'Failed to initialize Pixi'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  for (const stop of stageWatchStops) stop()
  stageWatchStops.length = 0
  containerRef.value?.removeEventListener('wheel', onWheel)
  seekDrag.cleanup()
  onStage.obj = null
  if (bgSprite) {
    bgSprite.destroy?.({ texture: true })
    bgSprite = null
  }
  backgroundStore.clearAll()
  if (pixiApp && tickerFn) pixiApp.ticker.remove(tickerFn)
  progressOverlay?.destroy()
  progressOverlay = null
  children.destroyAll()
  for (const adapter of mountedAdapters.values()) {
    adapter.destroy()
  }
  mountedAdapters.clear()
  mountedSpineObjects.clear()
  onStage.adapter = null
  pixiApp?.destroy()
  pixiApp = null
  inspectorStore.clear()
  eventsStore.clear()
  atlasStore.clear()
  profilerStore.clear()
  complexityStore.clear()
})

useResizeObserver(containerRef, ([entry]) => {
  const { width, height } = entry.contentRect
  if (width > 0 && height > 0) {
    pixiApp?.resize(width, height)
    progressOverlay?.resize(width, height)
    baseX.value = width / 2
    baseY.value = height * 0.5
    applyViewport()
  }
})

// ── loadSpine ─────────────────────────────────────────────────────────────────

async function loadSpine(fileSet: FileSet, slotId?: string, resetViewport = true): Promise<void> {
  if (!pixiApp) return
  spineError.value = null
  loopSM.dcRaw.fill(null)
  loopSM.lastDcNormPos = -1

  if (onStage.adapter) {
    const oldSlotId = [...mountedAdapters.entries()].find(([, a]) => a === onStage.adapter)?.[0]
    if (oldSlotId) {
      mountedAdapters.delete(oldSlotId)
      mountedSpineObjects.delete(oldSlotId)
    }
    onStage.adapter.destroy()
    onStage.adapter = null
    onStage.obj = null
    skeletonStore.clear()
    animationStore.reset()
    inspectorStore.clear()
    eventsStore.clear()
    atlasStore.clear()
    profilerStore.clear()
    complexityStore.clear()
  }

  loading.value = true
  loadingText.value = 'Loading Spine…'

  try {
    onStage.adapter = await createSpineAdapter(
      versionStore.pixiVersion!,
      versionStore.spineVersion!,
    )
    await onStage.adapter.load(fileSet)

    const container = containerRef.value!
    const { width, height } = container.getBoundingClientRect()

    onStage.adapter.mount(pixiApp.stage)
    onStage.adapter.setTimeScale(animationStore.isPlaying ? animationStore.speed : 0)

    onStage.obj = pixiApp.getLastStageChild()
    baseX.value = width / 2
    baseY.value = height * 0.5
    spineLoaded.value = true
    if (resetViewport) viewerStore.resetView()

    if (slotId) {
      mountedAdapters.set(slotId, onStage.adapter)
      if (onStage.obj) mountedSpineObjects.set(slotId, onStage.obj as PixiSpriteObject)
    }

    applyViewport()
    syncZOrder()

    skeletonStore.attachAdapter(onStage.adapter)
    skeletonStore.populate({
      animations: onStage.adapter.animations,
      skins:      onStage.adapter.skins,
      bones:      onStage.adapter.bones,
      slots:      onStage.adapter.slots,
      events:     onStage.adapter.events,
      freeBones:  onStage.adapter.getFreeBones(),
    })

    const PH_RE = /placeholder/i
    const phSlotNames = new Set(onStage.adapter.slots.filter(s => PH_RE.test(s.name)).map(s => s.name))
    phItems.value = [
      ...[...phSlotNames].map(name => ({ name, kind: 'slot' as const })),
      ...onStage.adapter.bones
        .filter(b => PH_RE.test(b.name) && !phSlotNames.has(b.name))
        .map(b => ({ name: b.name, kind: 'bone' as const })),
    ]
    if (slotId) {
      fileLoaderStore.setSlotPlaceholders(
        slotId,
        phItems.value
          .filter(p => p.kind !== 'attachment')
          .map(p => ({ name: p.name, kind: p.kind as 'bone' | 'slot' })),
      )
    }
    if (phItems.value.length > 0 && viewerStore.showPlaceholders) {
      onStage.adapter.setPlaceholderLabels(phItems.value)
    }

    onStage.adapter.onEvent(e => eventsStore.push(e))

    if (typeof fileSet.atlas.fileBody === 'string') {
      atlasStore.load(fileSet.atlas.fileBody, fileSet.images)
    }
    complexityStore.analyze(onStage.adapter, fileSet, atlasStore.pages)
  } catch (e) {
    spineError.value = e instanceof Error ? e.message : 'Failed to load Spine'
    console.error('[PreviewStage] loadSpine error:', e)
  } finally {
    loading.value = false
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────

type CaptureLimit = 'gpu' | 'memory' | null

// overlay and placeholder labels stay out of exported frames
async function withViewerOverlaysHidden<T>(fn: () => Promise<T>): Promise<T> {
  progressOverlay?.setVisible(false)
  onStage.adapter?.clearPlaceholderLabels()
  try {
    return await fn()
  } finally {
    progressOverlay?.setVisible(true)
    applyPlaceholderLabels()
  }
}

async function captureCurrentFrame(opts: { scale?: number } = {}): Promise<{ canvas: HTMLCanvasElement; scale: number } | null> {
  const app = pixiApp
  if (!app) return null
  return withViewerOverlaysHidden(() => app.extractFrame(opts))
}

async function captureAnimFrames(
  track: number,
  frameCount: number,
  onFrame: (canvas: HTMLCanvasElement, index: number, total: number) => void,
  signal?: AbortSignal,
  opts: { scale?: number } = {},
): Promise<{ scale: number; limit: CaptureLimit } | null> {
  const app = pixiApp
  const adapter = onStage.adapter
  if (!app || !adapter) return null
  const entry = animationStore.tracks.find(t => t.trackIndex === track)
  if (!entry || entry.duration <= 0) return null

  const requested = opts.scale ?? 1
  const w = containerRef.value?.clientWidth ?? 0
  const h = containerRef.value?.clientHeight ?? 0
  let scale = fitSequenceScale(frameCount, w, h, requested)
  let limit: CaptureLimit = scale < requested ? 'memory' : null

  const wasPlaying = animationStore.isPlaying
  adapter.setTimeScale(0)
  const duration = entry.duration

  try {
    return await withViewerOverlaysHidden(async () => {
      for (let i = 0; i < frameCount; i++) {
        if (signal?.aborted) return null
        const t = frameCount === 1 ? 0 : (i / (frameCount - 1)) * duration
        adapter.seekTo(track, t)
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        if (signal?.aborted) return null
        const frame = await app.extractFrame({ scale })
        if (!frame) return null
        if (frame.scale < scale) { scale = frame.scale; limit = 'gpu' }
        onFrame(frame.canvas, i, frameCount)
      }
      return { scale, limit }
    })
  } finally {
    if (wasPlaying) adapter.setTimeScale(animationStore.speed)
    adapter.seekTo(track, 0)
  }
}

// pinned, parked-parent and inactive child adapters cycle their lists from their slot's saved state
function rearmOffUiAdapters(): void {
  const uiAd = _uiAdapter()
  const candidates: Array<[ISpineAdapter, string | undefined]> = [...mountedAdapters].map(([id, a]) => [a, id])
  if (onStage.adapter) candidates.push([onStage.adapter, slotSelectionStore.activeSlot?.parentSlotId])
  for (const [entryId, meta] of children.childAdapterMeta) {
    const a = children.childAdapters.get(entryId)
    if (a) candidates.push([a, meta.childSlotId])
  }
  const seen = new Set<ISpineAdapter>()
  for (const [a, slotId] of candidates) {
    if (a === uiAd || seen.has(a) || !slotId) continue
    seen.add(a)
    const saved = fileLoaderStore.spineSlots.find(s => s.id === slotId)?.savedState
    if (!saved || !Object.values(saved.trackPlaylists).some(l => l.length >= 2 && l[0].loop)) continue
    rearmListLoops(a, a.getTrackStates(), saved.trackPlaylists, saved.trackEnabled)
  }
}

defineExpose({
  loadSpine,
  setAnimation: (track: number, name: string, loop: boolean) => {
    animationStore.setTrackEnabled(track, true)
    animationStore.setTrackPlaylist(track, [{ animationName: name, loop }])
    _uiAdapter()?.setAnimation(track, name, loop)
  },
  addAnimation: (track: number, name: string, loop: boolean) => {
    animationStore.setTrackEnabled(track, true)
    animationStore.appendToTrackPlaylist(track, name, loop)
    const ad = _uiAdapter()
    const length = animationStore.trackPlaylists[track]?.length ?? 0
    // a list of two or more is queued non-looping and cycled by the ticker
    if (length === 2) ad?.setTrackLoop(track, false)
    ad?.addAnimation(track, name, length === 1 ? loop : false)
  },
  setTrackLoop: (track: number, loop: boolean) => {
    const ad = _uiAdapter()
    const list = animationStore.trackPlaylists[track]
    const live = animationStore.tracks.find(t => t.trackIndex === track)
    if (list?.length) {
      animationStore.setTrackListLoop(track, loop)
    } else if (live) {
      animationStore.setTrackPlaylist(track, [{ animationName: live.animationName, loop }])
    }
    const length = list?.length ?? 0
    if (length <= 1) { ad?.setTrackLoop(track, loop); return }
    if (loop || !ad || !live) return
    // drop a re-armed cycle: keep only the entries left until the end of the list
    const pos = playlistPosition(length, live.queue.length, false)
    for (let n = live.queue.length; n > length - 1 - pos; n--) ad.removeQueueEntry(track, n - 1)
  },
  removeQueueEntry: (track: number, index: number) => {
    const ad = _uiAdapter()
    const list = animationStore.trackPlaylists[track]
    const queued = animationStore.tracks.find(t => t.trackIndex === track)?.queue.length ?? 0
    // live-chain rows (no list, or a queue longer than it — same rule as the Anim tab) emit queue index + 1
    if (!list?.length || queued > list.length) {
      if (index < 1) return
      if (list && index < list.length) animationStore.removePlaylistEntry(track, index)
      ad?.removeQueueEntry(track, index - 1)
      return
    }
    const length = list.length
    const k = (index - playlistPosition(length, queued, false) - 1 + length) % length
    animationStore.removePlaylistEntry(track, index)
    if (k < queued) ad?.removeQueueEntry(track, k)
  },
  clearTrack: (track: number) => {
    animationStore.clearTrackPlaylist(track)
    _uiAdapter()?.clearTrack(track)
    if (Object.keys(animationStore.trackPlaylists).length === 0) {
      _uiAdapter()?.setToSetupPose()
      animationStore.stop()
    }
  },
  clearTracks: () => {
    animationStore.clearAllTrackPlaylists()
    _uiAdapter()?.clearTracks()
    _uiAdapter()?.setToSetupPose()
    animationStore.stop()
  },
  seekDelta: (track: number, delta: number) => {
    const entry = animationStore.tracks.find(t => t.trackIndex === track)
    const ad = _uiAdapter()
    if (!entry || !ad) return
    const base = entry.loop && entry.duration > 0 ? entry.time % entry.duration : entry.time
    const clamped = Math.max(0, Math.min(base + delta, entry.duration))
    ad.seekTo(track, clamped)
  },
  seekTo: (track: number, time: number) => {
    _uiAdapter()?.seekTo(track, time)
  },
  setSkins: (names: string[]) => {
    if (names.length === 0) return
    _uiAdapter()?.setSkins(names)
  },
  captureCurrentFrame,
  captureAnimFrames,
  getBoneTransformsSnapshot: () => _uiAdapter()?.getBoneTransforms() ?? [],
})
</script>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d0d0f;
  cursor: grab;
}

.stage--pan {
  cursor: grabbing;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.overlay-top-left {
  position: absolute;
  top: 10px;
  left: 12px;
  pointer-events: all;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.origin-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
}

.origin-toggle input {
  width: 11px;
  height: 11px;
  cursor: pointer;
  accent-color: #7c6af5;
  flex-shrink: 0;
}

.origin-label {
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}

.origin-label:hover { color: rgba(255,255,255,0.85); }

.bg-color-input {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.bg-color-input:hover { opacity: 1; }
.bg-color-input::-webkit-color-swatch-wrapper { padding: 0; }
.bg-color-input::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; }

.bg-color-label {
  color: rgba(255,255,255,0.45);
  font-size: inherit;
  user-select: none;
}

.ph-toggle {
  width: 12px;
  height: 12px;
  cursor: pointer;
  accent-color: #7c6af5;
}

.ph-label {
  color: rgba(255,255,255,0.45);
  font-size: inherit;
  user-select: none;
}

.ph-list {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 4px 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 180px;
  overflow-y: auto;
}

.ph-list-item {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 500;
}

.ph-list-item input[type='checkbox'] {
  width: 10px;
  height: 10px;
  cursor: pointer;
  accent-color: #7c6af5;
  flex-shrink: 0;
}

.ph-list-name {
  color: rgba(255, 255, 255, 0.65);
  user-select: none;
  white-space: nowrap;
}

.overlay-top-right {
  position: absolute;
  top: 10px;
  right: 12px;
  pointer-events: none;
}

/* ── Origin crosshair ── */
.origin-cross {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.origin-cross::before,
.origin-cross::after {
  content: '';
  position: absolute;
  background: rgba(255, 80, 80, 0.9);
  border-radius: 1px;
}

/* horizontal bar */
.origin-cross::before {
  width: 14px;
  height: 1.5px;
  top: -0.75px;
  left: -7px;
}

/* vertical bar */
.origin-cross::after {
  width: 1.5px;
  height: 14px;
  left: -0.75px;
  top: -7px;
}

/* ── Selected bone crosshair ── */
.bone-cross {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.bone-cross::before,
.bone-cross::after {
  content: '';
  position: absolute;
  background: rgba(74, 222, 128, 0.9);
  border-radius: 1px;
}

/* horizontal bar */
.bone-cross::before {
  width: 10px;
  height: 1.5px;
  top: -0.75px;
  left: -5px;
}

/* vertical bar */
.bone-cross::after {
  width: 1.5px;
  height: 10px;
  left: -0.75px;
  top: -5px;
}

.fps {
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.fps--good { color: #4ade80; }
.fps--ok   { color: #facc15; }
.fps--bad  { color: #f87171; }

.error-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(220, 50, 50, 0.15);
  border: 1px solid #dc3232;
  border-radius: 10px;
  padding: 14px 24px;
  color: #f87171;
  font-size: 0.875rem;
  max-width: 400px;
  text-align: center;
}

.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-text {
  font-size: 0.8rem;
  color: var(--c-text-muted);
}

/* ── Selected slot bounds ── */
.slot-bounds {
  position: absolute;
  pointer-events: none;
  border: 1.5px solid rgba(96, 165, 250, 0.85);
  border-radius: 1px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  background: rgba(96, 165, 250, 0.06);
}

</style>
