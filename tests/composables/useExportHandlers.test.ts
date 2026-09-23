import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useExportHandlers } from '@/core/composables/useExportHandlers'
import { useExportStore } from '@/core/stores/useExportStore'
import { downloadBlob } from '@/core/utils/exportUtils'

vi.mock('@/core/utils/exportUtils', () => ({
  downloadBlob:     vi.fn(),
  downloadJson:     vi.fn(),
  canvasToBlob:     vi.fn(),
  buildSpriteSheet: vi.fn(),
}))

describe('useExportHandlers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('PNG with no frame fails with "Nothing to capture" and unlocks the buttons', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stageRef = ref({ captureCurrentFrame: async () => null }) as any
    const exportStore = useExportStore()

    await useExportHandlers(stageRef).onCapturePng()

    expect(exportStore.exporting).toBe(false)
    expect(exportStore.error).toBe('Nothing to capture')
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
