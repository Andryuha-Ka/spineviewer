/**
 * @file useFilePickerLogic.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { getFilesFromDataTransfer } from '@/core/utils/fileLoader'
import {
  isFileSystemAccessSupported,
  pickFilesViaFSAA,
  pickFolderViaFSAA,
} from '@/core/utils/fileHistory'
import type { EmitFn, ShortEmitsToObject } from 'vue'
import type { SpineFileType } from '@/core/types/FileSet'

export type PickerEmits = {
  open: []
  'open-compare': [payload: { left?: string; right?: string }]
}

export const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function useFilePickerLogic(emit: EmitFn<ShortEmitsToObject<PickerEmits>>,onHistorySaved?: () => void) {
  const fileLoaderStore = useFileLoaderStore()

  const isDragging     = ref(false)
  const classifyError  = ref<string | null>(null)
  const versionUnknown = ref(false)
  const unsupportedHint = ref<string | null>(null)
  const fileInputRef   = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)

  async function handleFiles(
    files: File[],
    handles?: FileSystemFileHandle[],
    skipHistory = false,
  ): Promise<void> {
    if (files.length === 0) return
    isDragging.value      = false
    classifyError.value   = null
    versionUnknown.value  = false
    unsupportedHint.value = null

    const result = await fileLoaderStore.loadFileList(files, { skipHistory, handles })
    classifyError.value   = result.error
    versionUnknown.value  = result.versionUnknown
    unsupportedHint.value = result.unsupportedHint
    if (result.historySaved) onHistorySaved?.()
  }

  async function onDrop(e: DragEvent): Promise<void> {
    if (!e.dataTransfer) return
    // Capture FSAA handle promises synchronously BEFORE any await —
    // browsers clear DataTransfer.items after the first event-loop tick.
    const handlePromises: Promise<FileSystemHandle | null>[] = isFileSystemAccessSupported()
      ? Array.from(e.dataTransfer.items).map(
          // TODO: remove cast when File System Access API types are stable in TypeScript lib
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          item => (((item as any).getAsFileSystemHandle?.() ?? Promise.resolve(null)) as Promise<FileSystemHandle | null>),
        )
      : []

    const files = await getFilesFromDataTransfer(e.dataTransfer)

    // Resolve the handles captured synchronously above
    const handles: FileSystemFileHandle[] = []
    for (const p of handlePromises) {
      try {
        const handle = await p
        if (handle?.kind === 'file') {
          handles.push(handle as FileSystemFileHandle)
        } else if (handle?.kind === 'directory') {
          // TODO: remove cast when File System Access API types are stable in TypeScript lib
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for await (const entry of (handle as any).values()) {
            if (entry.kind === 'file') handles.push(entry as FileSystemFileHandle)
          }
        }
      } catch {}
    }

    await handleFiles(files, handles.length > 0 ? handles : undefined)
  }

  async function onChooseFiles(): Promise<void> {
    if (isFileSystemAccessSupported()) {
      const result = await pickFilesViaFSAA(true)
      if (result) { await handleFiles(result.files, result.handles); return }
    }
    fileInputRef.value?.click()
  }

  async function onChooseFolder(): Promise<void> {
    if (isFileSystemAccessSupported()) {
      const result = await pickFolderViaFSAA()
      if (result) { await handleFiles(result.files, result.handles); return }
    }
    folderInputRef.value?.click()
  }

  function onFileInput(e: Event): void {
    const input = e.target as HTMLInputElement
    if (!input.files) return
    // No handles available from <input type="file"> — variant A only
    handleFiles(Array.from(input.files))
    input.value = ''
  }

  function onClear(): void {
    fileLoaderStore.clear()
    classifyError.value  = null
    versionUnknown.value = false
    unsupportedHint.value = null
  }

  function onOpenCompare(): void {
    const slots = fileLoaderStore.spineSlots.filter(s => !s.error && !(s.validationErrors?.length))
    if (slots.length >= 2) {
      emit('open-compare', { left: slots[0].id, right: slots[1].id })
    } else if (slots.length === 1) {
      emit('open-compare', { left: slots[0].id })
    } else {
      emit('open-compare', {})
    }
  }

  return {
    isDragging,
    classifyError,
    versionUnknown,
    unsupportedHint,
    fileInputRef,
    folderInputRef,
    handleFiles,
    onDrop,
    onChooseFiles,
    onChooseFolder,
    onFileInput,
    onClear,
    onOpenCompare,
  }
}
