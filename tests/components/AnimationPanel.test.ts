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
