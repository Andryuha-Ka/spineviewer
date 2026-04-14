/**
 * @file useBackgroundStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'

export interface BackgroundImage {
  dataUrl: string
  width: number
  height: number
}

export const useBackgroundStore = defineStore('background', () => {
  const image = ref<BackgroundImage | null>(null)
  const posX = ref(0)
  const posY = ref(0)
  const zoom = ref(1)
  const syncEnabled = ref(true)
  const listIndex = ref(0)
  const isActive = ref(false)

  const isLoaded = computed(() => image.value !== null)

  function set(img: BackgroundImage): void {
    image.value = img
  }

  function clear(): void {
    image.value = null
  }

  function setTransform(x: number, y: number, z: number): void {
    posX.value = x
    posY.value = y
    zoom.value = z
  }

  function setSyncEnabled(v: boolean): void {
    syncEnabled.value = v
  }

  function setListIndex(n: number): void {
    listIndex.value = n
  }

  function setActive(v: boolean): void {
    isActive.value = v
  }

  function clearAll(): void {
    image.value = null
    posX.value = 0
    posY.value = 0
    zoom.value = 1
    syncEnabled.value = true
    listIndex.value = 0
    isActive.value = false
  }

  return {
    image,
    posX,
    posY,
    zoom,
    syncEnabled,
    listIndex,
    isActive,
    isLoaded,
    set,
    clear,
    setTransform,
    setSyncEnabled,
    setListIndex,
    setActive,
    clearAll,
  }
})
