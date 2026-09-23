/**
 * @file useFilePickerLogic.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useVersionStore, type SpineVersion } from '@/core/stores/useVersionStore'
import { groupSpineFiles, getFilesFromDataTransfer } from '@/core/utils/fileLoader'
import { detectSpineVersion, detectSpineVersionFromSkel } from '@/core/utils/versionDetector'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import {
  saveSession,
  isFileSystemAccessSupported,
  pickFilesViaFSAA,
  pickFolderViaFSAA,
} from '@/core/utils/fileHistory'
import type { SpineFileType } from '@/core/types/FileSet'

type EmitFn = {
  (event: 'open'): void
  (event: 'open-compare', payload: { left?: number; right?: number }): void
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

export function useFilePickerLogic(emit: EmitFn, onHistorySaved?: () => void) {
  const fileLoaderStore = useFileLoaderStore()
  const store           = useVersionStore()

  const isDragging     = ref(false)
  const classifyError  = ref<string | null>(null)
  const versionUnknown = ref(false)
  const fileInputRef   = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)

  function autoSelectVersion(version: string): void {
    if      (version === '3.8') store.selectVersion(7, '3.8' as SpineVersion)
    else if (version === '4.0') store.selectVersion(7, '4.0' as SpineVersion)
    else if (version === '4.1') store.selectVersion(7, '4.1' as SpineVersion)
    else if (version === '4.2') store.selectVersion(8, '4.2' as SpineVersion)
  }

  async function handleFiles(
    files: File[],
    handles?: FileSystemFileHandle[],
    skipHistory = false,
  ): Promise<void> {
    if (files.length === 0) return
    isDragging.value     = false
    classifyError.value  = null
    versionUnknown.value = false

    fileLoaderStore.setPendingFiles(files)

    const result = await groupSpineFiles(files)

    if (result.globalError) {
      classifyError.value = result.globalError
      return
    }
    if (result.slots.length === 0) {
      classifyError.value = 'No valid Spine files found'
      return
    }

    const firstValid = result.slots.find(s => !s.error && s.fileSet)
    let version: string | null = null
    if (firstValid?.fileSet) {
      const { skeleton } = firstValid.fileSet
      version = skeleton.type === 'skeleton-json'
        ? detectSpineVersion(skeleton.fileBody as string)
        : detectSpineVersionFromSkel(skeleton.fileBody as ArrayBuffer)
    }

    for (const slot of result.slots) {
      if (slot.fileSet) {
        const errs = validateSpineFileSet(slot.fileSet)
        if (errs.length > 0) slot.validationErrors = errs
      }
    }

    fileLoaderStore.setSlots(result.slots, version)

    if (version && version !== 'unknown') {
      autoSelectVersion(version)
    } else {
      versionUnknown.value = true
    }

    if (!skipHistory && result.slots.some(s => !s.error && !s.validationErrors?.length)) {
      await saveSession(files.map(f => f.name), handles)
      onHistorySaved?.()
    }
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
  }

  function onOpenCompare(): void {
    const slots = fileLoaderStore.spineSlots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.error && !(s.validationErrors?.length))
    if (slots.length >= 2) {
      emit('open-compare', { left: slots[0].i, right: slots[1].i })
    } else if (slots.length === 1) {
      emit('open-compare', { left: slots[0].i })
    } else {
      emit('open-compare', {})
    }
  }

  return {
    isDragging,
    classifyError,
    versionUnknown,
    fileInputRef,
    folderInputRef,
    handleFiles,
    autoSelectVersion,
    onDrop,
    onChooseFiles,
    onChooseFolder,
    onFileInput,
    onClear,
    onOpenCompare,
  }
}
