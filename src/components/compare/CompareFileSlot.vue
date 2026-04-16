<!--
 * @file CompareFileSlot.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="file-slot">
    <span class="slot-badge">{{ side === 'left' ? 'A' : 'B' }}</span>

    <button
      class="slot-btn"
      :class="{ 'slot-btn--set': currentSlot !== null }"
      @click="isOpen = !isOpen"
    >
      <span class="slot-label" :title="currentLabel">{{ currentLabel }}</span>
      <span class="slot-arrow">▾</span>
    </button>

    <!-- Dropdown -->
    <div v-if="isOpen" class="slot-dropdown" v-click-outside="() => (isOpen = false)">
      <!-- Loaded spines -->
      <template v-if="loaderStore.spineSlots.length > 0">
        <div class="dropdown-group-label">Loaded spines</div>
        <button
          v-for="(slot, i) in loaderStore.spineSlots.filter(s => !s.error)"
          :key="slot.id"
          class="dropdown-item"
          :class="{ 'dropdown-item--active': isActiveLoaded(i) }"
          @click="selectLoaded(i, slot.name)"
        >
          <span class="dropdown-item-name">{{ slot.name }}</span>
        </button>
      </template>

      <div class="dropdown-divider" />

      <!-- Load from file -->
      <button class="dropdown-item dropdown-item--load" @click="openFilePicker">
        <span>📂 Load file…</span>
      </button>

      <!-- Clear -->
      <button
        v-if="currentSlot !== null"
        class="dropdown-item dropdown-item--clear"
        @click="clearSlot"
      >
        <span>✕ Clear</span>
      </button>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden-input"
      accept=".json,.skel,.atlas,.png,.jpg,.jpeg,.webp,.avif"
      @change="onFileInput"
    />
  </div>
</template>

<script setup lang="ts">
import { useCompareStore, type SpineSlotRef } from '@/core/stores/useCompareStore'
import { useLoaderStore } from '@/core/stores/useLoaderStore'

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps<{
  side: 'left' | 'right'
}>()

// ── Stores ─────────────────────────────────────────────────────────────────────

const compareStore = useCompareStore()
const loaderStore  = useLoaderStore()

// ── State ──────────────────────────────────────────────────────────────────────

const isOpen      = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const loadError    = ref<string | null>(null)

const currentSlot = computed(() =>
  props.side === 'left' ? compareStore.leftSlot : compareStore.rightSlot,
)

const currentLabel = computed(() => {
  if (!currentSlot.value) return props.side === 'left' ? 'A: No file…' : 'B: No file…'
  return currentSlot.value.label
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function isActiveLoaded(index: number): boolean {
  const slot = currentSlot.value
  return slot?.source === 'loaded' && slot.slotIndex === index
}

function selectLoaded(index: number, name: string) {
  const slotRef: SpineSlotRef = { source: 'loaded', slotIndex: index, label: name }
  if (props.side === 'left') compareStore.setLeft(slotRef)
  else compareStore.setRight(slotRef)
  isOpen.value = false
}

function clearSlot() {
  if (props.side === 'left') compareStore.setLeft(null)
  else compareStore.setRight(null)
  isOpen.value = false
}

function openFilePicker() {
  isOpen.value = false
  fileInputRef.value?.click()
}

async function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const files = Array.from(input.files)
  input.value = ''
  loadError.value = null
  const { error } = await compareStore.loadDirect(props.side, files)
  if (error) loadError.value = error
}

// ── Click-outside directive (simple) ──────────────────────────────────────────

type ElWithOutside = HTMLElement & { _clickOutside?: (e: MouseEvent) => void }

const vClickOutside = {
  mounted(el: ElWithOutside, binding: { value: () => void }) {
    el._clickOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) binding.value()
    }
    document.addEventListener('mousedown', el._clickOutside)
  },
  unmounted(el: ElWithOutside) {
    if (el._clickOutside) document.removeEventListener('mousedown', el._clickOutside)
    delete el._clickOutside
  },
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    vClickOutside: typeof vClickOutside
  }
}
</script>

<style scoped>
.file-slot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.slot-badge {
  font-size: 0.65rem;
  font-weight: 700;
  background: var(--c-raised);
  color: var(--c-text-muted);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.slot-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  min-width: 140px;
  max-width: 200px;
  color: var(--c-text-muted);
  font-size: 0.78rem;
  transition: border-color 0.12s;
}

.slot-btn:hover    { border-color: var(--c-text-ghost); }
.slot-btn--set     { border-color: #7c6af5; color: var(--c-text); }
.slot-btn--set:hover { border-color: #9d8fff; }

.slot-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.slot-arrow {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  flex-shrink: 0;
}

/* ── Dropdown ─────────────────────────────────────────────────────── */
.slot-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  min-width: 220px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dropdown-group-label {
  padding: 6px 12px 3px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-ghost);
}

.dropdown-divider {
  height: 1px;
  background: var(--c-border-dim);
  margin: 3px 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--c-text-dim);
  text-align: left;
  transition: background 0.1s;
}

.dropdown-item:hover { background: var(--c-raised); }

.dropdown-item--active { background: rgba(124, 106, 245, 0.1); color: #9d8fff; }

.dropdown-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item--load   { color: var(--c-text-muted); }
.dropdown-item--clear  { color: #f87171; }

.hidden-input { display: none; }
</style>
