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
      <!-- ── Skeleton file info ───────────────────────────── -->
      <div v-if="skeletonInfo" class="skeleton-info-row">
        <span class="file-type-badge" :class="`file-type-badge--${skeletonInfo.type}`">
          {{ TYPE_LABELS[skeletonInfo.type] }}
        </span>
        <span class="skeleton-filename" :title="skeletonInfo.name">{{ skeletonInfo.name }}</span>
        <span v-if="loaderStore.detectedVersion" class="version-badge">
          Spine {{ loaderStore.detectedVersion }}
        </span>
        <span class="file-size">{{ formatSize(skeletonInfo.size) }}</span>
      </div>

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
import { useLoaderStore }    from '@/core/stores/useLoaderStore'
import type { BoneTransform } from '@/core/types/ISpineAdapter'
import type { SpineFileType } from '@/core/types/FileSet'

const skeletonStore  = useSkeletonStore()
const inspectorStore = useInspectorStore()
const loaderStore    = useLoaderStore()

const TYPE_LABELS: Record<SpineFileType, string> = {
  'skeleton-json': 'JSON',
  'skeleton-skel': 'SKEL',
  atlas:           'ATLAS',
  image:           'IMG',
}

const skeletonInfo = computed(() =>
  loaderStore.pendingFileInfos.find(f => f.type === 'skeleton-json' || f.type === 'skeleton-skel') ?? null,
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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

/* ── Skeleton info row ── */
.skeleton-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--c-border-dim);
  font-size: 0.72rem;
}

.file-type-badge {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 3px;
  min-width: 34px;
  text-align: center;
}

.file-type-badge--skeleton-json { background: #1e3a5f; color: #60a5fa; }
.file-type-badge--skeleton-skel { background: #1e3a5f; color: #93c5fd; }
.file-type-badge--atlas          { background: #3b2d5a; color: #c4b5fd; }
.file-type-badge--image          { background: #1e3d2e; color: #86efac; }

.skeleton-filename {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-dim);
}

.version-badge {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(124, 106, 245, 0.15);
  color: #9d8fff;
}

.file-size {
  flex-shrink: 0;
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
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
