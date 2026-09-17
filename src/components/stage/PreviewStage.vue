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
import type { PixiSpriteObject } from '@/core/types/PixiSpriteObject'
import type { IPixiApp } from '@/core/types/IPixiApp'
import type { IProgressOverlay } from '@/core/types/IProgressOverlay'
import type { TrackDisplayState, MarkerDisplay } from '@/core/types/IProgressOverlay'
import type { ISpineAdapter, AnimationEventMarker } from '@/core/types/ISpineAdapter'
import type { FileSet, PHSpineEntry } from '@/core/types/FileSet'
import { makeLoopState, computeNorm, resetLoopState } from '@/core/overlay/overlayMath'

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
let spineAdapter: ISpineAdapter | null = null
let spineObj: unknown = null
const mountedAdapters     = new Map<string, ISpineAdapter>()
const mountedSpineObjects = new Map<string, PixiSpriteObject>()

// Slot-transition guards
let _pendingChildSlotId: string | null = null
let _redirectedFromSlotId: string | null = null
let _suppressAnimPlay = false
let _pendingSeekTimes: Record<number, number> | null = null

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

function _uiAdapter(): ISpineAdapter | null { return children.activeChildAdapter.value ?? spineAdapter }

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
  () => spineAdapter,
  () => mountedAdapters,
  () => mountedSpineObjects,
  () => children.childAdapters,
  () => children.childAdapterMeta,
  () => children.activeChildAdapter.value,
  () => spineObj,
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
  if (!spineAdapter) return
  if (viewerStore.showPlaceholders && activePHItems.value.length > 0) {
    spineAdapter.setPlaceholderLabels(activePHItems.value)
  } else {
    spineAdapter.clearPlaceholderLabels()
  }
}

watch(() => viewerStore.showPlaceholders, applyPlaceholderLabels)
watch(() => viewerStore.disabledPlaceholders, applyPlaceholderLabels)

// ── Drain placeholder actions ──────────────────────────────────────────────────
// While a child spine is active, spineAdapter still belongs to its parent slot.
function adapterForSlot(slotId: string): ISpineAdapter | null {
  const active = slotSelectionStore.activeSlot
  if (slotId === active?.id || slotId === active?.parentSlotId) return spineAdapter
  return mountedAdapters.get(slotId) ?? null
}

function isChildMounted(childSlotId: string): boolean {
  for (const meta of children.childAdapterMeta.values()) {
    if (meta.childSlotId === childSlotId) return true
  }
  return false
}

async function drainPlaceholderActions() {
  if (!spineAdapter) return
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
      if (action.slotId !== slotSelectionStore.activeSlotId) continue
      if (action.type === 'add') {
        spineAdapter.addImageToPlaceholder(action.phName, action.dataURL!, action.imageId!)
        const ctx = placeholderImagesStore.getChildContext(action.imageId!)
        if (ctx && (ctx.entry.posX !== 0 || ctx.entry.posY !== 0 || ctx.entry.scale !== 1)) {
          spineAdapter.setImageTransform(action.imageId!, ctx.entry.posX, ctx.entry.posY, ctx.entry.scale)
        }
      } else if (action.type === 'remove') {
        spineAdapter.removeImageFromPlaceholder(action.phName, action.imageId!)
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
      if (spineAdapter) {
        spineAdapter.tickPlaceholderLabels()
        const uiAd = _uiAdapter()!
        const states = uiAd.getTrackStates()
        animationStore.setTracks(states)

        for (const state of states) {
          if (!animationStore.isTrackEnabled(state.trackIndex) && state.timeScale !== 0) {
            uiAd.setTrackTimeScale(state.trackIndex, 0)
          }
        }

        if (animationStore.isPlaying && states.length > 0) {
          const hasLoop  = states.some(t => t.loop)
          const hasQueue = states.some(t => t.queue.length > 0)
          if (!hasLoop && !hasQueue && states.every(t => t.duration > 0 && t.time >= t.duration - 0.02)) {
            animationStore.stop()
          }
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
        if (!spineAdapter) return
        const next = new Map<number, AnimationEventMarker[]>()
        const flat: typeof eventsStore.animationMarkers[0][] = []
        for (const track of animationStore.tracks) {
          const markers = spineAdapter.getAnimationEvents(track.animationName)
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
        if (_suppressAnimPlay) return
        const uiAd = _uiAdapter()
        if (!uiAd) return
        if (playing) {
          if (!animationStore.isPaused) {
            loopSM.dcRaw.fill(null)
            loopSM.lastDcNormPos = -1
            for (const [idxStr, playlist] of Object.entries(animationStore.trackPlaylists)) {
              const trackIndex = Number(idxStr)
              if (!animationStore.isTrackEnabled(trackIndex) || playlist.length === 0) continue
              uiAd.setAnimation(trackIndex, playlist[0].animationName, playlist[0].loop)
              for (let i = 1; i < playlist.length; i++) {
                uiAd.addAnimation(trackIndex, playlist[i].animationName, playlist[i].loop)
              }
            }
            if (_pendingSeekTimes) {
              for (const [idxStr, time] of Object.entries(_pendingSeekTimes)) {
                uiAd.seekTo(Number(idxStr), time)
              }
              _pendingSeekTimes = null
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

    watchStage(
      () => animationStore.loop,
      (newLoop) => {
        const uiAd = _uiAdapter()
        if (!uiAd) return
        for (const track of animationStore.tracks) {
          uiAd.setTrackLoop(track.trackIndex, newLoop)
        }
        for (const idxStr of Object.keys(animationStore.trackPlaylists)) {
          animationStore.updateTrackPlaylistFirstLoop(Number(idxStr), newLoop)
        }
      },
    )

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

          if (!children.activeChildAdapter.value && spineAdapter && effectiveOldId) {
            const parentTrackStates = spineAdapter.getTrackStates()
            const parentTrackTimes: Record<number, number> = {}
            for (const ts of parentTrackStates) parentTrackTimes[ts.trackIndex] = ts.time
            const leavingParentSlot = fileLoaderStore.spineSlots.find(s => s.id === effectiveOldId)
            fileLoaderStore.saveSlotState(effectiveOldId, {
              speed:               animationStore.speed,
              selectedAnimation:   animationStore.selectedAnimation,
              currentTrack:        animationStore.currentTrack,
              loop:                animationStore.loop,
              trackEnabled:        { ...animationStore.trackEnabled },
              trackPlaylists:      JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
              wasPlaying:          animationStore.isPlaying,
              trackTimes:          parentTrackTimes,
              selectedSkins:       [...skeletonStore.activeSkins],
              showPlaceholders:    viewerStore.showPlaceholders,
              disabledPlaceholders:[...viewerStore.disabledPlaceholders],
              syncEnabled:         leavingParentSlot?.syncEnabled ?? true,
              indPosX:             leavingParentSlot?.indPosX ?? 0,
              indPosY:             leavingParentSlot?.indPosY ?? 0,
              indZoom:             leavingParentSlot?.indZoom ?? 1,
              placeholderChildren: placeholderImagesStore.getSlotImages(effectiveOldId),
            })
            if (effectiveOldId !== newSlot.parentSlotId) {
              if (slotSelectionStore.isPinned(effectiveOldId)) {
                mountedAdapters.set(effectiveOldId, spineAdapter)
                if (spineObj) mountedSpineObjects.set(effectiveOldId, spineObj as PixiSpriteObject)
              } else {
                children.destroyChildAdaptersForSlot(effectiveOldId)
                spineAdapter.destroy()
                mountedAdapters.delete(effectiveOldId)
                mountedSpineObjects.delete(effectiveOldId)
              }
              spineAdapter = null
              spineObj = null
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

          const liveChildStates = childAdapterRef.getTrackStates()
          const liveChildPlaylists: Record<number, Array<{ animationName: string; loop: boolean }>> = {}
          for (const ts of liveChildStates) {
            liveChildPlaylists[ts.trackIndex] = [{ animationName: ts.animationName, loop: ts.loop }, ...ts.queue]
          }
          const childSs = newSlot.savedState
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
            if (parentSs && spineAdapter) {
              const liveStates = spineAdapter.getTrackStates()
              const trackTimes: Record<number, number> = {}
              for (const ts of liveStates) trackTimes[ts.trackIndex] = ts.time
              fileLoaderStore.saveSlotState(effectiveOldId, {
                ...parentSs,
                trackTimes,
                placeholderChildren: placeholderImagesStore.getSlotImages(effectiveOldId),
              })
            }
          } else {
            const leavingSlot = fileLoaderStore.spineSlots.find(s => s.id === effectiveOldId)
            const leavingTrackStates = spineAdapter?.getTrackStates() ?? []
            const trackTimes: Record<number, number> = {}
            for (const ts of leavingTrackStates) trackTimes[ts.trackIndex] = ts.time
            fileLoaderStore.saveSlotState(effectiveOldId, {
              speed:              animationStore.speed,
              selectedAnimation:  animationStore.selectedAnimation,
              currentTrack:       animationStore.currentTrack,
              loop:               animationStore.loop,
              trackEnabled:       { ...animationStore.trackEnabled },
              trackPlaylists:       JSON.parse(JSON.stringify(animationStore.trackPlaylists)),
              wasPlaying:           animationStore.isPlaying,
              trackTimes,
              selectedSkins:        [...skeletonStore.activeSkins],
              showPlaceholders:     viewerStore.showPlaceholders,
              disabledPlaceholders: [...viewerStore.disabledPlaceholders],
              syncEnabled:          leavingSlot?.syncEnabled ?? true,
              indPosX:              leavingSlot?.indPosX ?? 0,
              indPosY:              leavingSlot?.indPosY ?? 0,
              indZoom:              leavingSlot?.indZoom ?? 1,
              placeholderChildren:  placeholderImagesStore.getSlotImages(effectiveOldId),
            })
          }
        }

        // Step 2: Park or destroy old adapter
        if (effectiveOldId && spineAdapter) {
          for (const action of placeholderImagesStore.peekActions()) {
            if (action.type === 'move-child' && action.kind === 'image' && action.slotId === effectiveOldId && action.imageId) {
              spineAdapter.removeImageFromPlaceholder(action.phName, action.imageId)
            }
          }
        }
        if (effectiveOldId && spineAdapter) {
          if (slotSelectionStore.isPinned(effectiveOldId) || effectiveOldId === newId) {
            mountedAdapters.set(effectiveOldId, spineAdapter)
            if (spineObj) mountedSpineObjects.set(effectiveOldId, spineObj as PixiSpriteObject)
          } else {
            children.destroyChildAdaptersForSlot(effectiveOldId)
            spineAdapter.destroy()
            mountedAdapters.delete(effectiveOldId)
            mountedSpineObjects.delete(effectiveOldId)
          }
          spineAdapter = null
          spineObj = null
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
            if (playlist.length === 0) continue
            if (!animationStore.isTrackEnabled(trackIndex)) continue
            spineAdapter?.setAnimation(trackIndex, playlist[0].animationName, playlist[0].loop)
            for (let i = 1; i < playlist.length; i++) {
              spineAdapter?.addAnimation(trackIndex, playlist[i].animationName, playlist[i].loop)
            }
          }
          if (s.wasPlaying) {
            if (s.trackTimes && Object.keys(s.trackTimes).length > 0) {
              _pendingSeekTimes = { ...s.trackTimes }
            }
            animationStore.isPaused = false
            animationStore.play()
          } else if (s.trackTimes) {
            for (const [idxStr, time] of Object.entries(s.trackTimes)) {
              spineAdapter?.seekTo(Number(idxStr), time)
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
          const _restoredChildren = s.placeholderChildren ?? s.placeholderImages
          if (_restoredChildren) {
            placeholderImagesStore.setSlotImages(slot.id, _restoredChildren)
            for (const [phName, entries] of Object.entries(_restoredChildren)) {
              for (const entry of entries) {
                if (entry.kind !== 'image') continue
                spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
              }
            }
          } else {
            placeholderImagesStore.clearSlotImages(slot.id)
          }
        }

        // Step 5a: Reuse pinned adapter
        if (mountedAdapters.has(newId)) {
          loading.value = true
          try {
            spineAdapter = mountedAdapters.get(newId)!
            spineObj = mountedSpineObjects.get(newId) ?? null
            spineLoaded.value = true

            skeletonStore.attachAdapter(spineAdapter)
            skeletonStore.populate({
              animations: spineAdapter.animations,
              skins:      spineAdapter.skins,
              bones:      spineAdapter.bones,
              slots:      spineAdapter.slots,
              events:     spineAdapter.events,
              freeBones:  spineAdapter.getFreeBones(),
            })
            spineAdapter.onEvent(e => eventsStore.push(e))
            if (typeof slot.fileSet.atlas.fileBody === 'string') {
              atlasStore.load(slot.fileSet.atlas.fileBody, slot.fileSet.images)
            }
            complexityStore.analyze(spineAdapter, slot.fileSet, atlasStore.pages)

            const PH_RE_5A = /placeholder/i
            const phSlots5A = new Set(spineAdapter.slots.filter(s => PH_RE_5A.test(s.name)).map(s => s.name))
            phItems.value = [
              ...[...phSlots5A].map(name => ({ name, kind: 'slot' as const })),
              ...spineAdapter.bones
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
              const liveStates = spineAdapter.getTrackStates()
              const livePlaylists: Record<number, Array<{ animationName: string; loop: boolean }>> = {}
              for (const ts of liveStates) {
                livePlaylists[ts.trackIndex] = [
                  { animationName: ts.animationName, loop: ts.loop },
                  ...ts.queue,
                ]
              }
              const ss = slot.savedState
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
              spineAdapter?.setTimeScale((ss?.wasPlaying ?? true) ? (ss?.speed ?? 1) : 0)
            }
            applySkins()
            applyPlaceholderLabels()
            const ss5a = slot.savedState
            const _ss5aChildren = ss5a?.placeholderChildren ?? ss5a?.placeholderImages
            if (_ss5aChildren) {
              placeholderImagesStore.setSlotImages(newId, _ss5aChildren)
              for (const [phName, entries] of Object.entries(_ss5aChildren)) {
                for (const entry of entries) {
                  if (entry.kind !== 'image') continue
                  spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                  spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
                }
              }
            }
            drainPlaceholderActions()
            if (spineAdapter) await children.reloadChildAdaptersForSlot(spineAdapter, newId)
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
          if (!slot.savedState) {
            const liveImages = placeholderImagesStore.getSlotImages(newId)
            for (const [phName, entries] of Object.entries(liveImages)) {
              for (const entry of entries) {
                if (entry.kind !== 'image') continue
                spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
              }
            }
          }
          applySkins()
          applyPlaceholderLabels()
          drainPlaceholderActions()
          if (spineAdapter) await children.reloadChildAdaptersForSlot(spineAdapter, newId)
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
        if (!pixiApp) return
        const _activeParentSlotId = slotSelectionStore.activeSlot?.parentSlotId ?? null
        for (const [slotId, adapter] of [...mountedAdapters.entries()]) {
          if (slotId === slotSelectionStore.activeSlotId) continue
          if (slotId === _activeParentSlotId) continue
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
              for (const [idxStr, playlist] of Object.entries(ss.trackPlaylists)) {
                const trackIdx = Number(idxStr)
                if (playlist.length > 0) {
                  adapter.setAnimation(trackIdx, playlist[0].animationName, playlist[0].loop)
                  for (let i = 1; i < playlist.length; i++) {
                    adapter.addAnimation(trackIdx, playlist[i].animationName, playlist[i].loop)
                  }
                }
              }
              adapter.setTimeScale(ss.wasPlaying ? ss.speed : 0)
              if (ss.selectedSkins?.length) adapter.setSkins(ss.selectedSkins)
              const _pinnedChildren = ss.placeholderChildren ?? ss.placeholderImages
              if (_pinnedChildren) {
                const liveChildren = placeholderImagesStore.getSlotImages(slotId)
                const hasLiveData = Object.keys(liveChildren).length > 0
                const sourceForImages = hasLiveData ? liveChildren : _pinnedChildren
                if (!hasLiveData) {
                  placeholderImagesStore.setSlotImages(slotId, _pinnedChildren)
                }
                for (const [phName, entries] of Object.entries(sourceForImages)) {
                  for (const entry of entries) {
                    if (entry.kind !== 'image') continue
                    adapter.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
                    adapter.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
                  }
                }
              }
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

    watchStage(
      () => fileLoaderStore.spineSlots.map(s => s.id),
      () => syncZOrder(),
      { deep: false },
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
  spineObj = null
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
  spineAdapter = null
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

  if (spineAdapter) {
    const oldSlotId = [...mountedAdapters.entries()].find(([, a]) => a === spineAdapter)?.[0]
    if (oldSlotId) {
      mountedAdapters.delete(oldSlotId)
      mountedSpineObjects.delete(oldSlotId)
    }
    spineAdapter.destroy()
    spineAdapter = null
    spineObj = null
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
    spineAdapter = await createSpineAdapter(
      versionStore.pixiVersion!,
      versionStore.spineVersion!,
    )
    await spineAdapter.load(fileSet)

    const container = containerRef.value!
    const { width, height } = container.getBoundingClientRect()

    spineAdapter.mount(pixiApp.stage)
    spineAdapter.setTimeScale(animationStore.isPlaying ? animationStore.speed : 0)

    spineObj = pixiApp.getLastStageChild()
    baseX.value = width / 2
    baseY.value = height * 0.5
    spineLoaded.value = true
    if (resetViewport) viewerStore.resetView()

    if (slotId) {
      mountedAdapters.set(slotId, spineAdapter)
      if (spineObj) mountedSpineObjects.set(slotId, spineObj as PixiSpriteObject)
    }

    applyViewport()
    syncZOrder()

    skeletonStore.attachAdapter(spineAdapter)
    skeletonStore.populate({
      animations: spineAdapter.animations,
      skins:      spineAdapter.skins,
      bones:      spineAdapter.bones,
      slots:      spineAdapter.slots,
      events:     spineAdapter.events,
      freeBones:  spineAdapter.getFreeBones(),
    })

    const PH_RE = /placeholder/i
    const phSlotNames = new Set(spineAdapter.slots.filter(s => PH_RE.test(s.name)).map(s => s.name))
    phItems.value = [
      ...[...phSlotNames].map(name => ({ name, kind: 'slot' as const })),
      ...spineAdapter.bones
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
      spineAdapter.setPlaceholderLabels(phItems.value)
    }

    spineAdapter.onEvent(e => eventsStore.push(e))

    if (typeof fileSet.atlas.fileBody === 'string') {
      atlasStore.load(fileSet.atlas.fileBody, fileSet.images)
    }
    complexityStore.analyze(spineAdapter, fileSet, atlasStore.pages)
  } catch (e) {
    spineError.value = e instanceof Error ? e.message : 'Failed to load Spine'
    console.error('[PreviewStage] loadSpine error:', e)
  } finally {
    loading.value = false
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────

async function captureCurrentFrame(): Promise<HTMLCanvasElement | null> {
  if (!pixiApp) return null
  return pixiApp.extractFrame()
}

async function captureAnimFrames(
  track: number,
  frameCount: number,
  onFrame: (canvas: HTMLCanvasElement, index: number, total: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!pixiApp || !spineAdapter) return false
  const entry = animationStore.tracks.find(t => t.trackIndex === track)
  if (!entry || entry.duration <= 0) return false

  const wasPlaying = animationStore.isPlaying
  spineAdapter.setTimeScale(0)
  const duration = entry.duration

  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) return false
      const t = frameCount === 1 ? 0 : (i / (frameCount - 1)) * duration
      spineAdapter.seekTo(track, t)
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      if (signal?.aborted) return false
      const frame = await pixiApp!.extractFrame()
      onFrame(frame, i, frameCount)
    }
  } finally {
    if (wasPlaying) {
      spineAdapter.setTimeScale(animationStore.speed)
    }
    spineAdapter.seekTo(track, 0)
  }

  return true
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
    _uiAdapter()?.addAnimation(track, name, loop)
  },
  setTrackLoop: (track: number, loop: boolean) => {
    _uiAdapter()?.setTrackLoop(track, loop)
    if (animationStore.trackPlaylists[track]?.length) {
      animationStore.updateTrackPlaylistFirstLoop(track, loop)
    } else {
      const liveTrack = animationStore.tracks.find(t => t.trackIndex === track)
      if (liveTrack) {
        animationStore.setTrackPlaylist(track, [{ animationName: liveTrack.animationName, loop }])
      }
    }
  },
  removeQueueEntry: (track: number, index: number) => {
    animationStore.removeFromTrackPlaylist(track, index + 1)
    _uiAdapter()?.removeQueueEntry(track, index)
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
