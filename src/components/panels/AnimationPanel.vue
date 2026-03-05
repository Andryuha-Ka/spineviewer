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
        :leaf-only="true"
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
          :disabled="!skeletonStore.isLoaded"
          style="min-width: 72px"
          @click="animationStore.isPlaying ? animationStore.pause() : animationStore.play()"
        >{{ animationStore.isPlaying ? '⏸ Pause' : (animationStore.isPaused ? '▶ Resume' : '▶ Play') }}</n-button>

        <n-button
          size="small"
          :disabled="!skeletonStore.isLoaded"
          @click="emit('seekDelta', animationStore.currentTrack, -1 / 60)"
        >← 1f</n-button>
        <n-button
          size="small"
          :disabled="!skeletonStore.isLoaded"
          @click="emit('seekDelta', animationStore.currentTrack, 1 / 60)"
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
          <span class="entry-time">{{ trackTimeLabel(track) }}</span>
        </div>
        <div class="track-progress-wrap">
          <n-progress
            type="line"
            :percentage="trackPercent(track)"
            :show-indicator="false"
            :height="3"
            :border-radius="2"
            :color="track.trackIndex === animationStore.currentTrack ? '#4ade80' : '#3b82f6'"
            :rail-color="'#1e1e24'"
          />
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
import type { TrackState } from '@/core/types/ISpineAdapter'

const emit = defineEmits<{
  setAnimation:     [track: number, name: string, loop: boolean]
  addAnimation:     [track: number, name: string, loop: boolean]
  setTrackLoop:     [track: number, loop: boolean]
  removeQueueEntry: [track: number, index: number]
  clearTrack:       [track: number]
  clearTracks:      []
  seekDelta:        [track: number, deltaSeconds: number]
}>()

const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()

const isAddMode = ref(false)

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

function onCascaderSelect(value: string | number | Array<string | number> | null) {
  const name = typeof value === 'string' ? value : null
  if (!name) return
  if (isAddMode.value) {
    emit('addAnimation', animationStore.currentTrack, name, animationStore.loop)
  } else {
    emit('setAnimation', animationStore.currentTrack, name, animationStore.loop)
  }
}

function trackPercent(track: TrackState): number {
  if (!track.duration) return 0
  const t = track.loop
    ? (track.time % track.duration) / track.duration
    : Math.min(1, track.time / track.duration)
  return Math.round(t * 100)
}

function trackTimeLabel(track: TrackState): string {
  const cur = track.loop ? track.time % track.duration : Math.min(track.time, track.duration)
  return `${cur.toFixed(2)}s / ${track.duration.toFixed(2)}s`
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
  color: #666;
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
  background: #1a1a1e;
  border: 1px solid #2a2a2e;
  color: #666;
  border-radius: 4px;
  padding: 3px 0;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.12s;
}

.track-btn:disabled { opacity: 0.35; cursor: default; }
.track-btn:not(:disabled):hover { border-color: #444; color: #aaa; }

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
  color: #ccc;
  font-weight: 600;
  min-width: 38px;
  text-align: right;
}

/* ── Active tracks ───────────────────────── */
.active-tracks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-hint {
  font-size: 0.75rem;
  color: #444;
  text-align: center;
  padding: 6px 0;
}

/* ── Track block ─────────────────────────── */
.track-block {
  display: flex;
  flex-direction: column;
  border: 1px solid #2a2a2e;
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
  background: #1a1a1e;
  border-bottom: 1px solid #222226;
  font-size: 0.75rem;
}

.track-index {
  color: #555;
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
  color: #555;
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
  background: #141416;
}

.track-entry--queued {
  background: #111113;
}

.track-progress-wrap {
  padding: 0 8px 5px;
  background: #141416;
}

.entry-icon {
  font-size: 0.6rem;
  color: #444;
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

.track-entry--current .entry-name { color: #ccc; }
.track-entry--queued  .entry-name { color: #555; }

.entry-time {
  color: #555;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  font-size: 0.7rem;
}
</style>
