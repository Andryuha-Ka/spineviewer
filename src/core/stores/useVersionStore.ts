/**
 * @file useVersionStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'

export type PixiVersion = 7 | 8
export type SpineVersion = '3.8' | '4.0' | '4.1' | '4.2'

const STORAGE_KEY = 'svp-version'

const spineOptionsMap: Record<PixiVersion, SpineVersion[]> = {
  7: ['3.8', '4.0', '4.1'],
  8: ['4.2'], // @esotericsoftware/spine-pixi-v8 only has 4.2.x releases
}

interface StoredVersions {
  pixiVersion: PixiVersion | null
  spineVersion: SpineVersion | null
}

function loadFromStorage(): StoredVersions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { pixiVersion: null, spineVersion: null }
    const parsed = JSON.parse(raw)
    const pixi = parsed.pixiVersion as PixiVersion | null
    const spine = parsed.spineVersion as SpineVersion | null
    // Validate that saved combination is still valid
    if (pixi && spine && spineOptionsMap[pixi]?.includes(spine)) {
      return { pixiVersion: pixi, spineVersion: spine }
    }
    return { pixiVersion: pixi ?? null, spineVersion: null }
  } catch {
    return { pixiVersion: null, spineVersion: null }
  }
}

export const useVersionStore = defineStore('version', () => {
  const saved = loadFromStorage()

  const pixiVersion = ref<PixiVersion | null>(saved.pixiVersion)
  const spineVersion = ref<SpineVersion | null>(saved.spineVersion)

  const isReady = computed(
    () => pixiVersion.value !== null && spineVersion.value !== null,
  )

  // Reset spine version if it's incompatible with newly selected pixi version
  watch(pixiVersion, (newPixi) => {
    if (!newPixi || !spineVersion.value) return
    if (!spineOptionsMap[newPixi].includes(spineVersion.value)) {
      spineVersion.value = null
    }
  })

  // Persist to localStorage on any change
  watch([pixiVersion, spineVersion], () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pixiVersion: pixiVersion.value, spineVersion: spineVersion.value }),
    )
  })

  function selectVersion(pixi: PixiVersion, spine?: SpineVersion) {
    pixiVersion.value = pixi
    if (spine) spineVersion.value = spine
  }

  return { pixiVersion, spineVersion, spineOptionsMap, isReady, selectVersion }
})
