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
import { spineVersionProblem } from '@/core/utils/versionDetector'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import { useVersionStore } from '@/core/stores/useVersionStore'

// ── Slot types ─────────────────────────────────────────────────────────────────

export interface SpineSlotRef {
  source: 'loaded'
  slotId: string
  label: string
}

interface CompareFileSet {
  source: 'direct'
  fileSet: FileSet
  label: string
}

type CompareSlot = SpineSlotRef | CompareFileSet | null

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

  const sourceError = ref<{ left: string | null; right: string | null }>({ left: null, right: null })

  // --- Persistence watchers ---
  watch(syncEnabled,  v => localStorage.setItem('svp:compare:syncEnabled', String(v)))
  watch(syncViewport, v => localStorage.setItem('svp:compare:syncViewport', String(v)))
  watch(masterSide,   v => localStorage.setItem('svp:compare:masterSide', v))
  watch(diffPanelPos, v => localStorage.setItem('svp:compare:panelPos', v))

  // --- Actions ---

  function setSide(side: 'left' | 'right', slot: CompareSlot) {
    if (side === 'left') leftSlot.value = slot
    else rightSlot.value = slot
    sourceError.value[side] = null
    diff.value       = null
    diffStatus.value = 'idle'
    diffError.value  = null
  }

  /** Classify, check and store files loaded directly into a compare slot (not from loaderStore). */
  async function loadDirect(side: 'left' | 'right', files: File[]): Promise<void> {
    sourceError.value[side] = null
    const fail = (msg: string) => { sourceError.value[side] = msg }

    const result = await groupSpineFiles(files)
    if (result.globalError) return fail(result.globalError)

    const fileSet = result.slots.find(s => !s.error && s.fileSet)?.fileSet
    if (!fileSet) return fail('No valid Spine files found')

    const selected = useVersionStore().spineVersion
    if (!selected) return fail('Select a Spine version first')

    const versionProblem = spineVersionProblem(fileSet, selected)
    if (versionProblem) return fail(versionProblem)

    const errors = validateSpineFileSet(fileSet)
    if (errors.length > 0) return fail(errors.join('\n'))

    const slot: CompareFileSet = { source: 'direct', fileSet, label: fileSet.skeleton.filename }
    setSide(side, slot)
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
    sourceError.value       = { left: null, right: null }
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
    sourceError,
    setSide,
    loadDirect,
    setPanelPos,
    setDiff,
    setDiffStatus,
    selectedHighlight,
    setHighlight,
    reset,
  }
})
