/**
 * @file useInspectorStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { BoneTransform, AttachmentInfo, SliderInfo } from '@/core/types/ISpineAdapter'

export const useInspectorStore = defineStore('inspector', () => {
  const boneTransforms    = ref<BoneTransform[]>([])
  const activeAttachments = ref<AttachmentInfo[]>([])
  const sliders           = ref<SliderInfo[]>([])

  function update(bones: BoneTransform[], attachments: AttachmentInfo[], liveSliders: SliderInfo[] = []) {
    boneTransforms.value    = bones
    activeAttachments.value = attachments
    sliders.value           = liveSliders
  }

  function updateBones(bones: BoneTransform[]) {
    boneTransforms.value = bones
  }

  function clear() {
    boneTransforms.value    = []
    activeAttachments.value = []
    sliders.value           = []
  }

  return { boneTransforms, activeAttachments, sliders, update, updateBones, clear }
})
