<!--
 * @file App.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <n-config-provider :theme="naiveTheme">
    <n-global-style />
    <VersionPickerPage v-if="page === 'picker'" @open="page = 'viewer'" />
    <ViewerPage v-else @back="page = 'picker'" />
  </n-config-provider>
</template>

<script setup lang="ts">
import { darkTheme } from 'naive-ui'
import VersionPickerPage from '@/components/pages/VersionPickerPage.vue'
import ViewerPage from '@/components/pages/ViewerPage.vue'
import { useSettingsStore } from '@/core/stores/useSettingsStore'

const settingsStore = useSettingsStore()
const page = ref<'picker' | 'viewer'>('picker')

const naiveTheme = computed(() => settingsStore.theme === 'dark' ? darkTheme : null)

watchEffect(() => {
  const html = document.documentElement
  // Remove previous theme/font classes
  const toRemove = [...html.classList].filter(c => c.startsWith('theme-') || c.startsWith('font-'))
  toRemove.forEach(c => html.classList.remove(c))
  html.classList.add(`theme-${settingsStore.theme}`, `font-${settingsStore.fontSize}`)
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
