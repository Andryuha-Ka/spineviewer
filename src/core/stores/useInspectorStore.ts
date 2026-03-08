/**
 * @file useInspectorStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { BoneTransform, AttachmentInfo } from '@/core/types/ISpineAdapter'

export const useInspectorStore = defineStore('inspector', () => {
  const boneTransforms    = ref<BoneTransform[]>([])
  const activeAttachments = ref<AttachmentInfo[]>([])

  function update(bones: BoneTransform[], attachments: AttachmentInfo[]) {
    boneTransforms.value    = bones
    activeAttachments.value = attachments
  }

  function clear() {
    boneTransforms.value    = []
    activeAttachments.value = []
  }

  return { boneTransforms, activeAttachments, update, clear }
})
