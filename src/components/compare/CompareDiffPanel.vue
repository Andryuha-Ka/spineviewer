<!--
 * @file CompareDiffPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="diff-panel">
    <!-- Summary bar -->
    <div class="summary-bar">
      <div class="summary-labels">
        <span class="summary-spine">
          <span class="summary-badge summary-badge--a">A</span>
          {{ labelA }}
        </span>
        <span class="summary-sep">vs</span>
        <span class="summary-spine">
          <span class="summary-badge summary-badge--b">B</span>
          {{ labelB }}
        </span>
      </div>
      <div v-if="diff" class="summary-counts">
        <template v-if="criticalIssuesTotal === 0 && warnIssuesTotal === 0">
          <span class="count count--ok">reskin ok</span>
          <span class="count-sep">·</span>
        </template>
        <template v-else>
          <span v-if="criticalIssuesTotal > 0" class="count count--critical">{{ criticalIssuesTotal }} critical</span>
          <span v-if="criticalIssuesTotal > 0 && warnIssuesTotal > 0" class="count-sep">·</span>
          <span v-if="warnIssuesTotal > 0" class="count count--warn">{{ warnIssuesTotal }} warn</span>
          <span class="count-sep">·</span>
        </template>
        <span class="source-badge">{{ diff.source === 'json-full' ? 'JSON' : 'runtime' }}</span>
      </div>
      <div v-else-if="diffStatus === 'running'" class="summary-running">Running diff…</div>
      <div v-else-if="diffStatus === 'error'" class="summary-error">{{ diffError }}</div>
      <div v-else class="summary-idle">No diff yet — press ⚡ Run Diff</div>
    </div>

    <!-- Filter + panel controls -->
    <div class="panel-controls">
      <div class="filter-toggle">
        <button
          class="filter-btn"
          :class="{ 'filter-btn--active': !diffsOnly }"
          @click="diffsOnly = false"
        >All</button>
        <button
          class="filter-btn"
          :class="{ 'filter-btn--active': diffsOnly }"
          @click="diffsOnly = true"
        >Differences only</button>
      </div>
    </div>

    <!-- Diff content -->
    <div class="diff-content">
      <template v-if="diff">

        <!-- ── Reskin Overview ── -->
        <div class="overview-section">
          <!-- Header -->
          <div class="ov-header" @click="ovExpanded = !ovExpanded">
            <span class="ov-toggle">{{ ovExpanded ? '−' : '+' }}</span>
            <span class="ov-title">🎬 Reskin Overview</span>
            <span class="ov-counts">
              <span v-if="animNameIssues > 0"    class="ov-badge ov-badge--err">{{ animNameIssues }} anim</span>
              <span v-if="animDurIssues > 0"     class="ov-badge ov-badge--warn">{{ animDurIssues }} dur</span>
              <span v-if="skinTableIssues > 0"   class="ov-badge ov-badge--err">{{ skinTableIssues }} skin</span>
              <span v-if="globalEventIssues > 0"      class="ov-badge ov-badge--err">{{ globalEventIssues }} event</span>
              <span v-if="animEventNameIssues > 0"   class="ov-badge ov-badge--err">{{ animEventNameIssues }} ev name</span>
              <span v-if="animEventTimingIssues > 0" class="ov-badge ov-badge--warn">{{ animEventTimingIssues }} ev time</span>
              <span v-if="changedPlaceholders > 0"         class="ov-badge ov-badge--err">{{ changedPlaceholders }} ph</span>
              <span v-if="constraintCriticalIssues > 0"   class="ov-badge ov-badge--err">{{ constraintCriticalIssues }} cstr</span>
              <span v-if="constraintParamIssues > 0"      class="ov-badge ov-badge--warn">{{ constraintParamIssues }} cstr param</span>

              <span v-if="animNameIssues === 0 && skinTableIssues === 0 && globalEventIssues === 0 && animEventNameIssues === 0 && changedPlaceholders === 0 && constraintCriticalIssues === 0" class="ov-badge ov-badge--ok">ok</span>
            </span>
          </div>

          <template v-if="ovExpanded">
            <!-- Animation table -->
            <div class="ov-sub-header">
              <span class="ov-sub-title">{{ animTableIssues > 0 ? '⚠ ' : '' }}Animations</span>
              <span class="ov-sub-hint">{{ diff.animTable.length }} total</span>
            </div>
            <div
              v-for="row in visibleAnimTable"
              :key="row.name"
              class="anim-row"
              :class="`anim-row--${row.status}`"
            >
              <span class="anim-row-icon">{{ animRowIcon(row.status) }}</span>
              <span class="anim-row-name">{{ row.name }}</span>
              <span class="anim-row-delta">{{ (row.status === 'delta' && row.durA !== null && row.durB !== null) ? formatDelta(row.durA, row.durB) : '' }}</span>
              <span class="anim-row-dur" :class="durAClass">{{ row.durA !== null ? row.durA.toFixed(2) + 's' : '—' }}</span>
              <span class="anim-row-dur" :class="durBClass">{{ row.durB !== null ? row.durB.toFixed(2) + 's' : '—' }}</span>
            </div>
            <div v-if="diffsOnly && diff.animTable.every(r => r.status === 'ok')" class="ov-empty">All animations match</div>

            <!-- Skins -->
            <div class="ov-sub-header">
              <span class="ov-sub-title">{{ skinTableIssues > 0 ? '⚠ ' : '' }}Skins</span>
              <span class="ov-sub-hint">{{ diff.skinTable.length }} total</span>
            </div>
            <div v-if="diff.skinTable.length === 0" class="ov-empty">No skins</div>
            <template v-else>
              <div
                v-for="sk in visibleSkinTable"
                :key="sk.name"
                class="anim-row"
                :class="sk.status === 'ok' ? 'anim-row--ok' : sk.status === 'only-a' ? 'anim-row--only-a' : 'anim-row--only-b'"
              >
                <span class="anim-row-icon">{{ sk.status === 'ok' ? '✓' : sk.status === 'only-a' ? '−' : '+' }}</span>
                <span class="anim-row-name">{{ sk.name }}</span>
                <span class="ev-global-status">{{ sk.status === 'ok' ? 'both' : sk.status === 'only-a' ? 'A only' : 'B only' }}</span>
              </div>
              <div v-if="diffsOnly && diff.skinTable.every(s => s.status === 'ok')" class="ov-empty">All skins match</div>
            </template>

            <!-- Global events (always visible) -->
            <div class="ov-sub-header ov-sub-header--events">
              <span class="ov-sub-title">{{ globalEventIssues > 0 ? '⚠ ' : '' }}Events</span>
              <span class="ov-sub-hint">{{ diff.globalEvents.length }} total</span>
            </div>
            <div v-if="diff.globalEvents.length === 0" class="ov-empty">No events defined</div>
            <template v-else>
              <div
                v-for="ev in visibleGlobalEvents"
                :key="ev.name"
                class="anim-row"
                :class="ev.status === 'ok' ? 'anim-row--ok' : ev.status === 'only-a' ? 'anim-row--only-a' : 'anim-row--only-b'"
              >
                <span class="anim-row-icon">{{ ev.status === 'ok' ? '✓' : ev.status === 'only-a' ? '−' : '+' }}</span>
                <span class="anim-row-name">{{ ev.name }}</span>
                <span class="ev-global-status">{{ ev.status === 'ok' ? 'both' : ev.status === 'only-a' ? 'A only' : 'B only' }}</span>
              </div>
              <div v-if="diffsOnly && diff.globalEvents.every(e => e.status === 'ok')" class="ov-empty">All events match</div>
            </template>

            <!-- Per-animation event timing (JSON only) -->
            <template v-if="diff.animEvents.length > 0">
              <div class="ov-sub-header ov-sub-header--events">
                <span class="ov-sub-title">Event timing per animation</span>
                <span class="ov-sub-hint">{{ diff.animEvents.length }} anim</span>
              </div>
              <template v-for="group in visibleAnimEvents" :key="group.animName">
                <div
                  class="ev-group-header"
                  :class="{ 'ev-group-header--changed': group.hasChanges }"
                  @click="toggleEvGroup(group.animName)"
                >
                  <span class="ev-group-toggle">{{ evGroupExpanded.has(group.animName) ? '−' : '+' }}</span>
                  <span class="ev-group-name">{{ group.animName }}</span>
                  <span v-if="group.hasChanges" class="ev-group-badge">{{ group.events.filter(e => e.status !== 'ok').length }} changed</span>
                  <span v-else class="ev-group-ok">✓</span>
                </div>
                <template v-if="evGroupExpanded.has(group.animName)">
                  <div
                    v-for="ev in visibleEventRows(group)"
                    :key="`${ev.eventName}::${ev.idx}`"
                    class="ev-row"
                    :class="`ev-row--${ev.status}`"
                  >
                    <span class="ev-row-icon">{{ animRowIcon(ev.status) }}</span>
                    <span class="ev-row-name">{{ ev.eventName }}<span v-if="ev.idx > 0" class="ev-row-idx">[{{ ev.idx }}]</span></span>
                    <span class="ev-row-delta">{{ (ev.status === 'delta' && ev.timeA !== null && ev.timeB !== null) ? formatDelta(ev.timeA, ev.timeB) : '' }}</span>
                    <span class="ev-row-time" :class="durAClass">{{ ev.timeA !== null ? ev.timeA.toFixed(3) + 's' : '—' }}</span>
                    <span class="ev-row-time" :class="durBClass">{{ ev.timeB !== null ? ev.timeB.toFixed(3) + 's' : '—' }}</span>
                  </div>
                </template>
              </template>
            </template>
            <div v-else-if="diff.source === 'json-full'" class="ov-empty ov-empty--hint">No event timelines in animations</div>
            <div v-else class="ov-empty ov-empty--hint">Event timing: JSON files only</div>

            <!-- Placeholders -->
            <div class="ov-sub-header ov-sub-header--ph">
              <span class="ov-sub-title">{{ changedPlaceholders > 0 ? '⚠ ' : '' }}Placeholders</span>
              <span class="ov-sub-hint">
                {{ diff.placeholders.length }} total
                <template v-if="changedPlaceholders > 0"> · {{ changedPlaceholders }} changed</template>
              </span>
            </div>
            <div v-if="diff.placeholders.length === 0" class="ov-empty">No placeholder elements found</div>
            <template v-else>
              <template v-for="ph in visiblePlaceholders" :key="`${ph.kind}::${ph.name}`">
                <div
                  class="ph-item"
                  :class="[
                    `ph-item--${ph.status}`,
                    { 'ph-item--clickable': ph.kind !== 'attachment', 'ph-item--selected': isHighlightedPh(ph) },
                  ]"
                  @click="onPhClick(ph)"
                >
                  <span class="ph-status-icon">{{ statusIcon(ph.status) }}</span>
                  <span class="ph-kind">{{ ph.kind }}:</span>
                  <span class="ph-name">{{ ph.name }}</span>
                  <span class="ph-status-label">{{ ph.status.toUpperCase() }}</span>
                </div>
                <div
                  v-for="param in ph.params.filter(p => p.changed || !diffsOnly)"
                  :key="`${ph.name}::${param.key}`"
                  class="ph-param"
                  :class="{ 'ph-param--critical': param.critical }"
                >
                  <span class="ph-param-key">{{ param.key }}</span>
                  <template v-if="param.changed">
                    <span class="ph-param-val ph-param-val--a">{{ param.valueA }}</span>
                    <span class="ph-param-arrow">→</span>
                    <span class="ph-param-val ph-param-val--b">{{ param.valueB }}</span>
                    <span v-if="param.critical" class="ph-critical-badge">⚠ critical</span>
                  </template>
                  <template v-else>
                    <span class="ph-param-val ph-param-val--eq">{{ param.valueA }}</span>
                  </template>
                </div>
              </template>
            </template>

            <!-- Constraints -->
            <div class="ov-sub-header">
              <span class="ov-sub-title">{{ constraintTableIssues > 0 ? '⚠ ' : '' }}Constraints</span>
              <span class="ov-sub-hint">{{ diff.constraintTable.length }} total</span>
            </div>
            <template v-if="diff.constraintTable.length === 0">
              <div class="ov-empty ov-empty--hint">No constraints (JSON only)</div>
            </template>
            <template v-else>
              <div
                v-for="row in visibleConstraintTable"
                :key="`${row.kind}::${row.name}`"
                class="anim-row"
                :class="row.status === 'ok' ? 'anim-row--ok' : row.status === 'only-a' ? 'anim-row--only-a' : row.status === 'only-b' ? 'anim-row--only-b' : 'anim-row--delta'"
              >
                <span class="anim-row-icon">{{ animRowIcon(row.status) }}</span>
                <span class="cstr-kind">[{{ row.kind }}]</span>
                <span class="anim-row-name">{{ row.name }}</span>
                <span v-if="row.bonesChanged"  class="cstr-tag cstr-tag--critical">bones</span>
                <span v-if="row.targetChanged" class="cstr-tag cstr-tag--critical">target</span>
                <span v-if="row.paramsChanged && !row.bonesChanged && !row.targetChanged" class="cstr-tag cstr-tag--param">params</span>
                <span v-if="row.status === 'ok'" class="anim-row-icon" style="color:#4ade80">✓</span>
              </div>
              <div v-if="diffsOnly && diff.constraintTable.every(r => r.status === 'ok')" class="ov-empty">All constraints match</div>
            </template>
          </template>
        </div>

        <!-- Other sections -->
        <CompareDiffSection
          v-for="section in filteredSections"
          :key="section.id"
          :section="section"
          :diffs-only="diffsOnly"
          :highlight-kind="section.id === 'bones' ? 'bone' : section.id === 'slots' ? 'slot' : undefined"
          :selected-name="compareStore.selectedHighlight?.name ?? null"
          @item-click="(key) => compareStore.setHighlight(key, section.id === 'bones' ? 'bone' : 'slot')"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import CompareDiffSection from './CompareDiffSection.vue'
import { useCompareStore } from '@/core/stores/useCompareStore'
import type { PlaceholderDiff, AnimEventGroup, GlobalEventRow, SkinRow, ConstraintRow } from '@/core/utils/spineCompare'

const compareStore = useCompareStore()

const diff       = computed(() => compareStore.diff)
const diffStatus = computed(() => compareStore.diffStatus)
const diffError  = computed(() => compareStore.diffError)

const diffsOnly  = ref(false)
const ovExpanded = ref(true)
const evGroupExpanded = ref(new Set<string>())

const labelA = computed(() => {
  const s = compareStore.leftSlot
  if (!s) return 'No file'
  return s.label
})

const labelB = computed(() => {
  const s = compareStore.rightSlot
  if (!s) return 'No file'
  return s.label
})

// ── Reskin overview computed ────────────────────────────────────────────────

const animNameIssues = computed(() =>
  diff.value?.animTable.filter(r => r.status === 'only-a' || r.status === 'only-b').length ?? 0,
)

const animDurIssues = computed(() =>
  diff.value?.animTable.filter(r => r.status === 'delta').length ?? 0,
)

const animTableIssues = computed(() => animNameIssues.value + animDurIssues.value)

const durAClass = computed(() => compareStore.masterSide === 'left' ? 'anim-row-dur--master' : 'anim-row-dur--variant')
const durBClass = computed(() => compareStore.masterSide === 'right' ? 'anim-row-dur--master' : 'anim-row-dur--variant')

const skinTableIssues = computed(() =>
  diff.value?.skinTable.filter(s => s.status !== 'ok').length ?? 0,
)

const globalEventIssues = computed(() =>
  diff.value?.globalEvents.filter(e => e.status !== 'ok').length ?? 0,
)

const animEventNameIssues = computed(() =>
  diff.value?.animEvents.reduce((sum, g) => sum + g.events.filter(e => e.status === 'only-a' || e.status === 'only-b').length, 0) ?? 0,
)

const animEventTimingIssues = computed(() =>
  diff.value?.animEvents.reduce((sum, g) => sum + g.events.filter(e => e.status === 'delta').length, 0) ?? 0,
)


const visibleSkinTable = computed<SkinRow[]>(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.skinTable.filter(s => s.status !== 'ok')
    : diff.value.skinTable
})

const visibleGlobalEvents = computed<GlobalEventRow[]>(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.globalEvents.filter(e => e.status !== 'ok')
    : diff.value.globalEvents
})

const visibleAnimTable = computed(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.animTable.filter(r => r.status !== 'ok')
    : diff.value.animTable
})

const visibleAnimEvents = computed(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.animEvents.filter(g => g.hasChanges)
    : diff.value.animEvents
})

function visibleEventRows(group: AnimEventGroup) {
  return diffsOnly.value ? group.events.filter(e => e.status !== 'ok') : group.events
}

function toggleEvGroup(animName: string) {
  const set = new Set(evGroupExpanded.value)
  if (set.has(animName)) set.delete(animName)
  else set.add(animName)
  evGroupExpanded.value = set
}

function animRowIcon(status: string): string {
  switch (status) {
    case 'ok':     return '✓'
    case 'delta':  return '~'
    case 'only-a': return '−'
    case 'only-b': return '+'
    default:       return '?'
  }
}

function formatDelta(a: number, b: number): string {
  const ms = Math.round((b - a) * 1000)
  return (ms > 0 ? '+' : '') + ms + 'ms'
}

// ── Placeholder computed ────────────────────────────────────────────────────

const changedPlaceholders = computed(() => {
  if (!diff.value) return 0
  return diff.value.placeholders.filter(p => p.status !== 'equal').length
})

const visiblePlaceholders = computed<PlaceholderDiff[]>(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.placeholders.filter(p => p.status !== 'equal')
    : diff.value.placeholders
})

// ── Constraint table computed ─────────────────────────────────────────────────

const constraintCriticalIssues = computed(() =>
  diff.value?.constraintTable.filter(r =>
    r.status === 'only-a' || r.status === 'only-b' ||
    (r.status === 'changed' && (r.bonesChanged || r.targetChanged)),
  ).length ?? 0,
)

const constraintParamIssues = computed(() =>
  diff.value?.constraintTable.filter(r =>
    r.status === 'changed' && !r.bonesChanged && !r.targetChanged && r.paramsChanged,
  ).length ?? 0,
)

const constraintTableIssues = computed(() => constraintCriticalIssues.value + constraintParamIssues.value)

const criticalIssuesTotal = computed(() =>
  animNameIssues.value + skinTableIssues.value + globalEventIssues.value +
  animEventNameIssues.value + changedPlaceholders.value + constraintCriticalIssues.value,
)
const warnIssuesTotal = computed(() =>
  animDurIssues.value + animEventTimingIssues.value + constraintParamIssues.value,
)


const visibleConstraintTable = computed<ConstraintRow[]>(() => {
  if (!diff.value) return []
  return diffsOnly.value
    ? diff.value.constraintTable.filter(r => r.status !== 'ok')
    : diff.value.constraintTable
})

// ids moved to Reskin Overview — don't duplicate in generic sections
const OVERVIEW_SECTION_IDS = new Set(['animations', 'events', 'skins', 'constraints'])

const filteredSections = computed(() => {
  if (!diff.value) return []
  return diff.value.sections.filter(s => {
    if (OVERVIEW_SECTION_IDS.has(s.id)) return false
    if (diffsOnly.value && s.status === 'equal') return false
    return true
  })
})

function statusIcon(status: PlaceholderDiff['status']): string {
  switch (status) {
    case 'added':   return '+'
    case 'removed': return '−'
    case 'changed': return '~'
    default:        return '✓'
  }
}

// ── Highlight helpers ────────────────────────────────────────────────────────

function isHighlightedPh(ph: PlaceholderDiff): boolean {
  const hl = compareStore.selectedHighlight
  if (!hl || ph.kind === 'attachment') return false
  return hl.name === ph.name && hl.kind === ph.kind
}

function onPhClick(ph: PlaceholderDiff) {
  if (ph.kind === 'attachment') return
  compareStore.setHighlight(ph.name, ph.kind as 'bone' | 'slot')
}

</script>

<style scoped>
.diff-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-surface);
  border-left: 1px solid var(--c-border-dim);
  min-width: 260px;
  overflow: hidden;
}

/* ── Summary bar ─────────────────────────────────────────────────── */
.summary-bar {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--c-border-dim);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-labels {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--c-text-dim);
  overflow: hidden;
}

.summary-spine {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-sep {
  color: var(--c-text-ghost);
  flex-shrink: 0;
  font-size: 0.7rem;
}

.summary-badge {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 700;
  border-radius: 3px;
  padding: 1px 5px;
}

.summary-badge--a { background: #1e3a5f; color: #60a5fa; }
.summary-badge--b { background: #1e3d2e; color: #4ade80; }

.summary-counts {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
}

.count { font-weight: 600; }
.count--ok       { color: #4ade80; }
.count--critical { color: #f87171; }
.count--warn     { color: #f59e0b; }
.count-sep      { color: var(--c-text-ghost); }

.source-badge {
  font-size: 0.62rem;
  color: var(--c-text-ghost);
  background: var(--c-raised);
  border-radius: 4px;
  padding: 1px 5px;
}

.summary-running { font-size: 0.72rem; color: var(--c-text-muted); font-style: italic; }
.summary-error   { font-size: 0.72rem; color: #f87171; }
.summary-idle    { font-size: 0.72rem; color: var(--c-text-ghost); font-style: italic; }

/* ── Panel controls ──────────────────────────────────────────────── */
.panel-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid var(--c-border-dim);
  gap: 8px;
}

.filter-toggle {
  display: flex;
  background: var(--c-raised);
  border-radius: 5px;
  overflow: hidden;
}

.filter-btn {
  background: transparent;
  border: none;
  padding: 3px 8px;
  font-size: 0.7rem;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.filter-btn--active {
  background: #7c6af5;
  color: white;
}


/* ── Diff content ─────────────────────────────────────────────────── */
.diff-content {
  flex: 1;
  overflow-y: auto;
}

/* ── Reskin Overview section ──────────────────────────────────────── */
.overview-section {
  border-bottom: 1px solid var(--c-border-dim);
}

.ov-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}
.ov-header:hover { background: var(--c-raised); }

.ov-toggle {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--c-text-ghost);
  min-width: 14px;
  text-align: center;
}

.ov-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-text-dim);
}

.ov-counts {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.ov-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}
.ov-badge--ok   { background: rgba(74,222,128,0.1);  color: #4ade80; }
.ov-badge--warn { background: rgba(245,158,11,0.1);  color: #f59e0b; }
.ov-badge--err  { background: rgba(248,113,113,0.1); color: #f87171; }

.ov-sub-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 3px;
  background: var(--c-raised);
  border-top: 1px solid var(--c-border-dim);
}

.ov-sub-header--events { margin-top: 2px; }
.ov-sub-header--ph     { margin-top: 2px; }

.ov-sub-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--c-text-ghost);
}

.ov-sub-hint {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  margin-left: auto;
}

.ov-empty {
  padding: 6px 28px;
  font-size: 0.72rem;
  color: var(--c-text-ghost);
  font-style: italic;
}

.ov-empty--hint {
  padding: 4px 16px;
  font-size: 0.65rem;
}

.ev-global-status {
  flex-shrink: 0;
  font-size: 0.62rem;
  color: var(--c-text-ghost);
  margin-left: auto;
}

/* Animation rows */
.anim-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.anim-row--delta  { background: rgba(245,158,11,0.04); }
.anim-row--only-a { background: rgba(248,113,113,0.04); }
.anim-row--only-b { background: rgba(74,222,128,0.04); }

.anim-row-icon {
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 12px;
  text-align: center;
  flex-shrink: 0;
}
.anim-row--ok     .anim-row-icon { color: #4ade80; }
.anim-row--delta  .anim-row-icon { color: #f59e0b; }
.anim-row--only-a .anim-row-icon { color: #f87171; }
.anim-row--only-b .anim-row-icon { color: #4ade80; }

.anim-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-dim);
}

.anim-row-dur {
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
  font-size: 0.7rem;
}
.anim-row-dur--master  { color: #4ade80; }
.anim-row-dur--variant { color: #f59e0b; }
.anim-row--ok .anim-row-dur--master,
.anim-row--ok .anim-row-dur--variant { color: var(--c-text-muted); }

.anim-row-delta {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: #f87171;
  min-width: 48px;
  text-align: right;
}

/* Constraint rows */
.cstr-kind {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.cstr-tag {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 600;
  border-radius: 3px;
  padding: 1px 4px;
}

.cstr-tag--critical {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.cstr-tag--param {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

/* Event groups */
.ev-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 16px;
  font-size: 0.72rem;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid var(--c-border-dim);
}
.ev-group-header:hover { background: var(--c-raised); }
.ev-group-header--changed { background: rgba(245,158,11,0.03); }

.ev-group-toggle {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--c-text-ghost);
  min-width: 12px;
}

.ev-group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-dim);
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.ev-group-badge {
  font-size: 0.62rem;
  font-weight: 700;
  color: #f59e0b;
  background: rgba(245,158,11,0.1);
  border-radius: 3px;
  padding: 1px 4px;
  flex-shrink: 0;
}

.ev-group-ok {
  font-size: 0.7rem;
  color: #4ade80;
  flex-shrink: 0;
}

/* Event occurrence rows */
.ev-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 10px 1px 28px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.ev-row--delta  { background: rgba(245,158,11,0.04); }
.ev-row--only-a { background: rgba(248,113,113,0.04); }
.ev-row--only-b { background: rgba(74,222,128,0.04); }

.ev-row-icon {
  font-weight: 700;
  min-width: 12px;
  text-align: center;
  flex-shrink: 0;
  font-size: 0.68rem;
}
.ev-row--ok     .ev-row-icon { color: #4ade80; }
.ev-row--delta  .ev-row-icon { color: #f59e0b; }
.ev-row--only-a .ev-row-icon { color: #f87171; }
.ev-row--only-b .ev-row-icon { color: #4ade80; }

.ev-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-muted);
}

.ev-row-idx {
  font-size: 0.6rem;
  color: var(--c-text-ghost);
  margin-left: 2px;
}

.ev-row-time {
  flex-shrink: 0;
  min-width: 50px;
  text-align: right;
  font-size: 0.68rem;
}
.ev-row-time.anim-row-dur--master  { color: #4ade80; }
.ev-row-time.anim-row-dur--variant { color: #f59e0b; }
.ev-row--ok .ev-row-time.anim-row-dur--master,
.ev-row--ok .ev-row-time.anim-row-dur--variant { color: var(--c-text-muted); }

.ev-row-delta {
  flex-shrink: 0;
  font-size: 0.62rem;
  color: #f87171;
  min-width: 48px;
  text-align: right;
}

/* ── Placeholders (inside Overview) ──────────────────────────────── */
.ov-sub-title.ph-title { color: #f59e0b; }

.ph-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.ph-item--added    { background: rgba(74, 222, 128, 0.05); }
.ph-item--removed  { background: rgba(248, 113, 113, 0.05); }
.ph-item--changed  { background: rgba(245, 158, 11, 0.05); }
.ph-item--clickable { cursor: pointer; }
.ph-item--clickable:hover { background: var(--c-raised); }
.ph-item--selected  { background: rgba(124, 106, 245, 0.12) !important; outline: 1px solid rgba(124, 106, 245, 0.4); outline-offset: -1px; }

.ph-status-icon {
  font-weight: 700;
  font-size: 0.75rem;
  min-width: 12px;
}

.ph-item--added   .ph-status-icon { color: #4ade80; }
.ph-item--removed .ph-status-icon { color: #f87171; }
.ph-item--changed .ph-status-icon { color: #f59e0b; }
.ph-item--equal   .ph-status-icon { color: #4ade80; }

.ph-kind { color: var(--c-text-ghost); font-size: 0.72rem; }
.ph-name { color: var(--c-text-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-status-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--c-text-ghost);
  flex-shrink: 0;
}

.ph-param {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 10px 1px 26px;
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.ph-param--critical { background: rgba(245, 158, 11, 0.07); }

.ph-param-key    { color: var(--c-text-ghost); min-width: 80px; }
.ph-param-val    { font-size: 0.72rem; white-space: nowrap; }
.ph-param-val--a  { color: #f87171; }
.ph-param-val--eq { color: var(--c-text-muted); }
.ph-param-val--b { color: #4ade80; }
.ph-param-arrow  { color: var(--c-text-ghost); flex-shrink: 0; }
.ph-critical-badge {
  font-size: 0.62rem;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}
</style>
