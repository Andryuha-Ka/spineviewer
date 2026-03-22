/**
 * @file useCompareStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { FileSet } from '@/core/types/FileSet'
import type { SpineDiff } from '@/core/utils/spineCompare'
import { groupSpineFiles } from '@/core/utils/fileLoader'

// ── Slot types ─────────────────────────────────────────────────────────────────

export interface SpineSlotRef {
  source: 'loaded'
  slotIndex: number
  label: string
}

export interface CompareFileSet {
  source: 'direct'
  fileSet: FileSet
  label: string
}

export type CompareSlot = SpineSlotRef | CompareFileSet | null

// ── Store ──────────────────────────────────────────────────────────────────────

export const useCompareStore = defineStore('compare', () => {
  // --- State ---
  const leftSlot  = ref<CompareSlot>(null)
  const rightSlot = ref<CompareSlot>(null)

  const syncEnabled = ref<boolean>(
    (localStorage.getItem('svp:compare:syncEnabled') ?? 'true') === 'true',
  )
  const syncViewport = ref<boolean>(
    (localStorage.getItem('svp:compare:syncViewport') ?? 'true') === 'true',
  )
  const masterSide = ref<'left' | 'right'>(
    (localStorage.getItem('svp:compare:masterSide') as 'left' | 'right') ?? 'left',
  )
  const diffPanelPos = ref<'left' | 'right' | 'bottom'>(
    (localStorage.getItem('svp:compare:panelPos') as 'left' | 'right' | 'bottom') ?? 'right',
  )

  const diff       = ref<SpineDiff | null>(null)
  const diffStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle')
  const diffError  = ref<string | null>(null)

  const selectedHighlight = ref<{ name: string; kind: 'bone' | 'slot' } | null>(null)

  // --- Persistence watchers ---
  watch(syncEnabled,  v => localStorage.setItem('svp:compare:syncEnabled', String(v)))
  watch(syncViewport, v => localStorage.setItem('svp:compare:syncViewport', String(v)))
  watch(masterSide,   v => localStorage.setItem('svp:compare:masterSide', v))
  watch(diffPanelPos, v => localStorage.setItem('svp:compare:panelPos', v))

  // --- Actions ---

  function setLeft(slot: CompareSlot) {
    leftSlot.value   = slot
    diff.value       = null
    diffStatus.value = 'idle'
    diffError.value  = null
  }

  function setRight(slot: CompareSlot) {
    rightSlot.value  = slot
    diff.value       = null
    diffStatus.value = 'idle'
    diffError.value  = null
  }

  /** Classify + store files loaded directly into a compare slot (not from loaderStore). */
  async function loadDirect(side: 'left' | 'right', files: File[]): Promise<{ error: string | null }> {
    const result = await groupSpineFiles(files)
    if (result.globalError) return { error: result.globalError }

    const first = result.slots.find(s => !s.error && s.fileSet)
    if (!first?.fileSet) return { error: 'No valid Spine files found' }

    const slot: CompareFileSet = {
      source: 'direct',
      fileSet: first.fileSet,
      label: first.fileSet.skeleton.filename,
    }
    if (side === 'left') setLeft(slot)
    else setRight(slot)
    return { error: null }
  }

  function setPanelPos(pos: 'left' | 'right' | 'bottom') {
    diffPanelPos.value = pos
  }

  function setDiff(result: SpineDiff) {
    diff.value       = result
    diffStatus.value = 'done'
    diffError.value  = null
  }

  function setDiffStatus(status: 'idle' | 'running' | 'done' | 'error', error?: string) {
    diffStatus.value = status
    diffError.value  = error ?? null
  }

  function setHighlight(name: string, kind: 'bone' | 'slot') {
    if (selectedHighlight.value?.name === name && selectedHighlight.value.kind === kind) {
      selectedHighlight.value = null
    } else {
      selectedHighlight.value = { name, kind }
    }
  }

  function reset() {
    leftSlot.value          = null
    rightSlot.value         = null
    diff.value              = null
    diffStatus.value        = 'idle'
    diffError.value         = null
    selectedHighlight.value = null
  }

  return {
    leftSlot,
    rightSlot,
    syncEnabled,
    syncViewport,
    masterSide,
    diffPanelPos,
    diff,
    diffStatus,
    diffError,
    setLeft,
    setRight,
    loadDirect,
    setPanelPos,
    setDiff,
    setDiffStatus,
    selectedHighlight,
    setHighlight,
    reset,
  }
})
