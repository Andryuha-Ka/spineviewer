/**
 * @file useSkeletonStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import type { BoneInfo, SlotInfo, EventInfo, ISpineAdapter, BoneLocalTransform } from '@/core/types/ISpineAdapter'

export interface SkeletonPopulateData {
  animations: string[]
  skins: string[]
  bones: BoneInfo[]
  slots: SlotInfo[]
  events: EventInfo[]
  freeBones?: string[]
}

export const useSkeletonStore = defineStore('skeleton', () => {
  const animations   = ref<string[]>([])
  const skins        = ref<string[]>([])
  const bones        = ref<BoneInfo[]>([])
  const slots        = ref<SlotInfo[]>([])
  const events       = ref<EventInfo[]>([])
  const freeBones    = ref<string[]>([])
  /** Currently applied skin names — synced by AnimationPanel, read by PreviewStage for state save */
  const activeSkins     = ref<string[]>([])
  const selectedBone    = ref<string | null>(null)
  const selectedSlot    = ref<string | null>(null)
  const syncSelection   = ref(true)

  // Non-reactive adapter reference — not stored in a ref to avoid Proxy wrapping class instances
  let _adapter: ISpineAdapter | null = null

  const isLoaded = computed(() => animations.value.length > 0)

  function selectBone(name: string | null): void {
    selectedBone.value = selectedBone.value === name ? null : name
  }

  function selectSlot(name: string | null): void {
    selectedSlot.value = selectedSlot.value === name ? null : name
  }

  function attachAdapter(a: ISpineAdapter): void { _adapter = a }
  function detachAdapter(): void { _adapter = null }

  function setBoneTransform(boneName: string, transform: Partial<BoneLocalTransform>): void {
    _adapter?.setBoneLocalTransform(boneName, transform)
  }

  function getBoneSetupTransform(boneName: string): BoneLocalTransform | null {
    return _adapter?.getBoneSetupTransform(boneName) ?? null
  }

  function populate(data: SkeletonPopulateData) {
    animations.value = data.animations
    skins.value      = data.skins
    bones.value      = data.bones
    slots.value      = data.slots
    events.value     = data.events
    freeBones.value  = data.freeBones ?? []
  }

  function clear() {
    animations.value   = []
    skins.value        = []
    bones.value        = []
    slots.value        = []
    events.value       = []
    freeBones.value    = []
    activeSkins.value  = []
    selectedBone.value = null
    selectedSlot.value = null
    _adapter = null
  }

  return {
    animations, skins, bones, slots, events, freeBones, isLoaded,
    activeSkins,
    selectedBone, selectBone, selectedSlot, selectSlot, syncSelection,
    attachAdapter, detachAdapter, setBoneTransform, getBoneSetupTransform,
    populate, clear,
  }
})
