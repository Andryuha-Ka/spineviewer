/**
 * @file useExportStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'

export type ExportType = 'png' | 'gif' | 'sheet' | 'pose'

export const useExportStore = defineStore('export', () => {
  const exporting  = ref(false)
  const exportType = ref<ExportType | null>(null)
  const progress   = ref(0)
  const error      = ref<string | null>(null)

  let _abortController: AbortController | null = null

  function start(type: ExportType): AbortSignal {
    _abortController = new AbortController()
    exporting.value  = true
    exportType.value = type
    progress.value   = 0
    error.value      = null
    return _abortController.signal
  }

  function cancel() {
    _abortController?.abort()
  }

  function setProgress(pct: number) {
    progress.value = Math.round(pct)
  }

  function finish() {
    exporting.value  = false
    exportType.value = null
    progress.value   = 0
    _abortController = null
  }

  function fail(msg: string) {
    error.value      = msg
    exporting.value  = false
    exportType.value = null
    _abortController = null
  }

  return { exporting, exportType, progress, error, start, cancel, setProgress, finish, fail }
})
