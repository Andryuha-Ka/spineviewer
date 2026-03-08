<!--
 * @file EventsPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="events-panel">
    <div v-if="!skeletonStore.isLoaded" class="empty-hint">
      Load a skeleton to see events
    </div>

    <template v-else>
      <!-- ── Controls ───────────────────────────────────────── -->
      <div class="controls">
        <n-input
          v-model:value="eventsStore.filter"
          size="tiny"
          placeholder="Filter…"
          clearable
          class="filter-input"
        />
        <n-button size="tiny" ghost @click="eventsStore.clear()">Clear</n-button>
        <n-button
          size="tiny"
          ghost
          :type="eventsStore.paused ? 'warning' : 'default'"
          @click="eventsStore.paused = !eventsStore.paused"
        >{{ eventsStore.paused ? '▶' : '⏸' }}</n-button>
      </div>

      <!-- no events defined hint -->
      <div v-if="skeletonStore.events.length === 0" class="empty-hint small">
        This skeleton has no events defined
      </div>

      <!-- ── Timeline ───────────────────────────────────────── -->
      <div v-if="timelineDuration > 0 && timelineTicks.length > 0" class="timeline-section">
        <div
          ref="timelineRef"
          class="timeline-bar"
          @mousemove="onTimelineHover"
          @mouseleave="hoveredTick = null"
          @click="onTimelineClick"
        >
          <div
            v-for="(tick, i) in timelineTicks"
            :key="i"
            class="timeline-tick"
            :style="{ left: `${(tick.time / timelineDuration) * 100}%`, background: nameColor(tick.name) }"
          />
          <div
            v-if="playheadPct >= 0"
            class="timeline-playhead"
            :style="{ left: `${playheadPct}%` }"
          />
          <div
            v-if="hoveredTick"
            class="timeline-tooltip"
            :style="{ left: `${clampPct(hoveredTick.time / timelineDuration)}%` }"
          >
            <strong>{{ hoveredTick.name }}</strong>
            <span>{{ hoveredTick.time.toFixed(3) }}s</span>
            <span v-if="hoveredTick.intValue">i:{{ hoveredTick.intValue }}</span>
            <span v-if="hoveredTick.floatValue">f:{{ hoveredTick.floatValue.toFixed(3) }}</span>
            <span v-if="hoveredTick.stringValue">"{{ hoveredTick.stringValue }}"</span>
          </div>
        </div>
        <div class="timeline-labels">
          <span>0s</span>
          <span>{{ timelineDuration.toFixed(2) }}s</span>
        </div>
      </div>

      <div class="divider" />

      <!-- ── Log ───────────────────────────────────────────── -->
      <div class="section-row">
        <span class="label">
          LOG
          <span class="count">({{ eventsStore.filteredLog.length }})</span>
        </span>
        <span class="fill-hint">{{ eventsStore.log.length }}/{{ MAX_LOG }}</span>
      </div>

      <div class="log-wrap">
        <div v-if="eventsStore.filteredLog.length === 0" class="empty-hint small">
          No events yet
        </div>
        <div v-else class="log-table">
          <div class="log-header-row">
            <span class="col-tr">Tr</span>
            <span class="col-time">Time</span>
            <span class="col-name">Event</span>
            <span class="col-val">Int</span>
            <span class="col-val">Float</span>
            <span class="col-str">Str</span>
          </div>
          <div
            v-for="(evt, i) in eventsStore.filteredLog"
            :key="i"
            class="log-row"
          >
            <span class="col-tr">{{ evt.trackIndex }}</span>
            <span class="col-time">{{ evt.time.toFixed(3) }}</span>
            <span class="col-name">
              <span
                class="evt-name-text"
                :style="{ color: nameColor(evt.name) }"
                :title="evt.name"
              >{{ evt.name }}</span>
              <button class="copy-btn" title="Copy name" @click="copyName(evt.name)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </span>
            <span class="col-val muted">{{ evt.intValue || '' }}</span>
            <span class="col-val muted">{{ evt.floatValue ? evt.floatValue.toFixed(3) : '' }}</span>
            <span class="col-str muted" :title="evt.stringValue">{{ evt.stringValue }}</span>
          </div>
        </div>
      </div>

      <div class="divider" />

      <!-- ── Statistics ─────────────────────────────────────── -->
      <div class="section-row">
        <span class="label">STATISTICS</span>
      </div>

      <div class="stats-list">
        <div v-if="eventsStore.eventStats.length === 0" class="empty-hint small">—</div>
        <div
          v-for="stat in eventsStore.eventStats"
          :key="stat.name"
          class="stat-row"
        >
          <span class="stat-dot" :style="{ background: nameColor(stat.name) }" />
          <span class="stat-name" :title="stat.name">{{ stat.name }}</span>
          <button class="copy-btn" title="Copy name" @click="copyName(stat.name)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <span class="stat-count">×{{ stat.count }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useEventsStore } from '@/core/stores/useEventsStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import type { SpineEvent } from '@/core/types/ISpineAdapter'

const MAX_LOG = 500

const emit = defineEmits<{ seek: [track: number, time: number] }>()

const eventsStore   = useEventsStore()
const skeletonStore = useSkeletonStore()
const animStore     = useAnimationStore()

const timelineRef = ref<HTMLDivElement | null>(null)
const hoveredTick = ref<SpineEvent | null>(null)

// ── Timeline helpers ─────────────────────────────────────────────────────────

const timelineDuration = computed(() => {
  if (animStore.tracks.length === 0) return 0
  return Math.max(...animStore.tracks.map(t => t.duration))
})

const playheadPct = computed(() => {
  if (!animStore.isPlaying || animStore.tracks.length === 0 || timelineDuration.value <= 0) return -1
  const t = animStore.tracks[0]
  const time = t.loop ? t.time % t.duration : Math.min(t.time, t.duration)
  return (time / timelineDuration.value) * 100
})

// Deduplicated (name, time) pairs for timeline ticks
const timelineTicks = computed(() => {
  const seen = new Set<string>()
  const result: SpineEvent[] = []
  for (const e of eventsStore.log) {
    const key = `${e.name}:${e.time.toFixed(2)}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(e)
    }
  }
  return result
})

// Color palette — deterministic hash per event name
const PALETTE = ['#7c6af5', '#4ade80', '#60a5fa', '#f87171', '#facc15', '#fb923c', '#a78bfa', '#34d399']

function nameColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function clampPct(pct: number): number {
  return Math.max(5, Math.min(95, pct * 100))
}

function onTimelineHover(e: MouseEvent) {
  const el = timelineRef.value
  if (!el || timelineDuration.value <= 0) return
  const rect  = el.getBoundingClientRect()
  const mouseX = e.clientX - rect.left

  let best: SpineEvent | null = null
  let bestDist = Infinity
  for (const tick of timelineTicks.value) {
    const tickX = (tick.time / timelineDuration.value) * rect.width
    const dist  = Math.abs(mouseX - tickX)
    if (dist < bestDist && dist < 12) {
      bestDist = dist
      best = tick
    }
  }
  hoveredTick.value = best
}

function onTimelineClick(e: MouseEvent) {
  const el = timelineRef.value
  if (!el || timelineDuration.value <= 0 || animStore.tracks.length === 0) return
  const rect = el.getBoundingClientRect()
  const pct  = (e.clientX - rect.left) / rect.width
  const time = Math.max(0, Math.min(pct * timelineDuration.value, timelineDuration.value))
  emit('seek', animStore.tracks[0].trackIndex, time)
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────

async function copyName(name: string) {
  try {
    await navigator.clipboard.writeText(name)
  } catch {
    // silent fail (e.g. no clipboard permission)
  }
}
</script>

<style scoped>
.events-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-size: 0.75rem;
  color: var(--c-text);
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.events-panel::-webkit-scrollbar { width: 4px; }
.events-panel::-webkit-scrollbar-track { background: transparent; }
.events-panel::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }

/* ── Controls ── */
.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 6px;
  flex-shrink: 0;
}

.filter-input { flex: 1; }

/* ── Timeline ── */
.timeline-section {
  padding: 0 10px 4px;
  flex-shrink: 0;
}

.timeline-bar {
  position: relative;
  height: 28px;
  background: var(--c-border-dim);
  border-radius: 4px;
  overflow: visible;
  cursor: crosshair;
}

.timeline-tick {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: 1px;
  transform: translateX(-50%);
  pointer-events: none;
  opacity: 0.85;
}

.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--c-text-faint);
  transform: translateX(-50%);
  pointer-events: none;
}

.timeline-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: var(--c-raised);
  border: 1px solid var(--c-border);
  border-radius: 5px;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 0.68rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  color: var(--c-text-dim);
}

.timeline-tooltip strong {
  color: var(--c-text);
  font-size: 0.72rem;
}

.timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 0.62rem;
  color: var(--c-text-ghost);
}

/* ── Divider ── */
.divider {
  height: 1px;
  background: var(--c-border-dim);
  flex-shrink: 0;
}

/* ── Section row ── */
.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 2px;
  flex-shrink: 0;
}

.label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.count { font-weight: 400; color: var(--c-text-faint); }

.fill-hint {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
}

/* ── Log ── */
.log-wrap {
  overflow-y: auto;
  max-height: 220px;
  flex-shrink: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.log-wrap::-webkit-scrollbar { width: 4px; }
.log-wrap::-webkit-scrollbar-track { background: transparent; }
.log-wrap::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }

.log-table { display: flex; flex-direction: column; }

.log-header-row,
.log-row {
  display: grid;
  grid-template-columns: 18px 44px 1fr 28px 46px 50px;
  align-items: center;
  gap: 3px;
  padding: 1px 10px;
  font-size: 0.7rem;
}

.log-header-row {
  font-size: 0.62rem;
  color: var(--c-text-ghost);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  position: sticky;
  top: 0;
  background: var(--c-surface);
  padding-bottom: 2px;
}

.log-row:hover { background: var(--c-raised); }

.col-tr   { text-align: center; color: var(--c-text-faint); }
.col-time { font-variant-numeric: tabular-nums; color: var(--c-text-faint); }
.col-name { display: flex; align-items: center; gap: 3px; min-width: 0; }
.col-val  { font-variant-numeric: tabular-nums; text-align: right; }
.col-str  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.evt-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  font-weight: 500;
  font-size: 0.7rem;
}

.muted { color: var(--c-text-faint); }

/* ── Copy button ── */
.copy-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  padding: 1px 3px;
  line-height: 1;
  border-radius: 3px;
  transition: color 0.12s;
}

.copy-btn:hover { color: var(--c-text-muted); background: var(--c-raised); }

/* ── Stats ── */
.stats-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 10px 10px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 4px;
  border-radius: 4px;
  min-height: 20px;
}

.stat-row:hover { background: var(--c-raised); }

.stat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-dim);
}

.stat-count {
  flex-shrink: 0;
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
  font-size: 0.68rem;
}

/* ── Empty hint ── */
.empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}

.empty-hint.small {
  padding: 4px 10px 6px;
  text-align: left;
}
</style>
