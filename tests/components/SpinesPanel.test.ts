import { describe, it, expect, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SpinesPanel from '@/components/panels/SpinesPanel.vue'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { makeFakeAdapter } from '../helpers/fakeAdapter'
import type { FileSet } from '@/core/types/FileSet'

const FILESET: FileSet = {
  skeleton: { filename: 's.json', fileBody: '{}', type: 'skeleton-json', mimeType: '' },
  atlas:    { filename: 's.atlas', fileBody: '', type: 'atlas', mimeType: '' },
  images:   [],
}

describe('SpinesPanel clone', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('cloning the active slot carries its live bone overrides into the clone', async () => {
    const loader = useFileLoaderStore()
    loader.setSlots([{ id: 'a', name: 'a', fileSet: FILESET }], '4.2')
    useSkeletonStore().populateFrom(makeFakeAdapter())
    useSkeletonStore().setBoneOverride('arm', { rotation: 30 })

    const w = shallowMount(SpinesPanel)
    await w.find('.spine-clone-btn').trigger('click')
    const clone = loader.spineSlots.find(s => s.id !== 'a')!
    expect(clone.savedState?.boneOverrides).toEqual({ arm: { rotation: 30 } })
    w.unmount()
  })
})

describe('SpinesPanel edited mark', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function editedSlot() {
    const loader = useFileLoaderStore()
    loader.setSlots([{ id: 'a', name: 'a', fileSet: FILESET }], '4.2')
    useSlotSelectionStore().setActiveSlot('a')
    const slot = loader.spineSlots[0]
    slot.fileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, fileBody: '{"bones":[]}' } }
    slot.edit = { source: FILESET.skeleton, unsaved: true, warnings: [], undo: ['{}'], redo: [] }
    return slot
  }

  it('shows both the modified dot and the star, with the unsaved tooltip', async () => {
    const slot = editedSlot()
    useAnimationStore().trackPlaylists = { 0: [{ name: 'idle', loop: true }] } as never
    const w = shallowMount(SpinesPanel)
    await w.vm.$nextTick()
    expect(w.find('.spine-modified-dot').exists()).toBe(true)
    expect(w.find('.spine-edited-mark').attributes('title')).toBe('Skeleton data edited — export to keep changes')

    slot.edit!.unsaved = false
    await w.vm.$nextTick()
    expect(w.find('.spine-edited-mark').attributes('title')).toBe('Skeleton data edited')
    w.unmount()
  })

  it('revert clears the mark; overrides alone never show it', async () => {
    const slot = editedSlot()
    useSkeletonStore().populateFrom(makeFakeAdapter())
    useSkeletonStore().setBoneOverride('arm', { rotation: 30 })
    const w = shallowMount(SpinesPanel)
    expect(w.find('.spine-edited-mark').exists()).toBe(true)

    slot.fileSet = { ...slot.fileSet!, skeleton: slot.edit!.source }
    await w.vm.$nextTick()
    expect(w.find('.spine-edited-mark').exists()).toBe(false)
    w.unmount()
  })
})
