import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSkeletonEditStore } from '@/core/stores/useSkeletonEditStore'
import type { FileSet, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'
import type { SliderInfo } from '@/core/types/ISpineAdapter'

vi.mock('@/components/stage/PreviewStage.vue', () => ({ default: { name: 'PreviewStage', render: () => null } }))
const { default: ViewerPage } = await import('@/components/pages/ViewerPage.vue')

const SLIDER = {
  name: 's', animation: 's', bone: null, property: null,
  time: 0, mix: 1, setupTime: 0, setupMix: 1, loop: false, additive: false,
} satisfies SliderInfo

const SAVED: SpineSlotSavedState = {
  speed: 1, selectedAnimation: null, currentTrack: 0, loop: true, trackEnabled: {},
  trackPlaylists: {}, wasPlaying: false, selectedSkins: [],
  showPlaceholders: true, disabledPlaceholders: [], syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1,
}

const FILESET: FileSet = {
  skeleton: { filename: 'hero.json', fileBody: '{}', type: 'skeleton-json', mimeType: '' },
  atlas:    { filename: 'hero.atlas', fileBody: '', type: 'atlas', mimeType: '' },
  images:   [],
}
const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, fileSet: FILESET, ...extra })

const mountViewer = () => shallowMount(ViewerPage, { global: { renderStubDefaultSlot: true } })
const hasBonesTab = (w: ReturnType<typeof mountViewer>) => w.findAll('tab-pane-stub').some(p => p.attributes('name') === 'bones')
const tabsValue = (w: ReturnType<typeof mountViewer>) => w.find('tabs-stub').attributes('value')

describe('ViewerPage Bones tab', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function activate(slots: SpineSlot[], freeBones: string[] = [], sliders: SliderInfo[] = []) {
    useFileLoaderStore().setSlots(slots, '4.2')
    useSlotSelectionStore().activeSlotId = slots[0]?.id ?? null
    useSkeletonStore().populate({ animations: [], skins: [], bones: [{ name: 'root', parent: null }], slots: [], events: [], freeBones, sliders })
  }

  it('Skeleton with no free bones: the tab is present', () => {
    activate([slot('hero')])
    const w = mountViewer()
    expect(hasBonesTab(w)).toBe(true)
    w.unmount()
  })

  it('shows for free bones and for sliders', () => {
    activate([slot('hero')], ['a'], [SLIDER])
    const w = mountViewer()
    expect(hasBonesTab(w)).toBe(true)
    w.unmount()
  })

  it('No active skeleton: absent when every slot has errors', () => {
    activate([slot('hero', { error: 'Missing atlas' })])
    const w = mountViewer()
    expect(hasBonesTab(w)).toBe(false)
    w.unmount()
  })

  it('stays through the store clear of a slot switch', async () => {
    activate([slot('hero')])
    const w = mountViewer()
    useSkeletonStore().clear()
    await nextTick()
    expect(hasBonesTab(w)).toBe(true)
    w.unmount()
  })

  it('falls back to Anim when it disappears while open', async () => {
    activate([slot('hero')])
    const w = mountViewer()
    w.findComponent({ name: 'Tabs' }).vm.$emit('update:value', 'bones')
    await nextTick()
    expect(tabsValue(w)).toBe('bones')
    useSlotSelectionStore().activeSlotId = null
    await nextTick()
    await nextTick()
    expect(hasBonesTab(w)).toBe(false)
    expect(tabsValue(w)).toBe('animation')
    w.unmount()
  })
})

describe('ViewerPage leaving', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useFileLoaderStore().setSlots([
      slot('hero', { edit: { source: { ...FILESET.skeleton, filename: 'hero-src.json' }, unsaved: true, warnings: [], undo: ['{}'], redo: [] } }),
      slot('bonus', { savedState: { ...SAVED, boneOverrides: { tip: { x: 1 } } } }),
      slot('plain'),
    ], '4.2')
    useSlotSelectionStore().activeSlotId = 'hero'
    useSkeletonStore().boneOverrides = { arm: { rotation: 5 } }
  })
  afterEach(() => vi.unstubAllGlobals())

  it('Back with unsaved edits names each skeleton and what it would lose; declining keeps the session', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const w = mountViewer()
    await w.find('.back-btn').trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Reset viewer and return to version picker? Unsaved work will be lost: hero (edits and overrides), bonus (overrides).')
    expect(useFileLoaderStore().spineSlots).toHaveLength(3)
    expect(w.emitted('back')).toBeUndefined()
    w.unmount()
  })

  it('Reset on leaving the viewer: confirming clears slots, edits and overrides', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const w = mountViewer()
    await w.find('.back-btn').trigger('click')
    expect(useFileLoaderStore().spineSlots).toHaveLength(0)
    expect(useSkeletonStore().boneOverrides).toEqual({})
    expect(useSkeletonEditStore().hasUnsavedEdits).toBe(false)
    expect(w.emitted('back')).toHaveLength(1)
    w.unmount()
  })

  it('keeps the old text without unsaved work', async () => {
    useFileLoaderStore().setSlots([slot('plain')], '4.2')
    useSkeletonStore().boneOverrides = {}
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const w = mountViewer()
    await w.find('.back-btn').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Reset viewer and return to version picker?')
    w.unmount()
  })
})

describe('App leave-page prompt', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function fire(): boolean {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('prevents unload only while there is unsaved work', async () => {
    const { default: App } = await import('@/App.vue')
    const w = shallowMount(App)
    expect(fire()).toBe(false)
    useFileLoaderStore().setSlots([slot('hero'), slot('bonus', { savedState: { ...SAVED, boneOverrides: { tip: { x: 1 } } } })], '4.2')
    useSlotSelectionStore().activeSlotId = 'hero'
    expect(fire()).toBe(true)
    useFileLoaderStore().setSlots([slot('hero')], '4.2')
    expect(fire()).toBe(false)
    useSkeletonStore().boneOverrides = { arm: { rotation: 1 } }
    expect(fire()).toBe(true)
    w.unmount()
    expect(fire()).toBe(false)
  })
})

describe('ViewerPage canvas drop', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function drop(
    result: { slots: []; ignored: number; error: string | null },
    files = [new File(['{}'], 'a.json'), new File([''], 'a.atlas')],
  ) {
    const add = vi.spyOn(useFileLoaderStore(), 'addFileList').mockResolvedValue(result)
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    const w = shallowMount(ViewerPage, { global: { renderStubDefaultSlot: true } })
    await w.find('.stage-area').trigger('drop', { dataTransfer: { files } })
    await flushPromises()
    w.unmount()
    vi.unstubAllGlobals()
    return { add, alert, files }
  }

  it('hands spine files to the loader store', async () => {
    const { add, alert, files } = await drop({ slots: [], ignored: 0, error: null })
    expect(add).toHaveBeenCalledWith(files)
    expect(alert).not.toHaveBeenCalled()
  })

  it('alerts the load error', async () => {
    const { alert } = await drop({ slots: [], ignored: 0, error: 'Missing atlas file (.atlas)' })
    expect(alert).toHaveBeenCalledWith('Missing atlas file (.atlas)')
  })

  it('hands a zip to the loader store and alerts an unreadable archive', async () => {
    const zip = [new File(['garbage'], 'broken.zip')]
    const { add, alert } = await drop({ slots: [], ignored: 0, error: 'Cannot read archive: broken.zip' }, zip)
    expect(add).toHaveBeenCalledWith(zip)
    expect(alert).toHaveBeenCalledWith('Cannot read archive: broken.zip')
  })
})
