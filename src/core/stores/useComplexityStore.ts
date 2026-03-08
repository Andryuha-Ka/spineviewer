/**
 * @file useComplexityStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { ISpineAdapter } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import type { AtlasPage } from '@/core/utils/atlasTextParser'
import { analyzeComplexity, type ComplexityReport } from '@/core/utils/complexityAnalyzer'

export const useComplexityStore = defineStore('complexity', () => {
  const report = ref<ComplexityReport | null>(null)

  function analyze(adapter: ISpineAdapter, fileSet: FileSet, atlasPages: AtlasPage[]): void {
    report.value = analyzeComplexity(adapter, fileSet, atlasPages)
  }

  function clear(): void {
    report.value = null
  }

  return { report, analyze, clear }
})
