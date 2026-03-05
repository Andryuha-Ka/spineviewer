import { defineStore } from 'pinia'
import type { BoneInfo, SlotInfo, EventInfo } from '@/core/types/ISpineAdapter'

export const useSkeletonStore = defineStore('skeleton', () => {
  const animations = ref<string[]>([])
  const skins      = ref<string[]>([])
  const bones      = ref<BoneInfo[]>([])
  const slots      = ref<SlotInfo[]>([])
  const events     = ref<EventInfo[]>([])

  const isLoaded = computed(() => animations.value.length > 0)

  function populate(data: {
    animations: string[]
    skins: string[]
    bones: BoneInfo[]
    slots: SlotInfo[]
    events: EventInfo[]
  }) {
    animations.value = data.animations
    skins.value      = data.skins
    bones.value      = data.bones
    slots.value      = data.slots
    events.value     = data.events
  }

  function clear() {
    animations.value = []
    skins.value      = []
    bones.value      = []
    slots.value      = []
    events.value     = []
  }

  return { animations, skins, bones, slots, events, isLoaded, populate, clear }
})
