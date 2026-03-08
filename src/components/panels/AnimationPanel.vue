<!--
 * @file AnimationPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="anim-panel">

    <!-- ── Animation selector ─────────────────────────────── -->
    <section class="section">
      <label class="label">Animation</label>
      <n-cascader
        v-model:value="selectedAnimation"
        :options="cascaderOptions"
        :disabled="!skeletonStore.isLoaded"
        placeholder="Select animation…"
        size="small"
        expand-trigger="click"
        :show-path="true"
        check-strategy="child"
        clearable
        style="width: 100%"
        @update:value="onCascaderSelect"
      />
    </section>

    <!-- ── Track selector ─────────────────────────────────── -->
    <section class="section">
      <label class="label">Track</label>
      <div class="track-grid">
        <button
          v-for="i in 12"
          :key="i - 1"
          class="track-btn"
          :class="{
            'track-btn--active': animationStore.currentTrack === i - 1,
            'track-btn--running': isTrackRunning(i - 1),
          }"
          :disabled="!skeletonStore.isLoaded"
          @click="animationStore.currentTrack = i - 1"
        >{{ i - 1 }}</button>
      </div>
    </section>

    <!-- ── Action buttons ─────────────────────────────────── -->
    <section class="section">
      <div class="btn-row">
        <n-button
          size="small"
          :type="isAddMode ? 'primary' : 'default'"
          :disabled="!skeletonStore.isLoaded"
          @click="isAddMode = !isAddMode"
        >{{ isAddMode ? '+ Add mode ON' : '+ Add mode' }}</n-button>
      </div>
    </section>

    <n-divider style="margin: 6px 0" />

    <!-- ── Playback controls ──────────────────────────────── -->
    <section class="section">
      <div class="playback-row">
        <n-button
          size="small"
          :type="animationStore.isPlaying ? 'default' : 'primary'"
          :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
          style="min-width: 72px"
          @click="animationStore.isPlaying ? animationStore.pause() : animationStore.play()"
        >{{ animationStore.isPlaying ? '⏸ Pause' : (animationStore.isPaused ? '▶ Resume' : '▶ Play') }}</n-button>

        <n-button
          size="small"
          :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
          @click="seekAllDelta(-1 / 60)"
        >← 1f</n-button>
        <n-button
          size="small"
          :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
          @click="seekAllDelta(1 / 60)"
        >1f →</n-button>
      </div>
    </section>

    <!-- ── Loop ──────────────────────────────────────────── -->
    <section class="section section--row">
      <label class="label">Loop</label>
      <n-switch v-model:value="animationStore.loop" size="small" :disabled="!skeletonStore.isLoaded" />
    </section>

    <!-- ── Speed ─────────────────────────────────────────── -->
    <section class="section">
      <div class="speed-header">
        <label class="label">Speed</label>
        <div class="speed-right">
          <span class="speed-value">{{ animationStore.speed.toFixed(2) }}×</span>
          <n-button
            size="tiny"
            :disabled="!skeletonStore.isLoaded || animationStore.speed === 1"
            @click="animationStore.speed = 1"
          >1×</n-button>
        </div>
      </div>
      <n-slider
        v-model:value="animationStore.speed"
        :min="0" :max="3" :step="0.01"
        :disabled="!skeletonStore.isLoaded"
        :marks="{ 1: '' }"
      />
    </section>

    <n-divider style="margin: 6px 0" />

    <!-- ── Skins ─────────────────────────────────────────── -->
    <section class="section">
      <div class="skins-header">
        <label class="label">Skins</label>
        <n-button
          size="tiny"
          :type="composerMode ? 'primary' : 'default'"
          :disabled="!skeletonStore.isLoaded || skeletonStore.skins.length < 2"
          @click="onToggleComposer"
        >Composer</n-button>
      </div>

      <div v-if="skeletonStore.isLoaded && skeletonStore.skins.length === 0" class="empty-hint">
        No skins
      </div>

      <div v-else-if="skeletonStore.isLoaded" class="skin-list">
        <div
          v-for="skin in skeletonStore.skins"
          :key="skin"
          class="skin-row"
          @click="onSkinRowClick(skin)"
        >
          <n-radio
            v-if="!composerMode"
            size="small"
            :checked="selectedSkin === skin"
            :disabled="!skeletonStore.isLoaded"
            @change.stop="onSingleSkinSelect(skin)"
          />
          <n-checkbox
            v-else
            size="small"
            :checked="composerSkins.has(skin)"
            :disabled="!skeletonStore.isLoaded"
            @update:checked="toggleComposerSkin(skin, $event)"
            @click.stop
          />
          <span class="skin-name">{{ skin }}</span>
          <n-button size="tiny" class="copy-btn" @click.stop="copyName(skin)" title="Copy name">⎘</n-button>
        </div>
      </div>
    </section>

    <n-divider style="margin: 6px 0" />

    <!-- ── Active tracks ──────────────────────────────────── -->
    <section class="section">
      <div class="active-tracks-header">
        <label class="label">Active tracks</label>
        <n-button
          size="tiny"
          :disabled="!skeletonStore.isLoaded || animationStore.tracks.length === 0"
          @click="emit('clearTracks')"
        >Clear All</n-button>
      </div>

      <div v-if="animationStore.tracks.length === 0" class="empty-hint">
        No active tracks
      </div>

      <div
        v-for="track in animationStore.tracks"
        :key="track.trackIndex"
        class="track-block"
        :class="{ 'track-block--active': track.trackIndex === animationStore.currentTrack }"
      >
        <!-- Block header: shared controls for the whole track -->
        <div class="track-block-header">
          <n-checkbox
            size="small"
            :checked="animationStore.isTrackEnabled(track.trackIndex)"
            @update:checked="animationStore.setTrackEnabled(track.trackIndex, $event)"
          />
          <label class="track-loop-label">
            <n-checkbox
              size="small"
              :checked="track.loop"
              @update:checked="emit('setTrackLoop', track.trackIndex, $event)"
            />
            <span class="track-loop-text">Loop</span>
          </label>
          <span class="track-index">#{{ track.trackIndex }}</span>
          <span class="block-spacer" />
          <n-button size="tiny" @click="emit('clearTrack', track.trackIndex)">✕</n-button>
        </div>

        <!-- Currently playing entry -->
        <div class="track-entry track-entry--current">
          <span class="entry-icon">▶</span>
          <span class="entry-name">{{ track.animationName }}</span>
        </div>

        <!-- Queued entries -->
        <div
          v-for="(entry, i) in track.queue"
          :key="i"
          class="track-entry track-entry--queued"
        >
          <span class="entry-icon">⏭</span>
          <span class="entry-name">{{ entry.animationName }}</span>
          <n-button
            size="tiny"
            style="margin-left: auto; flex-shrink: 0"
            @click="emit('removeQueueEntry', track.trackIndex, i)"
          >✕</n-button>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import type { CascaderOption } from 'naive-ui'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { buildCascaderOptions } from '@/core/utils/buildCascaderOptions'

const emit = defineEmits<{
  setAnimation:     [track: number, name: string, loop: boolean]
  addAnimation:     [track: number, name: string, loop: boolean]
  setTrackLoop:     [track: number, loop: boolean]
  removeQueueEntry: [track: number, index: number]
  clearTrack:       [track: number]
  clearTracks:      []
  seekDelta:        [track: number, deltaSeconds: number]
  setSkins:         [names: string[]]
}>()

const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()

const isAddMode = ref(false)

// ── Skins state ────────────────────────────────────────────────────────────
const composerMode  = ref(false)
const selectedSkin  = ref<string | null>(null)
const composerSkins = ref(new Set<string>())

watch(() => skeletonStore.skins, () => {
  selectedSkin.value  = null
  composerSkins.value = new Set()
  composerMode.value  = false
})

function onToggleComposer() {
  if (!composerMode.value) {
    composerSkins.value = selectedSkin.value ? new Set([selectedSkin.value]) : new Set()
  } else {
    const arr = [...composerSkins.value]
    selectedSkin.value = arr.length === 1 ? arr[0] : null
  }
  composerMode.value = !composerMode.value
}

function onSkinRowClick(skin: string) {
  if (composerMode.value) {
    toggleComposerSkin(skin, !composerSkins.value.has(skin))
  } else {
    onSingleSkinSelect(skin)
  }
}

function onSingleSkinSelect(skin: string) {
  selectedSkin.value = skin
  emit('setSkins', [skin])
}

function toggleComposerSkin(skin: string, checked: boolean) {
  const next = new Set(composerSkins.value)
  if (checked) next.add(skin)
  else next.delete(skin)
  composerSkins.value = next
  emit('setSkins', [...next])
}

function copyName(name: string) {
  navigator.clipboard.writeText(name).catch(() => {})
}

const cascaderOptions = computed<CascaderOption[]>(() =>
  buildCascaderOptions(skeletonStore.animations),
)

const selectedAnimation = computed<string | null>({
  get: () => animationStore.selectedAnimation,
  set: (v) => { animationStore.selectedAnimation = v },
})

function isTrackRunning(index: number): boolean {
  return animationStore.tracks.some(t => t.trackIndex === index)
}

function seekAllDelta(delta: number) {
  for (const track of animationStore.tracks) {
    emit('seekDelta', track.trackIndex, delta)
  }
}

function onCascaderSelect(value: string | number | Array<string | number> | null) {
  const name = typeof value === 'string' ? value : null
  if (!name) return
  if (isAddMode.value) {
    emit('addAnimation', animationStore.currentTrack, name, animationStore.loop)
  } else {
    emit('setAnimation', animationStore.currentTrack, name, animationStore.loop)
  }
}

</script>

<style scoped>
.anim-panel {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.label {
  font-size: 0.72rem;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Track grid ──────────────────────────── */
.track-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.track-btn {
  background: var(--c-raised);
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 4px;
  padding: 3px 0;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.12s;
}

.track-btn:disabled { opacity: 0.35; cursor: default; }
.track-btn:not(:disabled):hover { border-color: var(--c-text-ghost); color: var(--c-text-dim); }

.track-btn--active {
  border-color: #4ade80 !important;
  color: #4ade80 !important;
}

.track-btn--running {
  border-color: #3b82f6;
  color: #3b82f6;
}

.track-btn--active.track-btn--running {
  border-color: #4ade80 !important;
  color: #4ade80 !important;
}

/* ── Button rows ─────────────────────────── */
.btn-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.playback-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.speed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.speed-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.speed-value {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--c-text-dim);
  font-weight: 600;
  min-width: 38px;
  text-align: right;
}

/* ── Skins ───────────────────────────────── */
.skins-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skin-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.skin-list::-webkit-scrollbar {
  width: 4px;
}

.skin-list::-webkit-scrollbar-track {
  background: transparent;
}

.skin-list::-webkit-scrollbar-thumb {
  background: var(--c-scroll);
  border-radius: 2px;
}

.skin-list::-webkit-scrollbar-thumb:hover {
  background: var(--c-scroll-hov);
}

.skin-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.skin-row:hover { background: var(--c-raised); }

.skin-name {
  flex: 1;
  font-size: 0.75rem;
  color: var(--c-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s;
}

.skin-row:hover .copy-btn { opacity: 1; }

/* ── Active tracks ───────────────────────── */
.active-tracks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  text-align: center;
  padding: 6px 0;
}

/* ── Track block ─────────────────────────── */
.track-block {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  overflow: hidden;
}

.track-block--active {
  border-color: #3b82f6;
}

.track-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--c-raised);
  border-bottom: 1px solid var(--c-border-dim);
  font-size: 0.75rem;
}

.track-index {
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.block-spacer { flex: 1; }

.track-loop-label {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  flex-shrink: 0;
}

.track-loop-text {
  font-size: 0.7rem;
  color: var(--c-text-faint);
}

/* ── Track entries ───────────────────────── */
.track-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
}

.track-entry--current {
  background: var(--c-surface);
}

.track-entry--queued {
  background: var(--c-sunken);
}

.entry-icon {
  font-size: 0.6rem;
  color: var(--c-text-ghost);
  flex-shrink: 0;
  width: 12px;
  text-align: center;
}

.entry-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-entry--current .entry-name { color: var(--c-text-dim); }
.track-entry--queued  .entry-name { color: var(--c-text-faint); }
</style>
