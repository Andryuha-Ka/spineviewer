<!--
 * @file CompareToolbar.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <header class="compare-toolbar">
    <!-- Back -->
    <button class="back-btn" @click="emit('back')">← Back</button>

    <div class="toolbar-divider" />

    <!-- File slot A -->
    <CompareFileSlot side="left" />

    <!-- Separator icon -->
    <span class="swap-icon">⟷</span>

    <!-- File slot B -->
    <CompareFileSlot side="right" />

    <div class="toolbar-spacer" />

    <!-- Playback sync toggle -->
    <button
      class="toggle-btn"
      :class="{ 'toggle-btn--on': compareStore.syncEnabled }"
      @click="compareStore.syncEnabled = !compareStore.syncEnabled"
      title="Synchronized playback (time)"
    >
      ↺ {{ compareStore.syncEnabled ? 'Time ON' : 'Time OFF' }}
    </button>

    <!-- Viewport sync toggle -->
    <button
      class="toggle-btn"
      :class="{ 'toggle-btn--on': compareStore.syncViewport }"
      @click="compareStore.syncViewport = !compareStore.syncViewport"
      title="Synchronized viewport (pan/zoom)"
    >
      ⊞ {{ compareStore.syncViewport ? 'View ON' : 'View OFF' }}
    </button>

    <!-- Master side -->
    <div class="master-toggle" title="Master (controls playback)">
      <span class="master-label">Master</span>
      <button
        class="master-btn"
        :class="{ 'master-btn--active': compareStore.masterSide === 'left' }"
        @click="compareStore.masterSide = 'left'"
      >A</button>
      <button
        class="master-btn"
        :class="{ 'master-btn--active': compareStore.masterSide === 'right' }"
        @click="compareStore.masterSide = 'right'"
      >B</button>
    </div>

    <!-- Settings -->
    <SettingsPopover />

    <!-- Panel position -->
    <div class="panel-pos-group" title="Diff panel position">
      <button
        v-for="pos in (['left', 'right', 'bottom'] as const)"
        :key="pos"
        class="pos-btn"
        :class="{ 'pos-btn--active': compareStore.diffPanelPos === pos }"
        @click="compareStore.setPanelPos(pos)"
      >{{ posBtnIcon(pos) }}</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import CompareFileSlot from './CompareFileSlot.vue'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'
import { useCompareStore } from '@/core/stores/useCompareStore'

const emit = defineEmits<{
  back: []
}>()

const compareStore = useCompareStore()

function posBtnIcon(pos: 'left' | 'right' | 'bottom'): string {
  switch (pos) {
    case 'left':   return '◧'
    case 'right':  return '◨'
    case 'bottom': return '⬓'
  }
}
</script>

<style scoped>
.compare-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
  flex-wrap: wrap;
  row-gap: 6px;
  background: var(--c-bg);
}

.back-btn {
  background: none;
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

.back-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: var(--c-border-dim);
  flex-shrink: 0;
}

.swap-icon {
  font-size: 1rem;
  color: var(--c-text-ghost);
  flex-shrink: 0;
}

.toolbar-spacer { flex: 1; }

/* ── Toggle button ────────────────────────────────────────────────── */
.toggle-btn {
  background: transparent;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
  flex-shrink: 0;
  white-space: nowrap;
}

.toggle-btn:hover   { border-color: var(--c-text-ghost); }
.toggle-btn--on     { border-color: var(--c-success); color: var(--c-success); }
.toggle-btn--on:hover { border-color: var(--c-success); }

/* ── Master toggle ────────────────────────────────────────────────── */
.master-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.master-label {
  font-size: 0.75rem;
  color: var(--c-text-ghost);
}

.master-btn {
  background: var(--c-raised);
  height: 24px;
  border: 1px solid var(--c-border-dim);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}

.master-btn:hover    { border-color: var(--c-text-ghost); }
.master-btn--active  { background: var(--c-accent); border-color: var(--c-accent); color: var(--c-accent-text); }

/* ── Panel position ───────────────────────────────────────────────── */
.panel-pos-group {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.pos-btn {
  background: transparent;
  height: 24px;
  border: 1px solid var(--c-border-dim);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}

.pos-btn:hover   { border-color: var(--c-text-ghost); color: var(--c-text-muted); }
.pos-btn--active { border-color: var(--c-accent); color: var(--c-accent); }
</style>
