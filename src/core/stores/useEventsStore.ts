/**
 * @file useEventsStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { SpineEvent, AnimationEventMarker } from '@/core/types/ISpineAdapter'

export interface AnimationMarkerEntry extends AnimationEventMarker {
  trackIndex: number
  animationName: string
}

export const useEventsStore = defineStore('events', () => {
  // Static markers: which events fire in current animations (set by PreviewStage)
  const animationMarkers = ref<AnimationMarkerEntry[]>([])

  // Flash timestamps: event name → performance.now() when last fired
  const lastFiredAt = ref<Map<string, number>>(new Map())

  function push(event: SpineEvent): void {
    const next = new Map(lastFiredAt.value)
    next.set(event.name, performance.now())
    lastFiredAt.value = next
  }

  function setAnimationMarkers(markers: AnimationMarkerEntry[]): void {
    animationMarkers.value = markers
  }

  function clear(): void {
    lastFiredAt.value = new Map()
  }

  return {
    animationMarkers, lastFiredAt,
    push, setAnimationMarkers, clear,
  }
})
