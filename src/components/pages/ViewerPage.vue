<!--
 * @file ViewerPage.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="viewer">
    <header class="toolbar">
      <button class="back-btn" @click="onClickBack">← Back</button>
      <span class="version-tag">
        Pixi {{ versionStore.pixiVersion }} · Spine {{ versionStore.spineVersion }}
      </span>
      <span v-if="loaderStore.activeSlot?.fileSet" class="spine-name-tag" :class="`spine-name-tag--${loaderStore.activeSlot.fileSet.skeleton.type}`">
        <span
          class="spine-type-badge"
          :class="`spine-type-badge--${loaderStore.activeSlot.fileSet.skeleton.type}`"
        >{{ loaderStore.activeSlot.fileSet.skeleton.type === 'skeleton-json' ? 'JSON' : 'SKEL' }}</span>
        {{ loaderStore.activeSlot.fileSet.skeleton.filename }}
      </span>
      <div class="toolbar-spacer" />
      <n-button
        size="small"
        :type="animationStore.isPlaying ? 'default' : 'primary'"
        :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
        class="toolbar-play-btn"
        @click="animationStore.isPlaying ? animationStore.pause() : animationStore.play()"
      >{{ animationStore.isPlaying ? '⏸' : (animationStore.isPaused ? '▶ Resume' : '▶ Play') }}</n-button>
      <n-button
        size="small"
        class="compare-toolbar-btn"
        @click="emit('open-compare', { left: loaderStore.spineSlots.findIndex(s => s.id === loaderStore.activeSlotId) })"
        title="Open Compare mode"
      >⇄ Compare</n-button>
      <SettingsPopover />
      <HelpModal />
    </header>

    <div class="content">
      <aside class="side-panel" :style="{ width: panelWidth + 'px' }">
        <n-tabs
          v-model:value="activeTab"
          type="line"
          size="small"
          :tabs-padding="8"
          class="side-tabs"
        >
          <n-tab-pane name="spines" tab="Spines" class="tab-pane">
            <SpinesPanel />
          </n-tab-pane>
          <n-tab-pane name="animation" tab="Anim" class="tab-pane">
            <AnimationPanel
              @set-animation="onSetAnimation"
              @add-animation="onAddAnimation"
              @set-track-loop="onSetTrackLoop"
              @remove-queue-entry="onRemoveQueueEntry"
              @clear-track="onClearTrack"
              @clear-tracks="onClearTracks"
              @seek-delta="onSeekDelta"
              @set-skins="onSetSkins"
            />
          </n-tab-pane>
          <n-tab-pane name="inspector" tab="Insp" class="tab-pane">
            <SkeletonPanel />
          </n-tab-pane>
          <n-tab-pane v-if="skeletonStore.freeBones.length > 0" name="bones" tab="Bones" class="tab-pane">
            <FreeBonePanel />
          </n-tab-pane>
          <n-tab-pane name="atlas" tab="Atlas" class="tab-pane">
            <AtlasInspector />
          </n-tab-pane>
          <n-tab-pane name="perf" tab="Perf" class="tab-pane">
            <ProfilerPanel />
          </n-tab-pane>
          <n-tab-pane name="compl" tab="Compl" class="tab-pane">
            <ComplexityPanel />
          </n-tab-pane>
          <n-tab-pane name="export" tab="Export" class="tab-pane">
            <ExportPanel
              @capture-png="onCapturePng"
              @capture-pose="onCapturePose"
              @capture-sheet="onCaptureSheet"
              @capture-gif="onCaptureGif"
              @cancel-export="onCancelExport"
            />
          </n-tab-pane>
        </n-tabs>
      </aside>

      <div
        class="resize-handle"
        @mousedown.prevent="onResizeStart"
      />

      <div
        class="stage-area"
        @dragover.prevent
        @drop.prevent="onCanvasDrop"
      >
        <PreviewStage ref="stageRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PreviewStage from '@/components/stage/PreviewStage.vue'
import AnimationPanel from '@/components/panels/AnimationPanel.vue'
import SkeletonPanel from '@/components/panels/SkeletonPanel.vue'
import FreeBonePanel from '@/components/panels/FreeBonePanel.vue'
import SpinesPanel from '@/components/panels/SpinesPanel.vue'
import AtlasInspector from '@/components/panels/AtlasInspector.vue'
import ProfilerPanel    from '@/components/panels/ProfilerPanel.vue'
import ComplexityPanel from '@/components/panels/ComplexityPanel.vue'
import ExportPanel from '@/components/panels/ExportPanel.vue'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import HelpModal from '@/components/ui/HelpModal.vue'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { useExportStore } from '@/core/stores/useExportStore'
import { useBackgroundStore } from '@/core/stores/useBackgroundStore'
import { groupSpineFiles, readFileAsDataURL } from '@/core/utils/fileLoader'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import { downloadBlob, downloadJson, canvasToBlob, buildSpriteSheet } from '@/core/utils/exportUtils'

const emit = defineEmits<{
  back:           []
  'open-compare': [payload?: { left?: number }]
}>()

const versionStore     = useVersionStore()
const skeletonStore    = useSkeletonStore()
const animationStore   = useAnimationStore()
const loaderStore      = useLoaderStore()
const exportStore      = useExportStore()
const backgroundStore  = useBackgroundStore()
const stageRef         = ref<InstanceType<typeof PreviewStage> | null>(null)
const activeTab        = ref<'spines' | 'animation' | 'inspector' | 'bones' | 'atlas' | 'perf' | 'compl' | 'export'>('animation')

// Auto-switch to Spines tab when background is first loaded
watch(
  () => backgroundStore.isLoaded,
  (loaded) => { if (loaded) activeTab.value = 'spines' },
)

// Auto-pin active slot when it gets its first animation track and globalPinEnabled is on.
// Lives here (not SpinesPanel) so it stays active even when Spines tab is not open.
watch(() => animationStore.tracks.length, (newLen, oldLen) => {
  if (oldLen === 0 && newLen > 0 && loaderStore.globalPinEnabled) {
    const id = loaderStore.activeSlotId
    if (id) loaderStore.setPinned(id, true)
  }
})

// ── Resizable side panel ──────────────────────────────────────────────────────
const PANEL_MIN = 180
const PANEL_MAX = 520
const panelWidth = ref(
  Math.min(PANEL_MAX, Math.max(PANEL_MIN, parseInt(localStorage.getItem('svp:panelWidth') ?? '380')))
)

function onResizeStart(e: MouseEvent) {
  const startX = e.clientX
  const startW = panelWidth.value

  const onMove = (ev: MouseEvent) => {
    panelWidth.value = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + ev.clientX - startX))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    localStorage.setItem('svp:panelWidth', String(panelWidth.value))
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  // isComposing=true means an IME/dead-key sequence is in progress — ignore to avoid
  // misfires when switching to a non-Latin keyboard layout (e.g. Ukrainian/CJK)
  if (e.isComposing || e.keyCode === 229) return

  // Space on focused interactive controls (checkbox, switch, button) would toggle them
  // in addition to firing our shortcut. Stop propagation here (capture phase) so the
  // control never receives the Space event — our handler takes over instead.
  if (e.code === 'Space') {
    const role = (e.target as HTMLElement).getAttribute?.('role') ?? ''
    if (role === 'checkbox' || role === 'switch' || role === 'button') {
      e.stopPropagation()
    }
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault()
      animationStore.isPlaying ? animationStore.pause() : animationStore.play()
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (animationStore.isPlaying) animationStore.pause()
      stageRef.value?.seekDelta(animationStore.currentTrack, -1 / 30)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (animationStore.isPlaying) animationStore.pause()
      stageRef.value?.seekDelta(animationStore.currentTrack, 1 / 30)
      break
    case 'KeyR':
      stageRef.value?.clearTracks()
      break
    case 'KeyL': {
      const targets = e.shiftKey
        ? animationStore.tracks
        : animationStore.tracks.filter(t => t.trackIndex === animationStore.currentTrack)
      for (const t of targets) {
        stageRef.value?.setTrackLoop(t.trackIndex, !t.loop)
      }
      break
    }
    default:
      if (/^Digit[0-9]$/.test(e.code)) {
        animationStore.currentTrack = Number(e.code.replace('Digit', ''))
      }
  }
}

// Block Space keyup on interactive controls (NaiveUI handles toggle on keyup,
// so keydown stopPropagation alone is not enough).
function onKeyUpCapture(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const role = (e.target as HTMLElement).getAttribute?.('role') ?? ''
  if (role === 'checkbox' || role === 'switch' || role === 'button') {
    e.stopPropagation()
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUpCapture, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUpCapture, true)
})

function onClickBack() {
  if (!window.confirm('Reset viewer and return to version picker?')) return
  skeletonStore.clear()
  animationStore.reset()
  loaderStore.clear()
  exportStore.finish()
  backgroundStore.clearAll()
  emit('back')
}

async function onCanvasDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length === 0) return

  const imageExts = /\.(png|jpe?g|webp|gif|avif)$/i
  const spineExts = /\.(json|skel|atlas)$/i
  const hasImages = files.some(f => imageExts.test(f.name))
  const hasSpine  = files.some(f => spineExts.test(f.name))

  if (!hasSpine && hasImages) {
    const imgFile = files.find(f => imageExts.test(f.name))!
    const dataUrl = await readFileAsDataURL(imgFile)
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>(r => { img.onload = () => r() })
    if (backgroundStore.isLoaded) {
      const ok = window.confirm('Replace current background image?')
      if (!ok) return
    }
    backgroundStore.set({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
    backgroundStore.setListIndex(loaderStore.spineSlots.length)
    return
  }

  if (hasSpine) {
    const result = await groupSpineFiles(files)
    if (result.globalError) {
      window.alert(result.globalError)
      return
    }
    for (const slot of result.slots) {
      if (!slot.error && slot.fileSet) {
        const errs = validateSpineFileSet(slot.fileSet)
        if (errs.length > 0) slot.validationErrors = errs
      }
      loaderStore.addSlot(slot)
    }
  }
}

function onSetAnimation(track: number, name: string, loop: boolean) {
  stageRef.value?.setAnimation(track, name, loop)
}

function onAddAnimation(track: number, name: string, loop: boolean) {
  stageRef.value?.addAnimation(track, name, loop)
}

function onSetTrackLoop(track: number, loop: boolean) {
  stageRef.value?.setTrackLoop(track, loop)
}

function onRemoveQueueEntry(track: number, index: number) {
  stageRef.value?.removeQueueEntry(track, index)
}

function onClearTrack(track: number) {
  stageRef.value?.clearTrack(track)
}

function onClearTracks() {
  stageRef.value?.clearTracks()
}

function onSeekDelta(track: number, delta: number) {
  stageRef.value?.seekDelta(track, delta)
}

function onSetSkins(names: string[]) {
  stageRef.value?.setSkins(names)
}

// ── Export handlers ──────────────────────────────────────────────────────────

async function onCapturePng() {
  if (!stageRef.value) return
  exportStore.start('png')
  try {
    const canvas = await stageRef.value.captureCurrentFrame()
    if (!canvas) return
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, 'spine-frame.png')
  } catch (e) {
    exportStore.fail(e instanceof Error ? e.message : 'Failed to capture PNG')
    return
  }
  exportStore.finish()
}

async function onCapturePose() {
  if (!stageRef.value) return
  exportStore.start('pose')
  try {
    const bones = stageRef.value.getBoneTransformsSnapshot()
    downloadJson({ bones, timestamp: Date.now() }, 'spine-pose.json')
  } catch (e) {
    exportStore.fail(e instanceof Error ? e.message : 'Failed to export pose')
    return
  }
  exportStore.finish()
}

function onCancelExport() {
  exportStore.cancel()
}

async function onCaptureSheet(opts: { track: number; frameCount: number; cols: number }) {
  if (!stageRef.value) return
  const signal = exportStore.start('sheet')
  try {
    const frames: HTMLCanvasElement[] = []
    const ok = await stageRef.value.captureAnimFrames(
      opts.track,
      opts.frameCount,
      (canvas, i, total) => {
        frames.push(canvas)
        exportStore.setProgress(((i + 1) / total) * 100)
      },
      signal,
    )
    if (!ok || signal.aborted) { exportStore.finish(); return }
    const sheet = await buildSpriteSheet(frames, opts.cols)
    const blob  = await canvasToBlob(sheet)
    downloadBlob(blob, 'spine-sheet.png')
  } catch (e) {
    exportStore.fail(e instanceof Error ? e.message : 'Failed to build sprite sheet')
    return
  }
  exportStore.finish()
}

async function onCaptureGif(opts: { track: number; fps: number; quality: number }) {
  if (!stageRef.value) return
  const signal = exportStore.start('gif')
  try {
    const entry = animationStore.tracks.find(t => t.trackIndex === opts.track)
    if (!entry || entry.duration <= 0) { exportStore.finish(); return }

    const frameCount = Math.max(2, Math.round(entry.duration * opts.fps))
    const frameDelay = Math.round(1000 / opts.fps)

    interface GIFInstance {
      addFrame(canvas: HTMLCanvasElement, options?: { delay?: number; copy?: boolean }): void
      on(event: 'finished', cb: (blob: Blob) => void): void
      on(event: 'progress', cb: (pct: number) => void): void
      on(event: 'abort', cb: () => void): void
      render(): void
      abort(): void
    }
    const GIF = (await import('gif.js')).default

    // Size is unknown until first frame — create GIF lazily
    let gif: GIFInstance | null = null

    const ok = await stageRef.value.captureAnimFrames(
      opts.track,
      frameCount,
      (canvas, i, total) => {
        if (!gif) {
          gif = new GIF({
            workers:      2,
            quality:      opts.quality,
            workerScript: `${import.meta.env.BASE_URL}gif.worker.js`,
            width:        canvas.width,
            height:       canvas.height,
            repeat:       0,
          })
        }
        // copy:true so gif.js reads pixels now — canvas can be reused/GC'd
        gif.addFrame(canvas, { delay: frameDelay, copy: true })
        exportStore.setProgress(Math.round(((i + 1) / total) * 70))
      },
      signal,
    )

    // render() not called yet — just discard gif object and exit
    if (!ok || signal.aborted || !gif) { exportStore.finish(); return }

    await new Promise<void>((resolve) => {
      gif!.on('progress', (p: number) => exportStore.setProgress(70 + Math.round(p * 30)))
      gif!.on('finished', (blob: Blob) => { downloadBlob(blob, 'spine-animation.gif'); resolve() })
      gif!.on('abort',    () => resolve()) // aborted by user — resolve cleanly
      signal.addEventListener('abort', () => gif!.abort())
      gif!.render()
    })
  } catch (e) {
    exportStore.fail(e instanceof Error ? e.message : 'Failed to encode GIF')
    return
  }
  exportStore.finish()
}
</script>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--c-bg);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.toolbar-spacer { flex: 1; }

.toolbar-play-btn    { min-width: 80px; }
.compare-toolbar-btn { flex-shrink: 0; }

.back-btn {
  background: none;
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.back-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}

.version-tag {
  font-size: 0.75rem;
  color: var(--c-text-faint);
}

.spine-name-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.spine-name-tag--skeleton-json { color: #60a5fa; }
.spine-name-tag--skeleton-skel { color: #93c5fd; }

:global(html.theme-light .spine-name-tag--skeleton-json) { color: #1d4ed8; }
:global(html.theme-light .spine-name-tag--skeleton-skel) { color: #2563eb; }

.spine-type-badge {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 3px;
  min-width: 34px;
  text-align: center;
}

.spine-type-badge--skeleton-json { background: #1e3a5f; color: #60a5fa; }
.spine-type-badge--skeleton-skel { background: #1e3a5f; color: #93c5fd; }

.content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.side-panel {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  width: 4px;
  flex-shrink: 0;
  background: var(--c-border-dim);
  cursor: col-resize;
  transition: background 0.15s;
}

.resize-handle:hover,
.resize-handle:active {
  background: #7c6af5;
}

.stage-area {
  flex: 1;
  min-width: 0;
}

/* ── NTabs full-height layout ─────────────── */
.side-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.side-tabs .n-tabs-nav) {
  flex-shrink: 0;
}

/* Compact tab labels — reduce horizontal padding */
:deep(.side-tabs .n-tabs-tab) {
  padding: 0 8px;
}

:deep(.side-tabs .n-tabs-tab-pad) {
  width: 4px !important;
}

:deep(.side-tabs .n-tab-pane) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

:deep(.side-tabs .n-tabs-pane-wrapper) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
