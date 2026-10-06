import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AnimationPanel from '@/components/panels/AnimationPanel.vue'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import type { TrackState } from '@/core/types/ISpineAdapter'

const LIST = [
  { animationName: 'A', loop: true },
  { animationName: 'B', loop: false },
  { animationName: 'C', loop: false },
]

function live(name: string, queue: string[], time = 0.5): TrackState {
  return {
    trackIndex: 0, animationName: name, time, duration: 1, loop: false, timeScale: 1,
    queue: queue.map(animationName => ({ animationName, loop: false })),
    mixDuration: 0,
  }
}

function rowStates(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.track-entry').map(el =>
    ['played', 'current', 'upcoming'].find(s => el.classes(`track-entry--${s}`)) ?? 'live',
  )
}

describe('AnimationPanel track list', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  it('renders the whole list with played, current and upcoming rows', async () => {
    const anim = useAnimationStore()
    anim.setTrackPlaylist(0, LIST)
    anim.tracks = [live('B', ['C'])]
    wrapper = mount(AnimationPanel)
    expect(rowStates(wrapper)).toEqual(['played', 'current', 'upcoming'])
    expect(wrapper.findAll('.track-entry--current .track-play-btn')).toHaveLength(1)
  })

  it('resets the marks when a looping list is re-armed', () => {
    const anim = useAnimationStore()
    anim.setTrackPlaylist(0, LIST)
    anim.tracks = [live('C', ['A', 'B', 'C'])]
    wrapper = mount(AnimationPanel)
    expect(rowStates(wrapper)).toEqual(['played', 'played', 'current'])
  })

  it('greys every row when a list without Loop has finished', () => {
    const anim = useAnimationStore()
    anim.setTrackPlaylist(0, LIST.map(e => ({ ...e, loop: false })))
    anim.tracks = [live('C', [], 1)]
    wrapper = mount(AnimationPanel)
    expect(rowStates(wrapper)).toEqual(['played', 'played', 'played'])
  })

  it('emits the playlist index from ✕ on played and upcoming rows, current ✕ disabled', async () => {
    const anim = useAnimationStore()
    anim.setTrackPlaylist(0, LIST)
    anim.tracks = [live('B', ['C'])]
    wrapper = mount(AnimationPanel)
    const rows = wrapper.findAll('.track-entry')
    const currentX = rows[1].findAll('button').find(b => b.text() === '✕')!
    expect(currentX.attributes('disabled')).toBeDefined()
    await currentX.trigger('click')
    await rows[0].findAll('button').find(b => b.text() === '✕')!.trigger('click')
    await rows[2].findAll('button').find(b => b.text() === '✕')!.trigger('click')
    expect(wrapper.emitted('removeQueueEntry')).toEqual([[0, 0], [0, 2]])
  })

  it('toggles Loop once when the label text is clicked', async () => {
    const anim = useAnimationStore()
    anim.tracks = [{ ...live('A', []), trackIndex: 2 }]
    wrapper = mount(AnimationPanel)
    await wrapper.find('.track-loop-text').trigger('click')
    expect(wrapper.emitted('setTrackLoop')).toEqual([[2, true]])
  })
})

describe('AnimationPanel global Loop switch', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  function mountTracks() {
    const anim = useAnimationStore()
    anim.setTrackPlaylist(2, [{ animationName: 'A', loop: true }, { animationName: 'B', loop: false }])
    anim.setTrackEnabled(1, false)
    anim.tracks = [
      { ...live('A', []), trackIndex: 0 },
      { ...live('A', []), trackIndex: 1 },
      { ...live('A', ['B']), trackIndex: 2 },
    ]
    wrapper = mount(AnimationPanel)
    return anim
  }

  const flip = (v: boolean) => wrapper.findComponent({ name: 'Switch' }).vm.$emit('update:value', v)

  it('sets Loop on every track not already looping', () => {
    const anim = mountTracks()
    flip(true)
    expect(wrapper.emitted('setTrackLoop')).toEqual([[0, true], [1, true]])
    expect(anim.loop).toBe(true)
  })

  it('turns Loop off only on looping tracks', () => {
    const anim = mountTracks()
    anim.loop = true
    flip(false)
    expect(wrapper.emitted('setTrackLoop')).toEqual([[2, false]])
    expect(anim.loop).toBe(false)
  })

  it('explains the switch in its tooltip', () => {
    wrapper = mount(AnimationPanel)
    const row = wrapper.find('section[title^="Sets Loop"]')
    expect(row.find('.n-switch').exists()).toBe(true)
    expect(row.attributes('title'))
      .toBe('Sets Loop on every track of this skeleton; new animations start with this value')
  })

  it('only updates the default when there are no tracks', () => {
    const anim = useAnimationStore()
    wrapper = mount(AnimationPanel)
    flip(true)
    expect(wrapper.emitted('setTrackLoop')).toBeUndefined()
    expect(anim.loop).toBe(true)
  })
})

describe('AnimationPanel track mix options', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  const INTERP = ['linear', 'smooth', 'slowFast', 'fastSlow', 'circle']

  function mountWith(mixInterpolations: string[], track: Partial<TrackState> = {}) {
    useSkeletonStore().populate({ animations: ['A'], skins: [], bones: [], slots: [], events: [], mixInterpolations })
    useAnimationStore().tracks = [{ ...live('A', []), trackIndex: 1, ...track }]
    wrapper = mount(AnimationPanel)
  }

  const MIX_TITLE = 'Crossfade from the previous animation on this track, in milliseconds. 0 = instant switch'
  const CURVE_TITLE = 'Shapes the crossfade set by Mix (ms). No effect at 0 ms'
  const ADDITIVE_TITLE = "Adds this track's animation on top of lower tracks — visible when tracks key the same bones"

  const labels = () => wrapper.findAll('.track-mix-row .track-loop-text').map(el => el.text())
  const mixInput = () => wrapper.findComponent({ name: 'InputNumber' })

  it('shows only Mix (ms) before Spine 4.3', () => {
    mountWith([])
    expect(labels()).toEqual(['Mix (ms)'])
    expect(wrapper.find('.track-mix-row [title]').attributes('title')).toBe(MIX_TITLE)
    expect(mixInput().props('value')).toBe(0)
    expect(wrapper.findComponent({ name: 'Select' }).exists()).toBe(false)
  })

  it('shows Mix (ms), Additive and Curve in order with tooltips on 4.3', () => {
    mountWith(INTERP)
    expect(labels()).toEqual(['Mix (ms)', 'Additive', 'Curve'])
    const titles = wrapper.findAll('.track-mix-row > [title]').map(el => el.attributes('title'))
    expect(titles).toEqual([MIX_TITLE, ADDITIVE_TITLE, CURVE_TITLE])
    const row = wrapper.find('.track-mix-row')
    expect(row.find('.n-checkbox').classes()).not.toContain('n-checkbox--checked')
    expect(row.find('.track-mix-select').text()).toContain('Linear')
  })

  it('shows the live mixDuration in ms', () => {
    mountWith([], { mixDuration: 0.4 })
    expect(mixInput().props('value')).toBe(400)
  })

  it('emits clamped mixDuration in seconds from ms input and ignores empty input', () => {
    mountWith([])
    for (const v of [-1, 12000, 333.4, null, NaN]) mixInput().vm.$emit('update:value', v)
    expect(wrapper.emitted('setTrackMixOptions')).toEqual([
      [1, { mixDuration: 0 }], [1, { mixDuration: 5 }], [1, { mixDuration: 0.333 }],
    ])
  })

  it('lists the Curve options in runtime order with display labels', () => {
    mountWith(INTERP)
    const options = wrapper.findComponent({ name: 'Select' }).props('options') as { label: string }[]
    expect(options.map(o => o.label)).toEqual(['Linear', 'Smooth', 'Slow-fast', 'Fast-slow', 'Circle'])
  })

  it('reads live track values', () => {
    mountWith(INTERP, { additive: true, mixInterpolation: 'circle' })
    const row = wrapper.find('.track-mix-row')
    expect(row.find('.n-checkbox').classes()).toContain('n-checkbox--checked')
    expect(row.find('.track-mix-select').text()).toContain('Circle')
  })

  it('emits setTrackMixOptions for Additive and Curve', async () => {
    mountWith(INTERP)
    await wrapper.find('.track-additive').trigger('click')
    wrapper.findComponent({ name: 'Select' }).vm.$emit('update:value', 'smooth')
    expect(wrapper.emitted('setTrackMixOptions')).toEqual([[1, { additive: true }], [1, { mixInterpolation: 'smooth' }]])
  })
})

describe('AnimationPanel skins and Composer', () => {
  let wrapper: VueWrapper
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => wrapper.unmount())

  async function composerWithRedHat() {
    const skel = useSkeletonStore()
    skel.populate({ animations: ['idle'], skins: ['red', 'hat', 'blue'], bones: [], slots: [], events: [] })
    wrapper = mount(AnimationPanel)
    skel.activeSkins = ['red', 'hat']
    await nextTick()
    return skel
  }

  it('turns Composer on for a composite and leaves it on a toolbar-style pick', async () => {
    const skel = await composerWithRedHat()
    expect(skel.composerMode).toBe(true)
    skel.activeSkins = ['red']
    skel.composerMode = false
    await nextTick()
    const radios = wrapper.findAll('.skin-row .n-radio')
    expect(radios).toHaveLength(3)
    expect(radios[0].classes()).toContain('n-radio--checked')
    expect(wrapper.findAll('.skin-row .n-checkbox')).toHaveLength(0)
  })

  it('keeps Composer on when a checkbox is unchecked down to one skin', async () => {
    const skel = await composerWithRedHat()
    await wrapper.findAll('.skin-row')[1].trigger('click')
    expect(skel.activeSkins).toEqual(['red'])
    expect(skel.composerMode).toBe(true)
    expect(wrapper.findAll('.skin-row .n-checkbox')).toHaveLength(3)
    expect(wrapper.emitted('setSkins')).toEqual([[['red']]])
  })

  async function composerWithOnly(skins: string[], checked: string) {
    const skel = useSkeletonStore()
    skel.populate({ animations: ['idle'], skins, bones: [], slots: [], events: [] })
    wrapper = mount(AnimationPanel)
    skel.activeSkins = [checked, skins.find(s => s !== checked)!]
    await nextTick()
    await wrapper.findAll('.skin-row')[skins.indexOf(skins.find(s => s !== checked)!)].trigger('click')
    return skel
  }

  it('falls back to default when the last checked skin is unchecked', async () => {
    const skel = await composerWithOnly(['default', 'red', 'hat'], 'red')
    await wrapper.findAll('.skin-row')[1].trigger('click')
    expect(skel.activeSkins).toEqual(['default'])
    expect(skel.composerMode).toBe(true)
    expect(wrapper.emitted('setSkins')!.at(-1)).toEqual([['default']])
  })

  it('falls back to the first skin when there is no default', async () => {
    const skel = await composerWithOnly(['red', 'hat', 'blue'], 'hat')
    await wrapper.findAll('.skin-row')[1].trigger('click')
    expect(skel.activeSkins).toEqual(['red'])
    expect(wrapper.emitted('setSkins')!.at(-1)).toEqual([['red']])
  })
})
