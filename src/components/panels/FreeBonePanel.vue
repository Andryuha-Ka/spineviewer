<!--
 * @file FreeBonePanel.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="free-bone-panel">
    <div class="skeleton-header">
      <span class="skeleton-name">{{ slotSelectionStore.activeSlot?.name }}</span>
      <span v-if="editState?.edited" class="edited-mark" :title="editedTitle">★</span>
    </div>

    <div class="panel-header">
      <span class="panel-title">Bone</span>
    </div>
    <div class="bone-editor">
      <n-select
        :value="skeletonStore.selectedBone"
        :options="boneOptions"
        size="tiny"
        filterable
        clearable
        placeholder="Select a bone"
        class="bone-picker"
        :render-label="renderBoneLabel"
        @update:value="onPickBone"
        @update:show="menuOpen = $event"
      />
      <div v-if="!skeletonStore.selectedBone" class="editor-hint">Select a bone</div>
      <template v-else>
        <div class="effect-line" :title="[status.reason, status.constraints].filter(Boolean).join('\n') || undefined">
          <span v-if="status.reason" data-effect="reason">{{ status.reason }}</span>
          <template v-if="status.reason && status.constraints"> · </template>
          <span v-if="status.constraints" data-effect="constraints">{{ status.constraints }}</span>
        </div>
        <div class="editor-grid">
          <template v-for="f in FIELDS" :key="f.prop">
            <label class="editor-label" :class="{ 'editor-label--held': isHeld(f.prop) }">
              {{ f.label }}<span v-if="isHeld(f.prop)" class="held-dot">●</span>
            </label>
            <input
              class="ctrl-input editor-input"
              :class="{ 'editor-input--held': isHeld(f.prop) }"
              :data-prop="f.prop"
              type="number"
              :step="f.step"
              v-bind="draftInput(`b:${f.prop}`, shown(f.prop), e => onBoneField(f.prop, e))"
            />
          </template>
        </div>
        <div class="editor-actions">
          <button class="act-btn" data-act="release" :disabled="editStore.busy || !hasOverride" @click="onRelease">Release</button>
          <button class="act-btn" data-act="apply" :disabled="editStore.busy" @click="onApplySetup">Apply to setup pose</button>
          <span :title="currentAnimation ? '' : NO_ANIM_TIP">
            <button class="act-btn" data-act="key" :disabled="editStore.busy || !hasOverride || !currentAnimation" @click="onKey">Key at current time</button>
          </span>
          <button class="act-btn" data-act="new-anim" :disabled="editStore.busy" @click="onNewAnimation">New animation</button>
          <span title="Undo last skeleton edit">
            <button class="act-btn" data-act="undo" :disabled="editStore.busy || !editState?.canUndo" @click="run(() => editStore.undo())">Undo</button>
          </span>
          <span title="Redo skeleton edit">
            <button class="act-btn" data-act="redo" :disabled="editStore.busy || !editState?.canRedo" @click="run(() => editStore.redo())">Redo</button>
          </span>
          <button class="act-btn" data-act="revert" :disabled="editStore.busy || !editState?.edited" @click="run(() => editStore.revertToSource())">Revert skeleton</button>
        </div>
      </template>
      <div v-if="editState?.warnings.length" class="editor-warnings" :title="editState.warnings.join('\n')">
        Conversion warnings: {{ editState.warnings.length }}
      </div>
      <div v-if="error" class="editor-error">{{ error }}</div>
    </div>

    <template v-if="skeletonStore.freeBones.length > 0">
    <div class="panel-header">
      <span class="panel-title">Free Bones</span>
      <span class="panel-hint">{{ skeletonStore.freeBones.length }} bone{{ skeletonStore.freeBones.length !== 1 ? 's' : '' }} · not keyframed</span>
    </div>

    <div class="bone-list">
      <div
        v-for="name in skeletonStore.freeBones"
        :key="name"
        class="bone-row"
      >
        <div class="bone-name">{{ name }}</div>
        <div class="bone-controls">
          <label class="ctrl-label">X</label>
          <input
            class="ctrl-input"
            type="number"
            step="1"
            v-bind="draftInput(`f:${name}:x`, getVal(name).x, e => onField(name, 'x', e))"
          />
          <label class="ctrl-label">Y</label>
          <input
            class="ctrl-input"
            type="number"
            step="1"
            v-bind="draftInput(`f:${name}:y`, getVal(name).y, e => onField(name, 'y', e))"
          />
          <label class="ctrl-label">R</label>
          <input
            class="ctrl-input ctrl-input--rot"
            type="number"
            step="0.5"
            v-bind="draftInput(`f:${name}:rotation`, getVal(name).rotation, e => onField(name, 'rotation', e))"
          />
          <button class="reset-btn" title="Reset to setup pose" @click="onReset(name)">↺</button>
        </div>
      </div>
    </div>
    </template>

    <template v-if="skeletonStore.sliders.length > 0">
    <div class="panel-header">
      <span class="panel-title">Sliders</span>
      <span class="panel-hint">{{ skeletonStore.sliders.length }} slider{{ skeletonStore.sliders.length !== 1 ? 's' : '' }}</span>
    </div>

    <div class="bone-list slider-list">
      <div
        v-for="s in skeletonStore.sliders"
        :key="s.name"
        class="bone-row"
      >
        <div class="bone-name">{{ s.name }}</div>
        <div class="bone-controls">
          <label class="ctrl-label">Time</label>
          <input
            class="ctrl-input"
            type="number"
            step="0.01"
            min="0"
            v-bind="draftInput(`s:${s.name}:time`, getSlider(s).time, e => onSliderField(s, 'time', e))"
          />
          <label class="ctrl-label">Mix</label>
          <input
            class="ctrl-input ctrl-input--rot"
            type="number"
            step="0.01"
            min="0"
            max="1"
            v-bind="draftInput(`s:${s.name}:mix`, getSlider(s).mix, e => onSliderField(s, 'mix', e))"
          />
          <button class="reset-btn" title="Reset to setup values" @click="onSliderReset(s)">↺</button>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useSkeletonEditStore } from '@/core/stores/useSkeletonEditStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import type { BoneLocalTransform, SliderInfo } from '@/core/types/ISpineAdapter'
import { EFFECT_REASON_TEXT, constraintText, effectTitle } from '@/core/utils/boneEffect'
import type { SelectOption } from 'naive-ui'

const emit = defineEmits<{ 'set-animation': [track: number, name: string, loop: boolean] }>()

const skeletonStore      = useSkeletonStore()
const editStore          = useSkeletonEditStore()
const slotSelectionStore = useSlotSelectionStore()
const animationStore     = useAnimationStore()
const inspectorStore     = useInspectorStore()

type Prop = keyof BoneLocalTransform
const FIELDS: Array<{ prop: Prop; label: string; step: number }> = [
  { prop: 'x',        label: 'X',        step: 1 },
  { prop: 'y',        label: 'Y',        step: 1 },
  { prop: 'rotation', label: 'Rotation', step: 0.5 },
  { prop: 'scaleX',   label: 'Scale X',  step: 0.01 },
  { prop: 'scaleY',   label: 'Scale Y',  step: 0.01 },
  { prop: 'shearX',   label: 'Shear X',  step: 0.5 },
  { prop: 'shearY',   label: 'Shear Y',  step: 0.5 },
]
const NO_ANIM_TIP = 'Set an animation on the current track to key it'

// name, dimmed flag and title per bone: options are rebuilt only when what they show changes
const optionsSignature = computed(() => JSON.stringify(skeletonStore.bones.map(b => {
  const e = inspectorStore.boneEffects[b.name]
  return [b.name, e?.visible === false, effectTitle(e)]
})))
const boneOptions = shallowRef<SelectOption[]>([])
const menuOpen = ref(false)
// NSelect resets the hovered option whenever options change, so they stay frozen while the menu is open
watch([optionsSignature, menuOpen], ([sig, open]) => {
  if (open) return
  boneOptions.value = (JSON.parse(sig) as Array<[string, boolean, string]>).map(([name, dim, title]) => ({
    label: name,
    value: name,
    title: title || undefined,
    // Teleported menu: scoped classes do not reach it
    style: dim ? { color: 'var(--c-text-faint)' } : undefined,
  }))
}, { immediate: true })
const renderBoneLabel = (o: SelectOption) => h('span', { title: o.title }, String(o.label))
const selectedEffect = computed(() => skeletonStore.selectedBone ? inspectorStore.boneEffects[skeletonStore.selectedBone] : undefined)

// A shown status holds this long so effects toggling during playback do not blink
const STATUS_HOLD_MS = 400
const liveStatus = computed(() => {
  const e = selectedEffect.value
  return {
    reason: e && !e.visible && e.reason ? `This bone draws nothing right now: ${EFFECT_REASON_TEXT[e.reason]}` : '',
    constraints: e?.constraints.length ? constraintText(e.constraints) : '',
  }
})
const status = ref(liveStatus.value)
let statusShownAt = 0
let holdTimer: ReturnType<typeof setTimeout> | undefined

function showLiveStatus(): void {
  clearTimeout(holdTimer)
  holdTimer = undefined
  status.value = liveStatus.value
  statusShownAt = Date.now()
}

watch(liveStatus, next => {
  clearTimeout(holdTimer)
  if (next.reason === status.value.reason && next.constraints === status.value.constraints) return
  const wait = statusShownAt + STATUS_HOLD_MS - Date.now()
  if (wait <= 0) showLiveStatus()
  else holdTimer = setTimeout(showLiveStatus, wait)
})
watch(() => skeletonStore.selectedBone, showLiveStatus)
onBeforeUnmount(() => clearTimeout(holdTimer))

const editState = computed(() => {
  const id = slotSelectionStore.activeSlotId
  if (!id) return null
  try { return editStore.getEditState(id) } catch { return null }
})
const editedTitle = computed(() => editState.value?.unsaved ? 'Skeleton data edited — export to keep changes' : 'Skeleton data edited')

const held = computed(() => skeletonStore.selectedBone ? skeletonStore.boneOverrides[skeletonStore.selectedBone] : undefined)
const hasOverride = computed(() => !!held.value && Object.keys(held.value).length > 0)
const isHeld = (prop: Prop) => held.value?.[prop] !== undefined

const live = ref<BoneLocalTransform | null>(null)
const focused = ref(false)
const error = ref('')

function refreshLive(): void {
  if (focused.value) return
  const name = skeletonStore.selectedBone
  live.value = name ? skeletonStore.getAdapter()?.getBoneLocalTransforms().find(b => b.name === name)?.local ?? null : null
}
useIntervalFn(refreshLive, 100)
watch(() => [skeletonStore.selectedBone, skeletonStore.boneOverrides], refreshLive, { immediate: true })

// Vue re-patches `value` on every render, so typed text lives in a draft until change / blur / Escape
const drafts = ref<Record<string, string>>({})

function draftInput(key: string, value: number, commit: (e: Event) => void) {
  return {
    value: drafts.value[key] ?? value,
    onInput: (e: Event) => { drafts.value[key] = (e.target as HTMLInputElement).value },
    onKeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') delete drafts.value[key] },
    onFocus: () => { focused.value = true },
    onBlur: () => { focused.value = false; delete drafts.value[key] },
    onChange: (e: Event) => {
      if (!(key in drafts.value)) return
      delete drafts.value[key]
      commit(e)
    },
  }
}

function shown(prop: Prop): number {
  const v = held.value?.[prop] ?? live.value?.[prop] ?? 0
  return Math.round(v * 1000) / 1000
}

const currentAnimation = computed(() =>
  animationStore.tracks.find(t => t.trackIndex === animationStore.currentTrack)?.animationName ?? null)

function onPickBone(name: string | null): void {
  skeletonStore.selectedBone = name
}

function onBoneField(prop: Prop, e: Event): void {
  const input = e.target as HTMLInputElement
  const val = parseFloat(input.value)
  const name = skeletonStore.selectedBone
  if (!name || !isFinite(val)) { input.value = String(shown(prop)); return }
  skeletonStore.setBoneOverride(name, { [prop]: val })
}

async function run(fn: () => Promise<unknown>): Promise<boolean> {
  error.value = ''
  try {
    await fn()
    return true
  } catch (e) {
    error.value = (e instanceof Error ? e.message : String(e)).replace(/^[A-Z_]+: /, '')
    return false
  }
}

function onRelease(): void {
  if (skeletonStore.selectedBone) skeletonStore.releaseBoneOverride(skeletonStore.selectedBone)
}

function onApplySetup(): void {
  const name = skeletonStore.selectedBone
  if (name) run(() => editStore.applyOverridesToSetupPose([name]))
}

/** Time of the current track's entry, wrapped like the runtime shows it. */
function currentTrackTime(): number | undefined {
  const s = skeletonStore.getAdapter()?.getTrackStates().find(t => t.trackIndex === animationStore.currentTrack)
  if (!s) return undefined
  return s.duration > 0 ? (s.loop ? s.time % s.duration : Math.min(s.time, s.duration)) : 0
}

function onKey(): void {
  const name = skeletonStore.selectedBone
  const anim = currentAnimation.value
  if (name && anim) run(() => editStore.keyCurrentPose(anim, [name], currentTrackTime()))
}

async function onNewAnimation(): Promise<void> {
  const name = window.prompt('New animation name')
  if (name === null) return
  if (name.trim() === '' || skeletonStore.animations.includes(name)) {
    error.value = 'Animation name is empty or already exists'
    return
  }
  if (!await run(() => editStore.createAnimation(name))) return
  animationStore.selectedAnimation = name
  emit('set-animation', animationStore.currentTrack, name, animationStore.loop)
}

// held override per field, setup value otherwise
function getVal(name: string): { x: number; y: number; rotation: number } {
  const held = skeletonStore.boneOverrides[name]
  const setup = skeletonStore.getBoneSetupTransform(name)
  return {
    x:        held?.x        ?? setup?.x        ?? 0,
    y:        held?.y        ?? setup?.y        ?? 0,
    rotation: held?.rotation ?? setup?.rotation ?? 0,
  }
}

function onField(name: string, field: 'x' | 'y' | 'rotation', e: Event): void {
  const input = e.target as HTMLInputElement
  const val = parseFloat(input.value)
  if (!isFinite(val)) { input.value = String(getVal(name)[field]); return }
  skeletonStore.setBoneOverride(name, { [field]: val })
}

function onReset(name: string): void {
  skeletonStore.releaseBoneOverride(name, ['x', 'y', 'rotation'])
}

const sliderVals = ref(new Map<string, { time: number; mix: number }>())

function getSlider(s: SliderInfo): { time: number; mix: number } {
  if (!sliderVals.value.has(s.name)) sliderVals.value.set(s.name, { time: s.setupTime, mix: s.setupMix })
  return sliderVals.value.get(s.name)!
}

function onSliderField(s: SliderInfo, field: 'time' | 'mix', e: Event): void {
  const input = e.target as HTMLInputElement
  const val = parseFloat(input.value)
  const cur = getSlider(s)
  if (!isFinite(val)) { input.value = String(cur[field]); return }
  const v = field === 'time' ? Math.max(0, val) : Math.min(1, Math.max(0, val))
  input.value = String(v)
  sliderVals.value.set(s.name, { ...cur, [field]: v })
  skeletonStore.setSliderPose(s.name, { [field]: v })
}

function onSliderReset(s: SliderInfo): void {
  sliderVals.value.set(s.name, { time: s.setupTime, mix: s.setupMix })
  skeletonStore.resetSlider(s.name)
}

watch(() => skeletonStore.sliders, () => { sliderVals.value.clear() })
</script>

<style scoped>
.free-bone-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.skeleton-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 8px 10px 0;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--c-text-dim);
}

.skeleton-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edited-mark {
  color: var(--c-warning);
  cursor: default;
}

.bone-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.editor-hint {
  font-size: 0.75rem;
  color: var(--c-text-ghost);
}

.editor-grid {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 4px 6px;
  align-items: center;
}

.editor-label {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  white-space: nowrap;
}

.editor-label--held,
.held-dot {
  color: var(--c-accent);
}

.held-dot {
  margin-left: 2px;
}

.ctrl-input.editor-input {
  width: 100%;
  min-width: 0;
}

.ctrl-input.editor-input--held {
  border-color: var(--c-accent);
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.act-btn {
  background: none;
  border: 1px solid var(--c-border-dim);
  border-radius: 3px;
  color: var(--c-text-dim);
  font-size: 0.6875rem;
  padding: 2px 6px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.act-btn:hover:not(:disabled) {
  color: var(--c-text);
  border-color: var(--c-text-ghost);
}

.act-btn:disabled {
  color: var(--c-text-ghost);
  cursor: default;
}

.editor-warnings {
  font-size: 0.6875rem;
  color: var(--c-warning);
  cursor: help;
}

.effect-line {
  font-size: 0.6875rem;
  line-height: 1rem;
  height: 1rem;
  color: var(--c-warning);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-error {
  font-size: 0.6875rem;
  color: var(--c-error);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--c-border-dim);
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.panel-hint {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
}

.bone-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.slider-list {
  flex: 0 1 auto;
}

.bone-row {
  padding: 5px 10px;
  border-bottom: 1px solid var(--c-border-dim);
}

.bone-row:last-child {
  border-bottom: none;
}

.bone-name {
  font-size: 0.75rem;
  color: var(--c-text-dim);
  margin-bottom: 4px;
  font-family: monospace;
}

.bone-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.ctrl-label {
  font-size: 0.6875rem;
  color: var(--c-text-ghost);
  min-width: 10px;
  text-align: right;
}

.ctrl-input {
  width: 60px;
  background: var(--c-surface);
  border: 1px solid var(--c-border-dim);
  border-radius: 3px;
  color: var(--c-text);
  font-size: 0.75rem;
  padding: 2px 4px;
  text-align: right;
}

.ctrl-input--rot {
  width: 54px;
}

.ctrl-input:focus {
  outline: none;
  border-color: var(--c-focus-ring);
}

/* Remove default number spinners */
.ctrl-input::-webkit-inner-spin-button,
.ctrl-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.reset-btn {
  background: none;
  border: 1px solid var(--c-border-dim);
  border-radius: 3px;
  color: var(--c-text-ghost);
  font-size: 0.75rem;
  min-height: 20px;
  padding: 2px 6px;
  cursor: pointer;
  margin-left: 2px;
  transition: color 0.15s, border-color 0.15s;
}

.reset-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}
</style>
