/**
 * @file useViewerStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'

export const useViewerStore = defineStore('viewer', () => {
  const bgColor = ref(0x1a1a2e)
  const zoom = ref(1)
  const posX = ref(0)
  const posY = ref(0)

  function resetView() {
    zoom.value = 1
    posX.value = 0
    posY.value = 0
  }

  return { bgColor, zoom, posX, posY, resetView }
})
