/**
 * @file useExportStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'

export type ExportType = 'png' | 'gif' | 'sheet' | 'pose'
export type ExportScale = 1 | 2 | 4

const SCALE_KEY = 'svp:export:scale'
const BG_KEY    = 'svp:export:background'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

function readScale(): ExportScale {
  const n = Number(read(SCALE_KEY))
  return n === 2 || n === 4 ? n : 1
}

export const useExportStore = defineStore('export', () => {
  const exporting  = ref(false)
  const exportType = ref<ExportType | null>(null)
  const progress   = ref(0)
  const error      = ref<string | null>(null)
  const notice     = ref<string | null>(null)

  const scale             = ref<ExportScale>(readScale())
  const includeBackground = ref(read(BG_KEY) === 'true')

  watch(scale,             v => write(SCALE_KEY, String(v)))
  watch(includeBackground, v => write(BG_KEY, String(v)))

  let _abortController: AbortController | null = null

  function start(type: ExportType): AbortSignal {
    _abortController = new AbortController()
    exporting.value  = true
    exportType.value = type
    progress.value   = 0
    error.value      = null
    notice.value     = null
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

  return { exporting, exportType, progress, error, notice, scale, includeBackground, start, cancel, setProgress, finish, fail }
})
