<template>
  <div class="picker">
    <div class="picker-top-bar">
      <SettingsPopover />
    </div>

    <header class="picker-header">
      <h1 class="title">
        <span class="t-spine">Spine</span>
        <span class="t-viewer"> Viewer</span>
        <span class="t-pro"> Pro</span>
      </h1>
      <p class="hint">Select render engine and Spine runtime version</p>
    </header>

    <div class="cards">
      <div
        v-for="pixi in ([7, 8] as PixiVersion[])"
        :key="pixi"
        class="card"
        :class="{ 'card--selected': store.pixiVersion === pixi }"
        @click="store.selectVersion(pixi)"
      >
        <div class="card-head">
          <div class="card-engine-label">
            <span class="card-engine">Pixi.js</span>
            <span class="card-ver">{{ pixi }}</span>
          </div>
          <span v-if="pixi === 8" class="badge">recommended</span>
        </div>

        <p class="card-desc">
          {{ pixi === 7 ? 'Stable · broad compatibility' : 'Latest · WebGPU-ready' }}
        </p>

        <n-divider class="divider" />

        <p class="spine-label">Spine runtime</p>

        <!-- Stop click propagation so radio clicks don't re-fire card handler -->
        <div @click.stop>
          <n-radio-group
            :value="store.pixiVersion === pixi ? store.spineVersion : null"
            @update:value="(v: SpineVersion) => store.selectVersion(pixi, v)"
          >
            <n-space vertical :size="10">
              <n-radio
                v-for="v in store.spineOptionsMap[pixi]"
                :key="v"
                :value="v"
              >
                <span class="spine-ver">{{ v }}</span>
              </n-radio>
            </n-space>
          </n-radio-group>
        </div>
      </div>
    </div>

    <n-button
      type="primary"
      size="large"
      class="open-btn"
      :disabled="!store.isReady"
      @click="emit('open')"
    >
      Open Viewer
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { useVersionStore, type PixiVersion, type SpineVersion } from '@/core/stores/useVersionStore'
import SettingsPopover from '@/components/ui/SettingsPopover.vue'

const emit = defineEmits<{ open: [] }>()
const store = useVersionStore()
</script>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 40px;
  padding: 40px 20px;
  background: var(--c-bg);
}

.picker-top-bar {
  position: absolute;
  top: 16px;
  right: 20px;
}

/* ── Header ─────────────────────────────────────────── */
.picker-header {
  text-align: center;
}

.title {
  font-size: 2.8rem;
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1;
  margin-bottom: 10px;
}

.t-spine  { color: #7c6af5; }
.t-viewer { color: var(--c-text); }
.t-pro    { color: #4e9af1; }

.hint {
  color: var(--c-text-faint);
  font-size: 0.875rem;
  letter-spacing: 0.04em;
}

/* ── Cards ───────────────────────────────────────────── */
.cards {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
}

.card {
  width: 240px;
  padding: 28px 24px;
  border-radius: 16px;
  border: 1.5px solid var(--c-border);
  background: var(--c-surface);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.12s;
  user-select: none;
}

.card:hover {
  border-color: var(--c-text-ghost);
  background: var(--c-raised);
  transform: translateY(-2px);
}

.card--selected {
  border-color: #7c6af5;
  background: var(--c-card-sel-bg);
}

.card--selected:hover {
  border-color: #9d8fff;
}

/* ── Card head ───────────────────────────────────────── */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-engine-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.card-engine {
  font-size: 1rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.card-ver {
  font-size: 2rem;
  font-weight: 800;
  color: var(--c-text);
  line-height: 1;
}

.card--selected .card-ver {
  color: #9d8fff;
}

.badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #4e9af1;
  border: 1px solid #2a4a70;
  border-radius: 6px;
  padding: 2px 7px;
  background: #0d1e30;
}

.card-desc {
  font-size: 0.78rem;
  color: var(--c-text-faint);
  margin-bottom: 4px;
}

.divider {
  margin: 16px 0 !important;
}

/* ── Spine radios ────────────────────────────────────── */
.spine-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-ghost);
  margin-bottom: 12px;
}

.spine-ver {
  font-size: 0.9rem;
  color: var(--c-text-dim);
}

/* ── Open button ─────────────────────────────────────── */
.open-btn {
  min-width: 180px;
}
</style>
