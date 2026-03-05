<template>
  <n-config-provider :theme="darkTheme">
    <n-global-style />
    <VersionPickerPage v-if="page === 'picker'" @open="page = 'viewer'" />
    <ViewerPage v-else @back="page = 'picker'" />
  </n-config-provider>
</template>

<script setup lang="ts">
import { darkTheme } from 'naive-ui'
import VersionPickerPage from '@/components/pages/VersionPickerPage.vue'
import ViewerPage from '@/components/pages/ViewerPage.vue'

const page = ref<'picker' | 'viewer'>('picker')
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
  background: #0d0d0f;
  color: #e0e0e0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
</style>
