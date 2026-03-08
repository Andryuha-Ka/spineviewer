/**
 * @file useAtlasStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { parseAtlas, type AtlasPage } from '@/core/utils/atlasTextParser'
import type { SpineFile } from '@/core/types/FileSet'

export const useAtlasStore = defineStore('atlas', () => {
  const pages      = ref<AtlasPage[]>([])
  const imageUrls  = ref<Record<string, string>>({})  // page filename → dataURL
  const seenRegions = ref(new Set<string>())

  function load(atlasText: string, images: SpineFile[]) {
    pages.value = parseAtlas(atlasText)

    const urls: Record<string, string> = {}
    for (const img of images) {
      if (typeof img.fileBody === 'string') {
        urls[img.filename] = img.fileBody
      }
    }
    imageUrls.value  = urls
    seenRegions.value = new Set()
  }

  /** Call each tick with currently active attachment names */
  function markSeen(names: string[]) {
    const current = seenRegions.value
    const toAdd   = names.filter(n => !current.has(n))
    if (toAdd.length === 0) return
    const next = new Set(current)
    for (const n of toAdd) next.add(n)
    seenRegions.value = next
  }

  function clear() {
    pages.value      = []
    imageUrls.value  = {}
    seenRegions.value = new Set()
  }

  return { pages, imageUrls, seenRegions, load, markSeen, clear }
})
