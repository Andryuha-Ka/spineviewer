import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useExportHandlers } from '@/core/composables/useExportHandlers'
import { useExportStore } from '@/core/stores/useExportStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { SvpError } from '@/core/api/svpErrors'
import { downloadBlob, canvasToBlob, withBackground } from '@/core/utils/exportUtils'

vi.mock('@/core/utils/exportUtils', () => ({
  downloadBlob:     vi.fn(),
  downloadJson:     vi.fn(),
  canvasToBlob:     vi.fn(async () => new Blob()),
  buildSpriteSheet: vi.fn(async (frames: unknown[]) => frames[0]),
  withBackground:   vi.fn((c: unknown) => ({ filled: c })),
}))

const editMock = { exportSkeleton: vi.fn() }
vi.mock('@/core/stores/useSkeletonEditStore', () => ({ useSkeletonEditStore: () => editMock }))

vi.mock('gif.js', () => ({
  default: class {
    addFrame = vi.fn()
    on(ev: string, cb: (b?: Blob) => void) { if (ev === 'finished') this._done = cb }
    _done: ((b?: Blob) => void) | null = null
    render() { this._done?.(new Blob()) }
    abort() {}
  },
}))

const frameCanvas = { width: 1600, height: 1200 } as unknown as HTMLCanvasElement

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stage(over: Record<string, unknown> = {}): any {
  return ref({
    captureCurrentFrame: vi.fn(async (o: { scale?: number }) => ({ canvas: frameCanvas, scale: o.scale ?? 1 })),
    captureAnimFrames:   vi.fn(async (_t: number, n: number, onFrame: (c: HTMLCanvasElement, i: number, t: number) => void) => {
      for (let i = 0; i < n; i++) onFrame(frameCanvas, i, n)
      return { scale: 2, limit: null }
    }),
    ...over,
  })
}

describe('useExportHandlers', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('PNG with no frame fails with "Nothing to capture" and unlocks the buttons', async () => {
    const exportStore = useExportStore()
    await useExportHandlers(stage({ captureCurrentFrame: async () => null })).onCapturePng()

    expect(exportStore.exporting).toBe(false)
    expect(exportStore.error).toBe('Nothing to capture')
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('PNG passes the chosen scale and stays transparent by default', async () => {
    const exportStore = useExportStore()
    exportStore.scale = 2
    const s = stage()
    await useExportHandlers(s).onCapturePng()

    expect(s.value.captureCurrentFrame).toHaveBeenCalledWith({ scale: 2 })
    expect(withBackground).not.toHaveBeenCalled()
    expect(canvasToBlob).toHaveBeenCalledWith(frameCanvas)
    expect(exportStore.notice).toBeNull()
  })

  it('PNG fills the background only when the checkbox is ticked', async () => {
    useExportStore().includeBackground = true
    await useExportHandlers(stage()).onCapturePng()
    expect(withBackground).toHaveBeenCalledWith(frameCanvas, 0x1a1a2e)
  })

  it('PNG reports a GPU-reduced scale', async () => {
    const exportStore = useExportStore()
    exportStore.scale = 4
    await useExportHandlers(stage({ captureCurrentFrame: async () => ({ canvas: frameCanvas, scale: 2 }) })).onCapturePng()
    expect(exportStore.notice).toBe('Scale reduced to 2× (GPU limit)')
  })

  it('sprite sheet reports a memory-reduced scale and skips the background by default', async () => {
    const exportStore = useExportStore()
    exportStore.scale = 4
    const s = stage({
      captureAnimFrames: vi.fn(async () => ({ scale: 2, limit: 'memory' })),
    })
    await useExportHandlers(s).onCaptureSheet({ track: 0, frameCount: 4, cols: 2 })

    expect(s.value.captureAnimFrames.mock.calls[0][4]).toEqual({ scale: 4 })
    expect(exportStore.notice).toBe('Scale reduced to 2× (memory limit)')
    expect(withBackground).not.toHaveBeenCalled()
  })

  it('GIF always fills the background even when the checkbox is off', async () => {
    const animationStore = (await import('@/core/stores/useAnimationStore')).useAnimationStore()
    animationStore.setTracks([{ trackIndex: 0, animationName: 'idle', time: 0, duration: 0.1, loop: false, queue: [] }] as never)
    await useExportHandlers(stage()).onCaptureGif({ track: 0, fps: 20, quality: 10 })
    expect(withBackground).toHaveBeenCalledWith(frameCanvas, 0x1a1a2e)
    expect(downloadBlob).toHaveBeenCalled()
  })

  describe('skeleton zip', () => {
    beforeEach(() => { useSlotSelectionStore().activeSlotId = 'a' })

    it('downloads the zip under its name and ignores Scale / Background', async () => {
      const exportStore = useExportStore()
      exportStore.scale = 4
      exportStore.includeBackground = true
      const blob = new Blob(['zip'])
      editMock.exportSkeleton.mockResolvedValue({ blob, name: 'hero.zip', mimeType: 'application/zip', warnings: [] })
      await useExportHandlers().onExportSkeleton()

      expect(editMock.exportSkeleton).toHaveBeenCalledWith('a', 'zip', expect.any(AbortSignal))
      expect(downloadBlob).toHaveBeenCalledWith(blob, 'hero.zip')
      expect(withBackground).not.toHaveBeenCalled()
      expect(exportStore.exporting).toBe(false)
      expect(exportStore.error).toBeNull()
    })

    it('Stop aborts without a download or an error', async () => {
      const exportStore = useExportStore()
      editMock.exportSkeleton.mockImplementation((_id: string, _f: string, signal: AbortSignal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))))
      const run = useExportHandlers().onExportSkeleton()
      expect(exportStore.exportType).toBe('skeleton')
      exportStore.cancel()
      await run

      expect(downloadBlob).not.toHaveBeenCalled()
      expect(exportStore.error).toBeNull()
      expect(exportStore.exporting).toBe(false)
    })

    it('a failure shows "Export failed: <reason>" without the error code', async () => {
      const exportStore = useExportStore()
      editMock.exportSkeleton.mockRejectedValue(new SvpError('EXPORT_FAILED', 'Skeleton is not Spine JSON'))
      await useExportHandlers().onExportSkeleton()

      expect(exportStore.error).toBe('Export failed: Skeleton is not Spine JSON')
      expect(exportStore.exporting).toBe(false)
      expect(downloadBlob).not.toHaveBeenCalled()
    })
  })
})
