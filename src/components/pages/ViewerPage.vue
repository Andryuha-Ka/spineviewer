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
      <div class="toolbar-spacer" />
      <n-button
        size="small"
        :type="animationStore.isPlaying ? 'default' : 'primary'"
        :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
        class="toolbar-play-btn"
        @click="animationStore.isPlaying ? animationStore.pause() : animationStore.play()"
      >{{ animationStore.isPlaying ? '⏸' : (animationStore.isPaused ? '▶ Resume' : '▶ Play') }}</n-button>
      <SettingsPopover />
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
          <n-tab-pane name="events" tab="Events" class="tab-pane">
            <EventsPanel @seek="onSeekTo" />
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

      <div class="stage-area">
        <PreviewStage ref="stageRef" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PreviewStage from '@/components/stage/PreviewStage.vue'
import AnimationPanel from '@/components/panels/AnimationPanel.vue'
import SkeletonPanel from '@/components/panels/SkeletonPanel.vue'
import EventsPanel from '@/components/panels/EventsPanel.vue'
import AtlasInspector from '@/components/panels/AtlasInspector.vue'
import ProfilerPanel    from '@/components/panels/ProfilerPanel.vue'
import ComplexityPanel from '@/components/panels/ComplexityPanel.vue'
import ExportPanel from '@/components/panels/ExportPanel.vue'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import { useVersionStore } from '@/core/stores/useVersionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'
import { useExportStore } from '@/core/stores/useExportStore'
import { downloadBlob, downloadJson, canvasToBlob, buildSpriteSheet } from '@/core/utils/exportUtils'

const emit = defineEmits<{ back: [] }>()

const versionStore    = useVersionStore()
const skeletonStore   = useSkeletonStore()
const animationStore  = useAnimationStore()
const loaderStore     = useLoaderStore()
const exportStore     = useExportStore()
const stageRef      = ref<InstanceType<typeof PreviewStage> | null>(null)
const activeTab     = ref<'animation' | 'inspector' | 'events' | 'atlas' | 'perf' | 'compl' | 'export'>('animation')

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

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

function onClickBack() {
  if (!window.confirm('Reset viewer and return to version picker?')) return
  skeletonStore.clear()
  animationStore.reset()
  loaderStore.clear()
  exportStore.finish()
  emit('back')
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

function onSeekTo(track: number, time: number) {
  stageRef.value?.seekTo(track, time)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type GIFInstance = { addFrame: any; on: any; render: any; abort: any }
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
            workerScript: '/gif.worker.js',
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

.toolbar-play-btn { min-width: 80px; }

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
