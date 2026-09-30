<!--
 * @file FreeBonePanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="free-bone-panel">
    <div class="panel-header">
      <span class="panel-title">Free Bones</span>
      <span class="panel-hint">{{ skeletonStore.freeBones.length }} bone{{ skeletonStore.freeBones.length !== 1 ? 's' : '' }} · not keyframed</span>
    </div>

    <div class="bone-list">
      <div
        v-for="name in skeletonStore.freeBones"
        :key="name"
        class="bone-row"
      >
        <div class="bone-name">{{ name }}</div>
        <div class="bone-controls">
          <label class="ctrl-label">X</label>
          <input
            class="ctrl-input"
            type="number"
            step="1"
            :value="getVal(name).x"
            @change="onField(name, 'x', $event)"
          />
          <label class="ctrl-label">Y</label>
          <input
            class="ctrl-input"
            type="number"
            step="1"
            :value="getVal(name).y"
            @change="onField(name, 'y', $event)"
          />
          <label class="ctrl-label">R</label>
          <input
            class="ctrl-input ctrl-input--rot"
            type="number"
            step="0.5"
            :value="getVal(name).rotation"
            @change="onField(name, 'rotation', $event)"
          />
          <button class="reset-btn" title="Reset to setup pose" @click="onReset(name)">↺</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'

const skeletonStore = useSkeletonStore()

// Per-bone current values — initialized from setup pose on first access
const overrides = ref(new Map<string, { x: number; y: number; rotation: number }>())

function getVal(name: string): { x: number; y: number; rotation: number } {
  if (!overrides.value.has(name)) {
    const setup = skeletonStore.getBoneSetupTransform(name)
    overrides.value.set(name, {
      x:        setup?.x        ?? 0,
      y:        setup?.y        ?? 0,
      rotation: setup?.rotation ?? 0,
    })
  }
  return overrides.value.get(name)!
}

function onField(name: string, field: 'x' | 'y' | 'rotation', e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  const val = parseFloat(raw)
  if (!isFinite(val)) return
  const cur = getVal(name)
  overrides.value.set(name, { ...cur, [field]: val })
  skeletonStore.setBoneTransform(name, { [field]: val })
}

function onReset(name: string): void {
  const setup = skeletonStore.getBoneSetupTransform(name)
  if (!setup) return
  const t = { x: setup.x, y: setup.y, rotation: setup.rotation }
  overrides.value.set(name, t)
  skeletonStore.setBoneTransform(name, t)
}

// When free bones list changes (new spine loaded), clear cached overrides
watch(() => skeletonStore.freeBones, () => { overrides.value.clear() })
</script>

<style scoped>
.free-bone-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.panel-hint {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
}

.bone-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.bone-row {
  padding: 5px 10px;
  border-bottom: 1px solid var(--c-border-dim);
}

.bone-row:last-child {
  border-bottom: none;
}

.bone-name {
  font-size: 0.75rem;
  color: var(--c-text-dim);
  margin-bottom: 4px;
  font-family: monospace;
}

.bone-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.ctrl-label {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  min-width: 10px;
  text-align: right;
}

.ctrl-input {
  width: 60px;
  background: var(--c-surface);
  border: 1px solid var(--c-border-dim);
  border-radius: 3px;
  color: var(--c-text);
  font-size: 0.75rem;
  padding: 2px 4px;
  text-align: right;
}

.ctrl-input--rot {
  width: 54px;
}

.ctrl-input:focus {
  outline: none;
  border-color: var(--c-focus-ring);
}

/* Remove default number spinners */
.ctrl-input::-webkit-inner-spin-button,
.ctrl-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.reset-btn {
  background: none;
  border: 1px solid var(--c-border-dim);
  border-radius: 3px;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
  min-height: 20px;
  padding: 2px 6px;
  cursor: pointer;
  margin-left: 2px;
  transition: color 0.15s, border-color 0.15s;
}

.reset-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}
</style>
