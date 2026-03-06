<template>
  <n-popover trigger="click" placement="bottom-end" :show-arrow="false">
    <template #trigger>
      <button class="settings-btn" title="Settings">⚙</button>
    </template>

    <div class="settings-body">
      <div class="settings-row">
        <span class="row-label">Theme</span>
        <n-button-group size="small">
          <n-button
            :type="settingsStore.theme === 'dark' ? 'primary' : 'default'"
            @click="settingsStore.theme = 'dark'"
          >Dark</n-button>
          <n-button
            :type="settingsStore.theme === 'light' ? 'primary' : 'default'"
            @click="settingsStore.theme = 'light'"
          >Light</n-button>
        </n-button-group>
      </div>

      <div class="settings-row">
        <span class="row-label">Font size</span>
        <n-button-group size="small">
          <n-button
            v-for="size in SIZES"
            :key="size.value"
            :type="settingsStore.fontSize === size.value ? 'primary' : 'default'"
            @click="settingsStore.fontSize = size.value"
          >{{ size.label }}</n-button>
        </n-button-group>
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/core/stores/useSettingsStore'
import type { FontSize } from '@/core/stores/useSettingsStore'

const settingsStore = useSettingsStore()

const SIZES: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
]
</script>

<style scoped>
.settings-btn {
  background: none;
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s;
}

.settings-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row-label {
  font-size: 0.8rem;
  color: var(--c-text-muted);
}
</style>
