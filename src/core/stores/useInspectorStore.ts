/**
 * @file useInspectorStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { BoneTransform, AttachmentInfo, SliderInfo, BoneEffect } from '@/core/types/ISpineAdapter'

export const useInspectorStore = defineStore('inspector', () => {
  const boneTransforms    = ref<BoneTransform[]>([])
  const activeAttachments = ref<AttachmentInfo[]>([])
  const sliders           = ref<SliderInfo[]>([])
  const boneEffects       = ref<Record<string, BoneEffect>>({})

  function update(
    bones: BoneTransform[],
    attachments: AttachmentInfo[],
    liveSliders: SliderInfo[] = [],
    effects: BoneEffect[] = [],
  ) {
    boneTransforms.value    = bones
    activeAttachments.value = attachments
    sliders.value           = liveSliders
    // Unchanged effects keep the old object so the 10 Hz refresh triggers no panel re-render
    if (!sameEffects(boneEffects.value, effects)) boneEffects.value = Object.fromEntries(effects.map(e => [e.name, e]))
  }

  function sameEffects(prev: Record<string, BoneEffect>, next: BoneEffect[]): boolean {
    if (Object.keys(prev).length !== next.length) return false
    return next.every(e => {
      const p = prev[e.name]
      return !!p && p.visible === e.visible && p.reason === e.reason && p.keyed === e.keyed
        && p.constraints.length === e.constraints.length && p.constraints.every((c, i) => c === e.constraints[i])
    })
  }

  function updateBones(bones: BoneTransform[]) {
    boneTransforms.value = bones
  }

  function clear() {
    boneTransforms.value    = []
    activeAttachments.value = []
    sliders.value           = []
    boneEffects.value       = {}
  }

  return { boneTransforms, activeAttachments, sliders, boneEffects, update, updateBones, clear }
})
