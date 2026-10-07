<!--
 * @file App.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <VersionPickerPage
      v-if="page === 'picker'"
      @open="page = 'viewer'"
      @open-compare="onOpenCompare"
    />
    <ViewerPage
      v-else-if="page === 'viewer'"
      @back="page = 'picker'"
      @open-compare="onOpenCompare"
    />
    <ComparePage
      v-else-if="page === 'compare'"
      :init-left-slot-id="compareInitLeft"
      :init-right-slot-id="compareInitRight"
      @back="page = 'picker'"
    />
  </n-config-provider>
</template>

<script setup lang="ts">
import { darkTheme } from 'naive-ui'
import VersionPickerPage from '@/components/pages/VersionPickerPage.vue'
import ViewerPage from '@/components/pages/ViewerPage.vue'
import ComparePage from '@/components/compare/ComparePage.vue'
import { useSettingsStore } from '@/core/stores/useSettingsStore'
import { naiveOverrides } from '@/core/utils/themePalette'
import { installSvpApi, uninstallSvpApi } from '@/core/api/svpApi'
import { useSkeletonEditStore } from '@/core/stores/useSkeletonEditStore'

const settingsStore = useSettingsStore()
const page     = ref<'picker' | 'viewer' | 'compare'>('picker')
const compareInitLeft  = ref<string | undefined>(undefined)
const compareInitRight = ref<string | undefined>(undefined)

function onOpenCompare(payload?: { left?: string; right?: string }) {
  compareInitLeft.value  = payload?.left
  compareInitRight.value = payload?.right
  page.value = 'compare'
}

installSvpApi({
  currentPage: () => page.value,
  openViewer:  () => { page.value = 'viewer' },
  openPicker:  () => { page.value = 'picker' },
})
onUnmounted(uninstallSvpApi)

const editStore = useSkeletonEditStore()
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (editStore.hasUnsavedEdits) e.preventDefault()
})

const naiveTheme = computed(() => settingsStore.theme === 'dark' ? darkTheme : null)
const themeOverrides = computed(() => naiveOverrides(settingsStore.palette, settingsStore.theme))

watchEffect(() => {
  const html = document.documentElement
  // Remove previous theme/palette/font classes
  const toRemove = [...html.classList].filter(c => c.startsWith('theme-') || c.startsWith('palette-') || c.startsWith('font-'))
  toRemove.forEach(c => html.classList.remove(c))
  html.classList.add(`theme-${settingsStore.theme}`, `palette-${settingsStore.palette}`, `font-${settingsStore.fontSize}`)
})
</script>

<style>
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
</style>
