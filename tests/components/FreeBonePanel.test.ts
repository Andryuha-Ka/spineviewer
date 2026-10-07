import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FreeBonePanel from '@/components/panels/FreeBonePanel.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useSkeletonEditStore, type EditState } from '@/core/stores/useSkeletonEditStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { SvpError } from '@/core/api/svpErrors'
import type { FileSet } from '@/core/types/FileSet'
import type { BoneLocalTransform, SliderInfo, TrackState } from '@/core/types/ISpineAdapter'
import { makeFakeAdapter, track } from '../helpers/fakeAdapter'

const BLINK: SliderInfo = {
  name: 'blink', animation: 'blink', bone: null, property: null,
  time: 0.2, mix: 1, setupTime: 0.2, setupMix: 1, loop: false, additive: false,
}

function populate(freeBones: string[], sliders: SliderInfo[]) {
  const store = useSkeletonStore()
  store.populate({ animations: [], skins: [], bones: [], slots: [], events: [], freeBones, sliders })
  return store
}

describe('FreeBonePanel sliders', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  async function commit(index: number, value: string) {
    const input = wrapper.findAll('.slider-list input')[index]
    await input.setValue(value) // fires input + change
    return input.element as HTMLInputElement
  }

  it('shows only the Sliders section when there are no free bones', () => {
    populate([], [BLINK])
    wrapper = mount(FreeBonePanel)
    expect(wrapper.text()).not.toContain('not keyframed')
    expect(wrapper.text()).toContain('Sliders')
    expect(wrapper.text()).toContain('1 slider')
    const [time, mix] = wrapper.findAll('.slider-list input').map(i => i.element as HTMLInputElement)
    expect([time.value, mix.value]).toEqual(['0.2', '1'])
  })

  it('keeps the free-bone hint and hides Sliders without sliders', () => {
    populate(['a', 'b'], [])
    wrapper = mount(FreeBonePanel)
    expect(wrapper.text()).toContain('2 bones · not keyframed')
    expect(wrapper.text()).not.toContain('Sliders')
  })

  it('applies committed values, clamps them and ignores non-numeric input', async () => {
    const store = populate([], [BLINK])
    const spy = vi.spyOn(store, 'setSliderPose')
    wrapper = mount(FreeBonePanel)
    await commit(0, '0.5')
    expect((await commit(1, '2')).value).toBe('1')
    await commit(0, '-3')
    expect((await commit(0, 'x')).value).toBe('0')
    expect(spy.mock.calls).toEqual([['blink', { time: 0.5 }], ['blink', { mix: 1 }], ['blink', { time: 0 }]])
  })

  it('↺ resets inputs and the slider; a skeleton switch drops edits', async () => {
    const store = populate([], [BLINK])
    const spy = vi.spyOn(store, 'resetSlider')
    wrapper = mount(FreeBonePanel)
    await commit(0, '0.7')
    await wrapper.find('.slider-list .reset-btn').trigger('click')
    expect(spy).toHaveBeenCalledWith('blink')
    expect((wrapper.findAll('.slider-list input')[0].element as HTMLInputElement).value).toBe('0.2')
    await commit(0, '0.9')
    store.sliders = [{ ...BLINK }]
    await nextTick()
    expect((wrapper.findAll('.slider-list input')[0].element as HTMLInputElement).value).toBe('0.2')
  })
})

describe('FreeBonePanel free bones', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  const SETUP: BoneLocalTransform = { x: 1, y: 2, rotation: 3, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }

  function adapterWithSetup() {
    const a = makeFakeAdapter()
    a.getBoneSetupTransform.mockImplementation(() => ({ ...SETUP }))
    return a
  }

  const inputs = () => wrapper.findAll('.bone-list:not(.slider-list) input').map(i => i.element as HTMLInputElement)
  const values = () => inputs().map(i => i.value)

  function mountWith(adapter = adapterWithSetup()) {
    const store = populate(['tail'], [])
    store.attachAdapter(adapter)
    wrapper = mount(FreeBonePanel)
    return { store, adapter }
  }

  it('shows setup values until a field is overridden, then the override', async () => {
    const { adapter } = mountWith()
    expect(values()).toEqual(['1', '2', '3'])
    await wrapper.findAll('.bone-list input')[2].setValue('45')
    expect(adapter.setBoneOverride).toHaveBeenCalledWith('tail', { rotation: 45 })
    expect(values()).toEqual(['1', '2', '45'])
  })

  it('ignores non-numeric input and restores the shown value', async () => {
    const { adapter } = mountWith()
    await wrapper.findAll('.bone-list input')[0].setValue('abc')
    expect(adapter.setBoneOverride).not.toHaveBeenCalled()
    expect(values()[0]).toBe('1')
  })

  it('↺ releases x, y and rotation and keeps other held fields', async () => {
    const { store, adapter } = mountWith()
    store.setBoneOverride('tail', { x: 9, rotation: 45, shearX: 5 })
    await nextTick()
    expect(values()).toEqual(['9', '2', '45'])
    await wrapper.find('.bone-list .reset-btn').trigger('click')
    expect(adapter.overrides).toEqual({ tail: { shearX: 5 } })
    expect(values()).toEqual(['1', '2', '3'])
  })

  it('a value survives switching to another skeleton and back (store mirror)', async () => {
    const { store, adapter } = mountWith()
    await wrapper.findAll('.bone-list input')[2].setValue('45')
    store.attachAdapter(adapterWithSetup())
    await nextTick()
    expect(values()).toEqual(['1', '2', '3'])
    store.attachAdapter(adapter)
    await nextTick()
    expect(values()).toEqual(['1', '2', '45'])
  })
})

describe('FreeBonePanel Bone section', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals() })

  const LOCAL: BoneLocalTransform = { x: 5, y: 6, rotation: 10, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }
  const STATE: EditState = { edited: false, unsaved: false, overrides: 0, warnings: [], canUndo: false, canRedo: false }

  function mountEditor(opts: { state?: Partial<EditState>; tracks?: TrackState[]; selected?: string | null } = {}) {
    const store = useSkeletonStore()
    store.populate({ animations: ['walk', 'wave'], skins: [], bones: [{ name: 'root', parent: null }, { name: 'arm', parent: 'root' }], slots: [], events: [] })
    const adapter = makeFakeAdapter(opts.tracks ?? [])
    adapter.getBoneLocalTransforms.mockImplementation(() => [{ name: 'arm', local: { ...LOCAL, ...adapter.overrides.arm }, applied: LOCAL }])
    store.attachAdapter(adapter)
    store.selectedBone = opts.selected === undefined ? 'arm' : opts.selected
    const fileSet: FileSet = {
      skeleton: { filename: 'hero.json', fileBody: '{}', type: 'skeleton-json', mimeType: '' },
      atlas: { filename: 'a.atlas', fileBody: '', type: 'atlas', mimeType: '' },
      images: [],
    }
    useFileLoaderStore().setSlots([{ id: 'hero', name: 'hero', fileSet }], '4.2')
    useSlotSelectionStore().activeSlotId = 'hero'
    useAnimationStore().tracks = opts.tracks ?? []
    const edit = useSkeletonEditStore()
    vi.spyOn(edit, 'getEditState').mockReturnValue({ ...STATE, ...opts.state })
    wrapper = mount(FreeBonePanel)
    return { store, adapter, edit }
  }

  const field = (prop: string) => wrapper.find(`.bone-editor input[data-prop="${prop}"]`)
  const fieldValue = (prop: string) => (field(prop).element as HTMLInputElement).value
  const btn = (act: string) => wrapper.find(`.act-btn[data-act="${act}"]`)
  const label = (text: string) => wrapper.findAll('.editor-label').find(l => l.text().startsWith(text))!
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('shows "Select a bone" and no inputs with no bone selected; picking selects it', async () => {
    const { store } = mountEditor({ selected: null })
    expect(wrapper.find('.editor-hint').text()).toBe('Select a bone')
    expect(wrapper.findAll('.bone-editor input[data-prop]')).toHaveLength(0)
    const select = wrapper.findComponent({ name: 'Select' })
    expect(select.props('options')).toEqual([{ label: 'root', value: 'root' }, { label: 'arm', value: 'arm' }])
    expect(select.props('filterable')).toBe(true)
    select.vm.$emit('update:value', 'arm')
    await nextTick()
    expect(store.selectedBone).toBe('arm')
    expect(wrapper.findAll('.bone-editor input[data-prop]')).toHaveLength(7)
  })

  it('shows live local values with the spec steps', () => {
    mountEditor()
    expect(fieldValue('rotation')).toBe('10')
    expect(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'].map(p => field(p).attributes('step')))
      .toEqual(['1', '1', '0.5', '0.01', '0.01', '0.5', '0.5'])
  })

  it('Edit a keyed bone: Rotation 45 sets an override and marks the field', async () => {
    const { adapter } = mountEditor()
    expect(label('Rotation').text()).toBe('Rotation')
    await field('rotation').setValue('45')
    expect(adapter.setBoneOverride).toHaveBeenCalledWith('arm', { rotation: 45 })
    expect(label('Rotation').text()).toBe('Rotation●')
    expect(fieldValue('rotation')).toBe('45')
  })

  it('Shear input: Shear Y 20 overrides shearY; non-numeric input is ignored', async () => {
    const { adapter } = mountEditor()
    await field('shearY').setValue('20')
    expect(adapter.overrides).toEqual({ arm: { shearY: 20 } })
    await field('x').setValue('abc')
    expect(adapter.setBoneOverride).toHaveBeenCalledTimes(1)
    expect(fieldValue('x')).toBe('5')
  })

  it('refreshes live values every 100 ms except while an input has focus', async () => {
    const { adapter } = mountEditor()
    await field('x').trigger('focus')
    adapter.getBoneLocalTransforms.mockImplementation(() => [{ name: 'arm', local: { ...LOCAL, x: 99 }, applied: LOCAL }])
    await wait(150)
    expect(fieldValue('x')).toBe('5')
    await field('x').trigger('blur')
    await wait(150)
    expect(fieldValue('x')).toBe('99')
  })

  it('Release clears every override of the bone', async () => {
    const { store, adapter } = mountEditor()
    expect(btn('release').attributes('disabled')).toBeDefined()
    store.setBoneOverride('arm', { x: 1, rotation: 2 })
    await nextTick()
    await btn('release').trigger('click')
    expect(adapter.overrides).toEqual({})
  })

  it('Key at current time keys the current track animation at its time', async () => {
    const { store, edit } = mountEditor({ tracks: [track(0, 'wave', 2.5)] })
    const key = vi.spyOn(edit, 'keyCurrentPose').mockResolvedValue([])
    expect(btn('key').attributes('disabled')).toBeDefined()
    store.setBoneOverride('arm', { rotation: 30 })
    await nextTick()
    await btn('key').trigger('click')
    expect(key).toHaveBeenCalledWith('wave', ['arm'], 0.5)
  })

  it('Key without an animation: disabled with the tooltip', async () => {
    const { store } = mountEditor()
    store.setBoneOverride('arm', { rotation: 30 })
    await nextTick()
    expect(btn('key').attributes('disabled')).toBeDefined()
    expect(btn('key').element.parentElement!.getAttribute('title')).toBe('Set an animation on the current track to key it')
  })

  it('Apply to setup pose writes the selected bone and shows store errors without the code', async () => {
    const { edit } = mountEditor()
    const apply = vi.spyOn(edit, 'applyOverridesToSetupPose').mockRejectedValue(new SvpError('INVALID_STATE', 'Reload failed'))
    await btn('apply').trigger('click')
    await flushPromises()
    expect(apply).toHaveBeenCalledWith(['arm'])
    expect(wrapper.find('.editor-error').text()).toBe('Reload failed')
  })

  it('New animation: an empty or existing name is refused; a new one is created and set on the current track', async () => {
    const { edit } = mountEditor()
    const create = vi.spyOn(edit, 'createAnimation').mockResolvedValue()
    for (const name of ['  ', 'walk']) {
      vi.stubGlobal('prompt', vi.fn(() => name))
      await btn('new-anim').trigger('click')
      expect(wrapper.find('.editor-error').text()).toBe('Animation name is empty or already exists')
    }
    expect(create).not.toHaveBeenCalled()
    vi.stubGlobal('prompt', vi.fn(() => 'jump'))
    await btn('new-anim').trigger('click')
    await flushPromises()
    expect(create).toHaveBeenCalledWith('jump')
    expect(wrapper.emitted('set-animation')).toEqual([[0, 'jump', false]])
    expect(useAnimationStore().selectedAnimation).toBe('jump')
    expect(wrapper.find('.editor-error').exists()).toBe(false)
  })

  it('Undo / Redo / Revert follow the edit state and carry the tooltips', async () => {
    const { edit } = mountEditor({ state: { edited: true, canUndo: true, canRedo: false } })
    const undo = vi.spyOn(edit, 'undo').mockResolvedValue()
    const revert = vi.spyOn(edit, 'revertToSource').mockResolvedValue()
    expect(btn('undo').attributes('disabled')).toBeUndefined()
    expect(btn('redo').attributes('disabled')).toBeDefined()
    expect(btn('undo').element.parentElement!.getAttribute('title')).toBe('Undo last skeleton edit')
    expect(btn('redo').element.parentElement!.getAttribute('title')).toBe('Redo skeleton edit')
    await btn('undo').trigger('click')
    await btn('revert').trigger('click')
    expect(undo).toHaveBeenCalled()
    expect(revert).toHaveBeenCalled()
  })

  it('disables every action while the edit store is busy', async () => {
    const { edit, store } = mountEditor({ state: { edited: true, canUndo: true, canRedo: true }, tracks: [track(0, 'wave')] })
    store.setBoneOverride('arm', { rotation: 1 })
    edit.busy = true
    await nextTick()
    expect(wrapper.findAll('.act-btn').every(b => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('Mark after a key / after export; no mark for overrides alone', () => {
    mountEditor({ state: { edited: true, unsaved: true } })
    expect(wrapper.find('.skeleton-name').text()).toBe('hero')
    expect(wrapper.find('.edited-mark').attributes('title')).toBe('Skeleton data edited — export to keep changes')
    wrapper.unmount()
    setActivePinia(createPinia())
    mountEditor({ state: { edited: true, unsaved: false } })
    expect(wrapper.find('.edited-mark').attributes('title')).toBe('Skeleton data edited')
    wrapper.unmount()
    setActivePinia(createPinia())
    mountEditor({ state: { overrides: 2 } })
    expect(wrapper.find('.edited-mark').exists()).toBe(false)
  })

  it('shows "Conversion warnings: N" with the list in the tooltip', () => {
    mountEditor({ state: { warnings: ['Skipped a', 'Skipped b'] } })
    const w = wrapper.find('.editor-warnings')
    expect(w.text()).toBe('Conversion warnings: 2')
    expect(w.attributes('title')).toBe('Skipped a\nSkipped b')
  })

  it('keeps the free-bones and Sliders sections below the Bone section', () => {
    useSkeletonStore().populate({ animations: [], skins: [], bones: [], slots: [], events: [], freeBones: ['tail'], sliders: [BLINK] })
    wrapper = mount(FreeBonePanel)
    const text = wrapper.text()
    expect(text.indexOf('Bone')).toBeLessThan(text.indexOf('not keyframed'))
    expect(text.indexOf('not keyframed')).toBeLessThan(text.indexOf('Sliders'))
  })
})
