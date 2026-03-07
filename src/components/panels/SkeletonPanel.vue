<template>
  <div class="inspector">
    <div v-if="!skeletonStore.isLoaded" class="empty-hint">
      Load a skeleton to inspect it
    </div>

    <template v-else>
      <!-- ── Bones ─────────────────────────────────────────── -->
      <section class="section">
        <div class="section-header">
          <label class="label">
            Bones
            <span class="count">({{ filteredBones.length }})</span>
            <span class="tick">· {{ updateTick }}</span>
          </label>
          <n-input
            v-model:value="boneSearch"
            size="tiny"
            placeholder="Filter…"
            clearable
            class="search-input"
          />
        </div>

        <div class="bone-list">
          <div
            v-for="item in filteredBones"
            :key="item.name"
            class="bone-row"
            :style="{ paddingLeft: `${8 + item.depth * 10}px` }"
          >
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
      <section class="section">
        <label class="label">
          Attachments
          <span class="count">({{ inspectorStore.activeAttachments.length }})</span>
        </label>

        <div v-if="inspectorStore.activeAttachments.length === 0" class="empty-hint small">
          None active
        </div>
        <div v-else class="attach-list">
          <div
            v-for="att in inspectorStore.activeAttachments"
            :key="att.slotName"
            class="attach-row"
          >
            <span class="attach-slot">{{ att.slotName }}</span>
            <span class="attach-name" :title="att.attachmentName">{{ att.attachmentName }}</span>
            <span class="attach-type" :class="`type-${att.type}`">{{ att.type }}</span>
          </div>
        </div>
      </section>
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
// even when bone positions don't change (e.g. attachment-only animations)
const updateTick = ref(0)
watch(() => inspectorStore.boneTransforms, () => { updateTick.value = (updateTick.value + 1) % 100 })

// Compute depth for each bone (Spine guarantees parent-before-child order)
const boneDepthMap = computed(() => {
  const map = new Map<string, number>()
  for (const bone of skeletonStore.bones) {
    const parentDepth = bone.parent !== null ? (map.get(bone.parent) ?? 0) : -1
    map.set(bone.name, parentDepth + 1)
  }
  return map
})

const filteredBones = computed(() => {
  const search = boneSearch.value.toLowerCase()
  // Build transform lookup inline — directly tracks inspectorStore.boneTransforms
  const transformMap = new Map<string, BoneTransform>()
  for (const bt of inspectorStore.boneTransforms) {
    transformMap.set(bt.name, bt)
  }
  return skeletonStore.bones
    .filter(b => !search || b.name.toLowerCase().includes(search))
    .map(b => ({
      name: b.name,
      depth: boneDepthMap.value.get(b.name) ?? 0,
      transform: transformMap.get(b.name) ?? null,
    }))
})

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

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 10px 6px;
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

.search-input {
  max-width: 100px;
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
  max-height: 260px;
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
  justify-content: space-between;
  gap: 6px;
  padding-top: 2px;
  padding-bottom: 2px;
  padding-right: 8px;
  border-radius: 4px;
  min-height: 20px;
}

.bone-row:hover {
  background: var(--c-raised);
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

/* ── Attachments ── */
.attach-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-scroll) transparent;
}

.attach-list::-webkit-scrollbar { width: 4px; }
.attach-list::-webkit-scrollbar-track { background: transparent; }
.attach-list::-webkit-scrollbar-thumb { background: var(--c-scroll); border-radius: 2px; }
.attach-list::-webkit-scrollbar-thumb:hover { background: var(--c-scroll-hov); }

.attach-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 4px;
}

.attach-row:hover {
  background: var(--c-raised);
}

.attach-slot {
  color: var(--c-text-muted);
  flex-shrink: 0;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-name {
  color: var(--c-text-dim);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-type {
  font-size: 0.62rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--c-border-dim);
  color: var(--c-text-muted);
  flex-shrink: 0;
}

.type-region  { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
.type-mesh    { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
.type-clipping { color: #f87171; background: rgba(248, 113, 113, 0.1); }
.type-path    { color: #facc15; background: rgba(250, 204, 21, 0.1); }

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
