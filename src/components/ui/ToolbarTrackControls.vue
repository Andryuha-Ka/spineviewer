<!--
 * @file ToolbarTrackControls.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <div class="track-controls">
    <n-select
      size="small"
      class="track-controls__track"
      :value="animationStore.currentTrack"
      :options="trackOptions"
      :disabled="!skeletonStore.isLoaded"
      :consistent-menu-width="false"
      :theme-overrides="trackSelectTheme"
      :render-label="renderTrackLabel"
      @update:value="onTrackChange"
    />
    <AnimationSelect
      class="track-controls__anim"
      :value="trackAnimation"
      :animations="skeletonStore.animations"
      :disabled="!skeletonStore.isLoaded"
      :clearable="false"
      @select="onAnimSelect"
    />
    <button
      type="button"
      class="track-controls__play"
      :class="{ 'track-controls__play--playing': trackPlaying }"
      :disabled="!skeletonStore.isLoaded || !trackAnimation"
      :title="trackPlaying ? 'Pause track' : 'Play track'"
      @click="animationStore.toggleTrackPlay(animationStore.currentTrack)"
    >{{ trackPlaying ? '⏸' : '▶' }}</button>
    <n-checkbox
      size="small"
      :checked="trackLoop"
      :disabled="!skeletonStore.isLoaded"
      @update:checked="onLoopChange"
    >Loop</n-checkbox>
    <n-button
      size="tiny"
      title="Clear track"
      :disabled="!skeletonStore.isLoaded || !trackAnimation"
      @click="emit('clearTrack', animationStore.currentTrack)"
    >✕</n-button>
  </div>
</template>

<script setup lang="ts">
import { h, type VNodeChild } from 'vue'
import type { SelectOption, SelectProps } from 'naive-ui'
import AnimationSelect from '@/components/ui/AnimationSelect.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'

const emit = defineEmits<{
  setAnimation: [track: number, name: string, loop: boolean]
  setTrackLoop: [track: number, loop: boolean]
  clearTrack:   [track: number]
}>()

const skeletonStore  = useSkeletonStore()
const animationStore = useAnimationStore()

const TRACK_COUNT = 12
const trackOptions: SelectOption[] = Array.from({ length: TRACK_COUNT }, (_, i) => ({ label: `Track ${i}`, value: i }))
// Show all tracks without the default menu height cap.
const trackSelectTheme: SelectProps['themeOverrides'] = { peers: { InternalSelectMenu: { height: 'none' } } }

const liveTrack = computed(() =>
  animationStore.tracks.find(t => t.trackIndex === animationStore.currentTrack) ?? null,
)
const playlistHead = computed(() => animationStore.trackPlaylists[animationStore.currentTrack]?.[0] ?? null)

const trackAnimation = computed(() => liveTrack.value?.animationName ?? playlistHead.value?.animationName ?? null)

// Loop for a track without animation — used for the next animation picked here.
// The global animationStore.loop is not touched: its watcher rewrites loop on every track.
const emptyTrackLoop = ref(false)
const trackLoop = computed(() => liveTrack.value?.loop ?? playlistHead.value?.loop ?? emptyTrackLoop.value)

const trackPlaying = computed(() =>
  !!liveTrack.value && animationStore.isTrackPlaying(animationStore.currentTrack),
)

function renderTrackLabel(option: SelectOption): VNodeChild {
  const running = animationStore.tracks.some(t => t.trackIndex === option.value)
  return h('span', { style: running ? { color: '#3b82f6' } : undefined }, String(option.label ?? ''))
}

function onTrackChange(value: number) {
  animationStore.currentTrack = value
  // Blur so Space keeps controlling play/pause instead of reopening the select.
  ;(document.activeElement as HTMLElement | null)?.blur()
}

function onAnimSelect(name: string) {
  animationStore.selectedAnimation = name
  emit('setAnimation', animationStore.currentTrack, name, trackLoop.value)
}

function onLoopChange(loop: boolean) {
  if (trackAnimation.value) emit('setTrackLoop', animationStore.currentTrack, loop)
  else emptyTrackLoop.value = loop
}
</script>

<style scoped>
.track-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.track-controls__track { width: 96px; flex-shrink: 0; }
.track-controls__anim  { width: 220px; min-width: 0; }

.track-controls__play {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: #4ade80;
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.track-controls__play:hover:not(:disabled) { background: var(--c-raised); }
.track-controls__play--playing { color: var(--c-text-dim); }
.track-controls__play:disabled {
  color: var(--c-text-ghost);
  opacity: 0.5;
  cursor: default;
}
</style>
