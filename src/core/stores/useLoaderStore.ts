/**
 * @file useLoaderStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { guessFileType } from '@/core/utils/fileLoader'
import type { FileSet, SpineFileType } from '@/core/types/FileSet'

export interface PendingFileInfo {
  name: string
  size: number
  type: SpineFileType
}

export const useLoaderStore = defineStore('loader', () => {
  /** Raw File objects shown in the file list (not yet read into memory) */
  const pendingFiles = ref<File[]>([])
  /** Fully read and classified file set, ready to pass to adapter.load() */
  const fileSet = ref<FileSet | null>(null)
  /** Spine version detected from the JSON skeleton field */
  const detectedVersion = ref<string | null>(null)

  /** Recognised files from pendingFiles (ignores unknown extensions) */
  const pendingFileInfos = computed<PendingFileInfo[]>(() =>
    pendingFiles.value
      .map(f => ({ name: f.name, size: f.size, type: guessFileType(f.name) }))
      .filter((f): f is PendingFileInfo => f.type !== null),
  )

  const hasFiles = computed(() => pendingFiles.value.length > 0)
  const isLoaded = computed(() => fileSet.value !== null)

  function setPendingFiles(files: File[]) {
    pendingFiles.value = files
    fileSet.value = null
    detectedVersion.value = null
  }

  function setFileSet(fs: FileSet, version: string | null) {
    fileSet.value = fs
    detectedVersion.value = version
  }

  function clear() {
    pendingFiles.value = []
    fileSet.value = null
    detectedVersion.value = null
  }

  return {
    pendingFiles,
    fileSet,
    detectedVersion,
    pendingFileInfos,
    hasFiles,
    isLoaded,
    setPendingFiles,
    setFileSet,
    clear,
  }
})
