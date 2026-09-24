/**
 * @file useExportHandlers.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { Ref } from 'vue'
import { useExportStore } from '@/core/stores/useExportStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { downloadBlob, downloadJson, canvasToBlob, buildSpriteSheet, withBackground } from '@/core/utils/exportUtils'
import type PreviewStage from '@/components/stage/PreviewStage.vue'

interface GIFInstance {
  addFrame(canvas: HTMLCanvasElement, options?: { delay?: number; copy?: boolean }): void
  on(event: 'finished', cb: (blob: Blob) => void): void
  on(event: 'progress', cb: (pct: number) => void): void
  on(event: 'abort', cb: () => void): void
  render(): void
  abort(): void
}

export function useExportHandlers(
  stageRef: Ref<InstanceType<typeof PreviewStage> | null>
): {
  onCapturePng:   () => Promise<void>
  onCapturePose:  () => Promise<void>
  onCaptureSheet: (opts: { track: number; frameCount: number; cols: number }) => Promise<void>
  onCaptureGif:   (opts: { track: number; fps: number; quality: number }) => Promise<void>
  onCancelExport: () => void
} {
  const exportStore    = useExportStore()
  const animationStore = useAnimationStore()
  const viewerStore    = useViewerStore()

  function noteScale(used: number, limit: 'gpu' | 'memory' | null) {
    if (limit && used < exportStore.scale) exportStore.notice = `Scale reduced to ${used}× (${limit === 'gpu' ? 'GPU' : 'memory'} limit)`
  }
  const fill = (canvas: HTMLCanvasElement, always = false) =>
    always || exportStore.includeBackground ? withBackground(canvas, viewerStore.bgColor) : canvas

  async function onCapturePng() {
    if (!stageRef.value) return
    exportStore.start('png')
    try {
      const frame = await stageRef.value.captureCurrentFrame({ scale: exportStore.scale })
      if (!frame) { exportStore.fail('Nothing to capture'); return }
      noteScale(frame.scale, 'gpu')
      const blob = await canvasToBlob(fill(frame.canvas))
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
      const res = await stageRef.value.captureAnimFrames(
        opts.track,
        opts.frameCount,
        (canvas, i, total) => {
          frames.push(fill(canvas))
          exportStore.setProgress(((i + 1) / total) * 100)
        },
        signal,
        { scale: exportStore.scale },
      )
      if (!res || signal.aborted) { exportStore.finish(); return }
      noteScale(res.scale, res.limit)
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

      const GIF = (await import('gif.js')).default

      // Size is unknown until first frame — create GIF lazily
      let gif: GIFInstance | null = null

      const res = await stageRef.value.captureAnimFrames(
        opts.track,
        frameCount,
        (raw, i, total) => {
          const canvas = fill(raw, true)
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
        { scale: exportStore.scale },
      )

      // render() not called yet — just discard gif object and exit
      if (!res || signal.aborted || !gif) { exportStore.finish(); return }
      noteScale(res.scale, res.limit)

      await new Promise<void>((resolve) => {
        gif!.on('progress', (p: number) => exportStore.setProgress(70 + Math.round(p * 30)))
        gif!.on('finished', (blob: Blob) => { downloadBlob(blob, 'spine-animation.gif'); resolve() })
        gif!.on('abort',    () => resolve())
        signal.addEventListener('abort', () => gif!.abort())
        gif!.render()
      })
    } catch (e) {
      exportStore.fail(e instanceof Error ? e.message : 'Failed to encode GIF')
      return
    }
    exportStore.finish()
  }

  return { onCapturePng, onCapturePose, onCaptureSheet, onCaptureGif, onCancelExport }
}
