<template>
  <div class="complexity">

    <div v-if="!report" class="empty-hint">
      Load a skeleton to see complexity analysis
    </div>

    <template v-else>

      <!-- ── Metrics ─────────────────────────────────────────────── -->
      <section class="section">
        <label class="label">Metrics</label>
        <div class="metrics-list">
          <div
            v-for="m in report.metrics"
            :key="m.name"
            class="metric-row"
          >
            <span class="dot" :class="`dot--${m.status}`">●</span>
            <span class="metric-name">{{ m.name }}</span>
            <span class="metric-value" :class="`val--${m.status}`">{{ m.displayValue }}</span>
            <span v-if="m.status !== 'ok'" class="metric-hint">
              {{ hintText(m) }}
            </span>
          </div>
        </div>
        <div v-if="!report.fromJson" class="binary-note">
          Binary skeleton — clipping / mesh / vertex counts unavailable
        </div>
      </section>

      <div class="divider" />

      <!-- ── Recommendations ────────────────────────────────────── -->
      <section class="section">
        <label class="label">
          Recommendations
          <span class="count">({{ report.recommendations.length }})</span>
        </label>
        <div v-if="report.recommendations.length === 0" class="no-recs">
          No issues detected
        </div>
        <ul v-else class="recs-list">
          <li
            v-for="(rec, i) in report.recommendations"
            :key="i"
            class="rec-item"
          >{{ rec }}</li>
        </ul>
      </section>

      <div class="divider" />

      <!-- ── Keyframes ───────────────────────────────────────────── -->
      <section class="section section--flex">
        <label class="label">
          Keyframes
          <span v-if="!report.fromJson" class="unsupported-tag">binary — N/A</span>
        </label>

        <div v-if="!report.fromJson" class="no-recs">
          Keyframe analysis requires a JSON skeleton
        </div>
        <div v-else-if="report.animations.length === 0" class="no-recs">
          No animations
        </div>
        <div v-else class="kf-table-wrap">
          <table class="kf-table">
            <thead>
              <tr>
                <th class="col-name">Animation</th>
                <th class="col-num">Dur</th>
                <th class="col-num">KF</th>
                <th class="col-num">KF/s</th>
                <th class="col-num">Dup</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="anim in report.animations"
                :key="anim.name"
                class="kf-row"
              >
                <td class="col-name anim-name" :title="anim.name">{{ anim.name }}</td>
                <td class="col-num anim-dur">{{ anim.duration.toFixed(2) }}s</td>
                <td class="col-num">{{ anim.keyframes }}</td>
                <td class="col-num" :class="densityClass(anim.density)">{{ anim.density }}</td>
                <td class="col-num" :class="anim.redundant > 0 ? 'dup--warn' : ''">{{ anim.redundant }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </template>
  </div>
</template>

<script setup lang="ts">
import { useComplexityStore } from '@/core/stores/useComplexityStore'
import type { ComplexityMetric } from '@/core/utils/complexityAnalyzer'

const complexityStore = useComplexityStore()
const report = computed(() => complexityStore.report)

function hintText(m: ComplexityMetric): string {
  if (m.inverse) {
    const threshold = m.status === 'crit' ? m.critAt : m.warnAt
    return `< ${(threshold * 100).toFixed(0)}%`
  }
  const threshold = m.status === 'crit' ? m.critAt : m.warnAt
  return `≥ ${threshold}`
}

function densityClass(density: number): string {
  if (density >= 100) return 'dup--warn'
  return ''
}
</script>

<style scoped>
.complexity {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-size: 0.75rem;
  color: var(--c-text);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 10px 6px;
}

.section--flex {
  flex: 1;
  min-height: 0;
}

.divider {
  height: 1px;
  background: var(--c-border-dim);
  flex-shrink: 0;
}

.label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.count {
  font-weight: 400;
  color: var(--c-text-faint);
}

/* ── Metrics ── */
.metrics-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
}

.metric-row:hover {
  background: var(--c-raised);
}

.dot {
  font-size: 0.55rem;
  flex-shrink: 0;
  line-height: 1;
}

.dot--ok   { color: #4ade80; }
.dot--warn { color: #facc15; }
.dot--crit { color: #f87171; }

.metric-name {
  flex: 1;
  color: var(--c-text-dim);
}

.metric-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--c-text);
}

.val--warn { color: #facc15; }
.val--crit { color: #f87171; }

.metric-hint {
  font-size: 0.65rem;
  color: var(--c-text-ghost);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
}

.binary-note {
  font-size: 0.68rem;
  color: var(--c-text-ghost);
  padding: 2px 4px;
}

/* ── Recommendations ── */
.no-recs {
  font-size: 0.73rem;
  color: var(--c-text-faint);
  padding: 4px 4px;
}

.recs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rec-item {
  font-size: 0.72rem;
  color: var(--c-text-dim);
  line-height: 1.4;
  padding: 4px 6px;
  border-left: 2px solid var(--c-border-dim);
  border-radius: 0 4px 4px 0;
  background: var(--c-raised);
}

/* ── Keyframes table ── */
.kf-table-wrap {
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.kf-table-wrap::-webkit-scrollbar { width: 4px; }
.kf-table-wrap::-webkit-scrollbar-track { background: transparent; }
.kf-table-wrap::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }

.kf-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
}

.kf-table thead th {
  text-align: left;
  font-weight: 600;
  font-size: 0.65rem;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 4px;
  border-bottom: 1px solid var(--c-border-dim);
  position: sticky;
  top: 0;
  background: var(--c-bg);
}

.kf-row td {
  padding: 3px 4px;
  color: var(--c-text-dim);
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid transparent;
}

.kf-row:hover td {
  background: var(--c-raised);
}

.col-name {
  text-align: left;
}

.col-num {
  text-align: right;
}

.anim-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anim-dur {
  color: var(--c-text-faint);
}

.dup--warn {
  color: #facc15;
}

/* ── Empty hint ── */
.empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}

.unsupported-tag {
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--c-text-ghost);
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
}
</style>
