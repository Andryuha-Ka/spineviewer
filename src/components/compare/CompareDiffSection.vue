<!--
 * @file CompareDiffSection.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="diff-section" :class="`diff-section--${section.status}`">
    <!-- Section header -->
    <button class="section-header" @click="isExpanded = !isExpanded">
      <span class="section-toggle">{{ isExpanded ? '−' : '+' }}</span>
      <span class="section-label">{{ section.label }}</span>
      <span class="section-counts">[{{ section.counts.a }} A / {{ section.counts.b }} B]</span>
      <span class="section-badge" :class="`section-badge--${section.status}`">
        {{ sectionSummary }}
      </span>
    </button>

    <!-- Items -->
    <div v-if="isExpanded" class="section-items">
      <template v-for="item in visibleItems" :key="item.key">
        <div
          class="diff-item"
          :class="[
            `diff-item--${item.status}`,
            { 'diff-item--clickable': props.highlightKind, 'diff-item--selected': props.selectedName === item.key },
          ]"
          @click="props.highlightKind ? emit('item-click', item.key) : undefined"
        >
          <span class="item-status-icon">{{ statusIcon(item.status) }}</span>
          <span class="item-key">{{ item.key }}</span>
          <template v-if="item.status === 'changed' && !item.children">
            <span class="item-value item-value--a">{{ item.valueA }}</span>
            <span class="item-arrow">→</span>
            <span class="item-value item-value--b">{{ item.valueB }}</span>
          </template>
          <template v-else-if="item.status === 'added'">
            <span class="item-value item-value--added">(added)</span>
          </template>
          <template v-else-if="item.status === 'removed'">
            <span class="item-value item-value--removed">(removed)</span>
          </template>
        </div>
        <!-- Children (field-level diffs) -->
        <template v-if="item.children && isExpanded">
          <div
            v-for="child in item.children"
            :key="`${item.key}::${child.key}`"
            class="diff-child" :class="`diff-child--${child.status}`"
          >
            <span class="child-key">{{ child.key }}</span>
            <span class="child-value child-value--a">{{ child.valueA }}</span>
            <span class="item-arrow">→</span>
            <span class="child-value child-value--b">{{ child.valueB }}</span>
          </div>
        </template>
      </template>
      <div v-if="hiddenCount > 0" class="hidden-note">
        +{{ hiddenCount }} equal items hidden
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DiffSection, DiffItem } from '@/core/utils/spineCompare'

const props = defineProps<{
  section:          DiffSection
  diffsOnly:        boolean
  defaultExpanded?: boolean
  highlightKind?:   'bone' | 'slot'
  selectedName?:    string | null
}>()

const emit = defineEmits<{ 'item-click': [key: string] }>()

const isExpanded = ref(props.defaultExpanded ?? props.section.status === 'changed')

const visibleItems = computed<DiffItem[]>(() =>
  props.diffsOnly
    ? props.section.items.filter(i => i.status !== 'equal')
    : props.section.items,
)

const hiddenCount = computed(() =>
  props.diffsOnly ? props.section.items.filter(i => i.status === 'equal').length : 0,
)

const sectionSummary = computed(() => {
  if (props.section.status === 'equal') return 'equal'
  const items = props.section.items
  const added   = items.filter(i => i.status === 'added').length
  const removed = items.filter(i => i.status === 'removed').length
  const changed = items.filter(i => i.status === 'changed').length
  const parts: string[] = []
  if (added)   parts.push(`+${added} added`)
  if (removed) parts.push(`-${removed} removed`)
  if (changed) parts.push(`~${changed} changed`)
  return parts.join(' · ') || 'changed'
})

function statusIcon(status: DiffItem['status']): string {
  switch (status) {
    case 'added':   return '+'
    case 'removed': return '−'
    case 'changed': return '~'
    default:        return '='
  }
}
</script>

<style scoped>
.diff-section {
  border-bottom: 1px solid var(--c-border-dim);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--c-text-dim);
  font-size: 0.78rem;
  text-align: left;
  transition: background 0.12s;
}

.section-header:hover {
  background: var(--c-raised);
}

.section-toggle {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--c-text-ghost);
  min-width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.section-label {
  font-weight: 600;
  color: var(--c-text);
  min-width: 90px;
}

.section-counts {
  color: var(--c-text-muted);
  font-size: 0.72rem;
  flex-shrink: 0;
}

.section-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 500;
  flex-shrink: 0;
}

.section-badge--equal   { color: var(--c-text-ghost); }
.section-badge--changed { color: #f59e0b; }

.section-items {
  padding: 0 0 4px;
}

/* Item row */
.diff-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px 2px 28px;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
}

.diff-item--added    { background: rgba(74, 222, 128, 0.05); }
.diff-item--removed  { background: rgba(248, 113, 113, 0.05); }
.diff-item--changed  { background: rgba(245, 158, 11, 0.05); }
.diff-item--clickable { cursor: pointer; }
.diff-item--clickable:hover { background: var(--c-raised); }
.diff-item--selected  { background: rgba(124, 106, 245, 0.12) !important; outline: 1px solid rgba(124, 106, 245, 0.4); outline-offset: -1px; }

.item-status-icon {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 12px;
  text-align: center;
}

.diff-item--added   .item-status-icon { color: #4ade80; }
.diff-item--removed .item-status-icon { color: #f87171; }
.diff-item--changed .item-status-icon { color: #f59e0b; }
.diff-item--equal   .item-status-icon { color: var(--c-text-ghost); }

.item-key {
  color: var(--c-text-dim);
  min-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-value {
  font-size: 0.72rem;
  color: var(--c-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.item-value--a       { color: #f87171; }
.item-value--b       { color: #4ade80; }
.item-value--added   { color: #4ade80; }
.item-value--removed { color: #f87171; }

.item-arrow {
  color: var(--c-text-ghost);
  font-size: 0.72rem;
  flex-shrink: 0;
}

/* Child row (field-level diff inside an item) */
.diff-child {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 12px 1px 44px;
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
  background: rgba(245, 158, 11, 0.03);
}

.child-key {
  color: var(--c-text-ghost);
  min-width: 90px;
  flex-shrink: 0;
}

.child-value {
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.child-value--a { color: #f87171; }
.child-value--b { color: #4ade80; }

.hidden-note {
  padding: 4px 28px;
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  font-style: italic;
}
</style>
