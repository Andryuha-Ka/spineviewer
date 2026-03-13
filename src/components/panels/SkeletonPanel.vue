<!--
 * @file SkeletonPanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="inspector">
    <div v-if="!skeletonStore.isLoaded" class="empty-hint">
      Load a skeleton to inspect it
    </div>

    <template v-else>
      <div ref="wrapperRef" class="sections-wrapper">

      <!-- ── Bones ─────────────────────────────────────────── -->
      <section class="section section--bones" :style="boneMaxHeight !== undefined ? { maxHeight: boneMaxHeight } : {}">
        <div class="section-header">
          <label class="label">
            Bones
            <span class="count">({{ skeletonStore.bones.length }})</span>
            <span class="tick">· {{ updateTick }}</span>
          </label>
          <div class="header-actions">
            <button class="tree-action-btn" title="Expand all" @click="expandAll">⊞</button>
            <button class="tree-action-btn" title="Collapse all" @click="collapseAll">⊟</button>
            <label class="sync-label" title="Sync bone ↔ attachment selection">
              <input type="checkbox" v-model="skeletonStore.syncSelection" class="sync-cb" />
              sync
            </label>
            <n-input
              v-model:value="boneSearch"
              size="tiny"
              placeholder="Filter…"
              clearable
              class="search-input"
            />
          </div>
        </div>

        <div ref="boneListRef" class="bone-list">
          <div
            v-for="item in visibleBones"
            :key="item.name"
            class="bone-row"
            :class="{ 'bone-row--selected': skeletonStore.selectedBone === item.name }"
            :style="{ paddingLeft: `${6 + item.depth * 12}px` }"
            @click="onSelectBone(item.name)"
          >
            <span
              class="bone-toggle"
              :class="item.hasChildren ? 'bone-toggle--active' : 'bone-toggle--leaf'"
              @click.stop="item.hasChildren && toggleCollapse(item.name)"
            >
              <template v-if="item.hasChildren">{{ item.collapsed ? '▸' : '▾' }}</template>
              <template v-else>·</template>
            </span>
            <span class="bone-name">{{ item.name }}</span>
            <span v-if="item.transform" class="bone-vals">
              {{ fmt(item.transform.x) }}, {{ fmt(item.transform.y) }}, {{ fmt(item.transform.rotation) }}°
              <span class="bone-scale">· {{ fmtS(item.transform.scaleX) }}×{{ fmtS(item.transform.scaleY) }}</span>
            </span>
          </div>
        </div>
      </section>

      <div class="divider" />

      <!-- ── Active Attachments ──────────────────────────── -->
      <section ref="attachSectionRef" class="section section--attach">
        <template v-if="inspectorStore.activeAttachments.length === 0">
          <div class="attach-header">
            <label class="label">
              Attachments
              <span class="count">(0)</span>
            </label>
          </div>
          <div class="empty-hint small">None active</div>
        </template>

        <div v-else ref="attachListRef" class="attach-list">
          <!-- Header row as first table row — columns align automatically -->
          <div class="attach-hdr-row">
            <span class="ac ac--name">
              <label class="label">
                Attachments
                <span class="count">({{ inspectorStore.activeAttachments.length }})</span>
              </label>
            </span>
            <span class="ac ac--slot ac--hdr">Slot</span>
            <span class="ac ac--type ac--hdr">Type</span>
          </div>
          <div
            v-for="att in inspectorStore.activeAttachments"
            :key="att.slotName"
            class="attach-row"
            :class="{ 'attach-row--selected': skeletonStore.selectedSlot === att.slotName }"
            @click="onSelectSlot(att.slotName)"
          >
            <span class="ac ac--name">
              <span class="ac-tip">{{ att.attachmentName }}</span>
            </span>
            <span class="ac ac--slot">{{ att.slotName }}</span>
            <span class="ac ac--type">
              <span class="attach-type" :class="`type-${att.type}`">{{ att.type === 'clipping' ? 'mask' : att.type }}</span>
              <span
                v-if="slotBlendMode(att.slotName) !== 0"
                class="blend-badge"
                :class="`blend-${slotBlendMode(att.slotName)}`"
                :title="`Blend: ${BLEND_LABELS[slotBlendMode(att.slotName)]}`"
              >{{ BLEND_LABELS[slotBlendMode(att.slotName)] }}</span>
            </span>
          </div>
        </div>
      </section>

      </div><!-- .sections-wrapper -->
    </template>
  </div>
</template>

<script setup lang="ts">
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import type { BoneTransform } from '@/core/types/ISpineAdapter'

const skeletonStore  = useSkeletonStore()
const inspectorStore = useInspectorStore()

const boneSearch = ref('')

// Tick counter — increments every inspector update so the user can see data IS live
const updateTick = ref(0)
watch(() => inspectorStore.boneTransforms, () => { updateTick.value = (updateTick.value + 1) % 100 })

// Depth map: bone name → nesting level
const boneDepthMap = computed(() => {
  const map = new Map<string, number>()
  for (const bone of skeletonStore.bones) {
    const parentDepth = bone.parent !== null ? (map.get(bone.parent) ?? 0) : -1
    map.set(bone.name, parentDepth + 1)
  }
  return map
})

// Children set: bones that have at least one child
const bonesWithChildren = computed(() => {
  const set = new Set<string>()
  for (const bone of skeletonStore.bones) {
    if (bone.parent !== null) set.add(bone.parent)
  }
  return set
})

// Collapsed state — starts with all parent nodes collapsed
const collapsedBones = ref(new Set<string>())

watch(
  () => skeletonStore.bones,
  (bones) => {
    // Collapse all nodes that have children when skeleton loads / changes
    const parents = new Set<string>()
    for (const bone of bones) {
      if (bone.parent !== null) parents.add(bone.parent)
    }
    collapsedBones.value = parents
  },
  { immediate: true },
)

function toggleCollapse(boneName: string): void {
  const next = new Set(collapsedBones.value)
  if (next.has(boneName)) next.delete(boneName)
  else next.add(boneName)
  collapsedBones.value = next
}

function expandAll(): void {
  collapsedBones.value = new Set()
}

function collapseAll(): void {
  collapsedBones.value = new Set(bonesWithChildren.value)
}

// Visible bones — respects search (ignore collapse) OR tree collapse state
const visibleBones = computed(() => {
  const search = boneSearch.value.toLowerCase()

  const transformMap = new Map<string, BoneTransform>()
  for (const bt of inspectorStore.boneTransforms) {
    transformMap.set(bt.name, bt)
  }

  if (search) {
    // Search mode — show all matching bones regardless of collapse state
    return skeletonStore.bones
      .filter(b => b.name.toLowerCase().includes(search))
      .map(b => ({
        name: b.name,
        depth: boneDepthMap.value.get(b.name) ?? 0,
        transform: transformMap.get(b.name) ?? null,
        hasChildren: bonesWithChildren.value.has(b.name),
        collapsed: false,
      }))
  }

  // Tree mode — hide children of collapsed nodes.
  // Spine guarantees parent-before-child order, so a single pass is sufficient.
  const hiddenByAncestor = new Set<string>()
  const result: Array<{
    name: string; depth: number; transform: BoneTransform | null;
    hasChildren: boolean; collapsed: boolean
  }> = []

  for (const bone of skeletonStore.bones) {
    // A bone is hidden if any ancestor is collapsed
    const isHidden =
      bone.parent !== null &&
      (hiddenByAncestor.has(bone.parent) || collapsedBones.value.has(bone.parent))

    if (isHidden) {
      hiddenByAncestor.add(bone.name)
      continue
    }

    result.push({
      name: bone.name,
      depth: boneDepthMap.value.get(bone.name) ?? 0,
      transform: transformMap.get(bone.name) ?? null,
      hasChildren: bonesWithChildren.value.has(bone.name),
      collapsed: collapsedBones.value.has(bone.name),
    })
  }

  return result
})

// ── Scroll helpers ────────────────────────────────────────────────────────────

const boneListRef      = ref<HTMLDivElement | null>(null)
const attachListRef    = ref<HTMLDivElement | null>(null)
const wrapperRef       = ref<HTMLDivElement | null>(null)
const attachSectionRef = ref<HTMLElement | null>(null)
const boneMaxHeight    = ref<string | undefined>(undefined)

function recalcBoneHeight() {
  const wrapper  = wrapperRef.value
  const attachEl = attachSectionRef.value
  if (!wrapper || !attachEl) return
  boneMaxHeight.value = Math.max(0, wrapper.clientHeight - attachEl.offsetHeight - 1) + 'px'
}

watch(visibleBones, () => nextTick(recalcBoneHeight))
watch(() => inspectorStore.activeAttachments, () => nextTick(recalcBoneHeight))

let _ro: ResizeObserver | null = null
onMounted(() => {
  nextTick(recalcBoneHeight)
  if (wrapperRef.value) {
    _ro = new ResizeObserver(recalcBoneHeight)
    _ro.observe(wrapperRef.value)
  }
})
onBeforeUnmount(() => {
  _ro?.disconnect()
  _ro = null
})

function scrollToSelected(listRef: typeof boneListRef, selector: string) {
  nextTick(() => {
    const el = listRef.value?.querySelector(selector) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// Expand all collapsed ancestors of a bone so it becomes visible in the tree
function expandAncestors(boneName: string) {
  const next = new Set(collapsedBones.value)
  let current = skeletonStore.bones.find(b => b.name === boneName)
  while (current?.parent) {
    next.delete(current.parent)
    current = skeletonStore.bones.find(b => b.name === current!.parent)
  }
  collapsedBones.value = next
}

// ── Sync selection ────────────────────────────────────────────────────────────

function onSelectBone(boneName: string) {
  skeletonStore.selectBone(boneName)
  if (!skeletonStore.syncSelection) return
  // Find the first active attachment whose slot belongs to this bone
  const slotsForBone = new Set(skeletonStore.slots.filter(s => s.bone === boneName).map(s => s.name))
  const att = inspectorStore.activeAttachments.find(a => slotsForBone.has(a.slotName))
  skeletonStore.selectedSlot = att?.slotName ?? null
  // Scroll attach list to the newly selected row
  if (att) scrollToSelected(attachListRef, '.attach-row--selected')
}

function onSelectSlot(slotName: string) {
  skeletonStore.selectSlot(slotName)
  if (!skeletonStore.syncSelection) return
  // Find the bone that owns this slot
  const slotInfo = skeletonStore.slots.find(s => s.name === slotName)
  const boneName = slotInfo?.bone ?? null
  skeletonStore.selectedBone = boneName
  // Expand tree so the bone is visible, then scroll to it
  if (boneName) {
    expandAncestors(boneName)
    scrollToSelected(boneListRef, '.bone-row--selected')
  }
}

const BLEND_LABELS: Record<number, string> = { 1: 'add', 2: 'mul', 3: 'scr' }

function slotBlendMode(slotName: string): number {
  return skeletonStore.slots.find(s => s.name === slotName)?.blendMode ?? 0
}

function fmt(n: number): string {
  return n.toFixed(1)
}

function fmtS(n: number): string {
  return n.toFixed(2)
}
</script>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 0.75rem;
  color: var(--c-text);
}

.sections-wrapper {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 10px 6px;
}

.section--bones {
  flex: 0 0 auto;
  overflow: hidden;
}

.section--attach {
  flex: 0 0 auto;
  max-height: 50%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
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

.tick {
  font-weight: 400;
  color: var(--c-text-ghost);
  font-variant-numeric: tabular-nums;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tree-action-btn {
  background: none;
  border: none;
  color: var(--c-text-faint);
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: 3px;
  transition: color 0.12s;
}

.tree-action-btn:hover {
  color: var(--c-text-dim);
}

.search-input {
  max-width: 90px;
}

.divider {
  height: 1px;
  background: var(--c-border-dim);
  flex-shrink: 0;
}

/* ── Bone list ── */
.bone-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.bone-list::-webkit-scrollbar { width: 4px; }
.bone-list::-webkit-scrollbar-track { background: transparent; }
.bone-list::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }
.bone-list::-webkit-scrollbar-thumb:hover { background: var(--c-scroll-hov); }

.bone-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 2px;
  padding-bottom: 2px;
  padding-right: 8px;
  border-radius: 4px;
  min-height: 20px;
}

.bone-row {
  cursor: pointer;
}

.bone-row:hover {
  background: var(--c-raised);
}

.bone-row--selected {
  background: rgba(124, 106, 245, 0.15);
}

.bone-row--selected:hover {
  background: rgba(124, 106, 245, 0.22);
}

/* Toggle icon: ▸ / ▾ for parent nodes, · for leaf nodes */
.bone-toggle {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  font-size: 0.65rem;
  line-height: 1;
  color: var(--c-text-ghost);
  user-select: none;
}

.bone-toggle--active {
  cursor: pointer;
  color: var(--c-text-faint);
}

.bone-toggle--active:hover {
  color: var(--c-text-dim);
}

.bone-toggle--leaf {
  cursor: default;
  color: var(--c-text-ghost);
}

.bone-name {
  color: var(--c-text-dim);
  flex-shrink: 0;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bone-vals {
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
  font-size: 0.68rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.bone-scale {
  color: var(--c-text-ghost);
}

/* ── Attachment header ── */
.attach-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sync-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.62rem;
  color: var(--c-text-faint);
  cursor: pointer;
  user-select: none;
}

.sync-label:hover { color: var(--c-text-dim); }

.sync-cb {
  width: 10px;
  height: 10px;
  cursor: pointer;
  accent-color: #7c6af5;
  flex-shrink: 0;
}

/* ── Attachments grid ── */
.attach-list {
  display: grid;
  grid-template-columns: 1fr minmax(0, 1fr) auto;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.attach-list::-webkit-scrollbar { width: 4px; }
.attach-list::-webkit-scrollbar-track { background: transparent; }
.attach-list::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }
.attach-list::-webkit-scrollbar-thumb:hover { background: var(--c-scroll-hov); }

/* Both header and data rows are transparent to grid — cells go directly into columns */
.attach-hdr-row,
.attach-row {
  display: contents;
}

.attach-row {
  cursor: pointer;
}

.attach-row:hover .ac { background: var(--c-raised); }
.attach-row--selected .ac { background: rgba(96, 165, 250, 0.12); }
.attach-row--selected:hover .ac { background: rgba(96, 165, 250, 0.2); }

/* Grid cells */
.ac {
  display: flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 0.72rem;
  min-width: 0;
}

.ac--name {
  color: var(--c-text-dim);
}

.ac--slot {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--c-text-muted);
}

.ac--type {
  white-space: nowrap;
}

/* Header cell labels */
.attach-hdr-row .ac {
  padding-bottom: 4px;
}

.ac--hdr {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-ghost);
}

/* Inner span for ellipsis — expands on hover */
.ac-tip {
  position: relative;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.ac-tip:hover {
  overflow: visible;
  z-index: 10;
  background: var(--c-surface);
  padding-right: 12px;
  border-radius: 2px;
}

.attach-type {
  display: inline-block;
  font-size: 0.6rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--c-border-dim);
  color: var(--c-text-muted);
}

.type-region   { color: #4ade80; background: rgba(74,  222, 128, 0.1); }
.type-mesh     { color: #60a5fa; background: rgba(96,  165, 250, 0.1); }
.type-clipping { color: #f87171; background: rgba(248, 113, 113, 0.1); }
.type-path     { color: #facc15; background: rgba(250, 204,  21, 0.1); }

.blend-badge {
  display: inline-block;
  font-size: 0.58rem;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 3px;
  font-weight: 600;
}

.blend-1 { color: #fb923c; background: rgba(251, 146,  60, 0.12); }  /* additive */
.blend-2 { color: #c084fc; background: rgba(192, 132, 252, 0.12); }  /* multiply */
.blend-3 { color: #22d3ee; background: rgba( 34, 211, 238, 0.12); }  /* screen */

.empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
}

.empty-hint.small {
  padding: 6px 8px;
  text-align: left;
}
</style>
