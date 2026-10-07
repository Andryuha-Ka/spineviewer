import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SkeletonPanel from '@/components/panels/SkeletonPanel.vue'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useInspectorStore } from '@/core/stores/useInspectorStore'
import type { BoneLocalTransform, BoneTransform } from '@/core/types/ISpineAdapter'
import { makeFakeAdapter } from '../helpers/fakeAdapter'

describe('SkeletonPanel sliders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSkeletonStore().populate({ animations: ['idle'], skins: [], bones: [], slots: [], events: [] })
  })

  it('has no Sliders section without sliders', () => {
    const w = mount(SkeletonPanel)
    expect(w.find('.section--sliders').exists()).toBe(false)
    w.unmount()
  })

  it('lists live time and mix with two decimals', () => {
    useInspectorStore().sliders = [{
      name: 'blink', animation: 'blink', bone: null, property: null,
      time: 0.456, mix: 1, setupTime: 0, setupMix: 1, loop: false, additive: false,
    }]
    const w = mount(SkeletonPanel)
    const section = w.find('.section--sliders')
    expect(section.text()).toContain('Sliders')
    expect(section.text()).toContain('(1)')
    expect(section.find('.slider-row').text()).toBe('blinktime 0.46 · mix 1.00')
    w.unmount()
  })
})

describe('SkeletonPanel selected bone details', () => {
  const pose = (rotation: number, over: Partial<BoneLocalTransform> = {}): BoneLocalTransform =>
    ({ x: 10, y: 20, rotation, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, ...over })

  function setup() {
    setActivePinia(createPinia())
    const store = useSkeletonStore()
    store.populate({ animations: ['walk'], skins: [], bones: [{ name: 'root', parent: null }, { name: 'arm', parent: 'root' }], slots: [], events: [] })
    const adapter = makeFakeAdapter()
    let rot = 30
    adapter.getBoneLocalTransforms.mockImplementation(() => [{ name: 'arm', local: pose(rot), applied: pose(rot + 5) }])
    store.attachAdapter(adapter)
    const world = (r: number): BoneTransform => ({ name: 'arm', x: 1.25, y: 2, rotation: r, scaleX: 1.234, scaleY: 1, shearY: 12.34 })
    useInspectorStore().updateBones([world(40)])
    return { store, adapter, setRot: (r: number) => { rot = r }, world }
  }

  const row = (w: ReturnType<typeof mount>, label: string) => w.find(`.details-row[data-row="${label}"]`)
  const val = (w: ReturnType<typeof mount>, label: string, prop: string) => row(w, label).find(`[data-prop="${prop}"]`).text()

  it('is hidden while no bone is selected', () => {
    setup()
    const w = mount(SkeletonPanel)
    expect(w.find('.bone-details').exists()).toBe(false)
    w.unmount()
  })

  it('Details of an animated bone: local, applied and world rows refresh with the inspector update', async () => {
    const { store, setRot, world } = setup()
    store.selectedBone = 'arm'
    const w = mount(SkeletonPanel)
    expect(val(w, 'Local', 'rotation')).toBe('r30.0')
    expect(val(w, 'Applied', 'rotation')).toBe('r35.0')
    expect(val(w, 'World', 'rotation')).toBe('r40.0')
    expect(val(w, 'World', 'scaleX')).toBe('sx1.23')
    expect(val(w, 'World', 'shearX')).toBe('hx0.0')
    expect(val(w, 'World', 'shearY')).toBe('hy12.3')
    setRot(31.5)
    useInspectorStore().updateBones([world(41)])
    await nextTick()
    expect(val(w, 'Local', 'rotation')).toBe('r31.5')
    expect(val(w, 'World', 'rotation')).toBe('r41.0')
    w.unmount()
  })

  it('Override shown in the details: overridden Local fields get ●', async () => {
    const { store } = setup()
    store.selectedBone = 'arm'
    const w = mount(SkeletonPanel)
    expect(row(w, 'Local').text()).not.toContain('●')
    store.setBoneOverride('arm', { rotation: 30 })
    await nextTick()
    expect(val(w, 'Local', 'rotation')).toBe('r30.0●')
    expect(row(w, 'Applied').text()).not.toContain('●')
    w.unmount()
  })
})

describe('SkeletonPanel bone visible-effect status', () => {
  function setup() {
    setActivePinia(createPinia())
    useSkeletonStore().populate({ animations: ['idle'], skins: [], bones: [{ name: 'root', parent: null }, { name: 'glow', parent: null }, { name: 'arm', parent: null }], slots: [], events: [] })
    useInspectorStore().update([], [], [], [
      { name: 'root', visible: true, reason: null, keyed: false, constraints: [] },
      { name: 'glow', visible: false, reason: 'no-attachments', keyed: true, constraints: [] },
      { name: 'arm', visible: true, reason: null, keyed: false, constraints: ['arm-ik'] },
    ])
    const w = mount(SkeletonPanel)
    const rowOf = (name: string) => w.findAll('.bone-row').find(r => r.find('.bone-name').text() === name)!
    return { w, rowOf }
  }

  it('dims a bone without a visible effect and gives the reason as tooltip', () => {
    const { w, rowOf } = setup()
    expect(rowOf('glow').classes()).toContain('bone-row--inactive')
    expect(rowOf('glow').attributes('title')).toBe('No drawn attachments on this bone or its children')
    w.unmount()
  })

  it('a visible unconstrained bone has neither dimming nor tooltip; a constrained one gets the constraint line', () => {
    const { w, rowOf } = setup()
    expect(rowOf('root').classes()).not.toContain('bone-row--inactive')
    expect(rowOf('root').attributes('title')).toBeUndefined()
    expect(rowOf('arm').classes()).not.toContain('bone-row--inactive')
    expect(rowOf('arm').attributes('title')).toBe('Driven by arm-ik — constrained properties ignore local edits')
    w.unmount()
  })

  it('stays dimmed while selected and undims with the next refresh', async () => {
    const { w, rowOf } = setup()
    useSkeletonStore().selectedBone = 'glow'
    await nextTick()
    expect(rowOf('glow').classes()).toEqual(expect.arrayContaining(['bone-row--selected', 'bone-row--inactive']))
    useInspectorStore().update([], [], [], [{ name: 'glow', visible: true, reason: null, keyed: true, constraints: [] }])
    await nextTick()
    expect(rowOf('glow').classes()).not.toContain('bone-row--inactive')
    w.unmount()
  })
})
