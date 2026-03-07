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
