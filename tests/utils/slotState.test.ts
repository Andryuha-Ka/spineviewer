import { describe, it, expect, vi } from 'vitest'
import { buildSlotSavedState, playlistPosition, playlistsOf, queueTrackList, rearmListLoops, replaySavedTracks, trackTimesOf } from '@/core/utils/slotState'
import { makeFakeAdapter, track } from '../helpers/fakeAdapter'
import type { TrackState } from '@/core/types/ISpineAdapter'

const playback = {
  speed: 1.25, selectedAnimation: 'run', currentTrack: 2, loop: true,
  trackEnabled: { 1: false }, trackPlaylists: { 0: [{ animationName: 'run', loop: true }] }, isPlaying: true,
}

const states: TrackState[] = [
  { trackIndex: 0, animationName: 'run', time: 0.5, duration: 1, loop: true, timeScale: 1, queue: [{ animationName: 'stop', loop: false }] },
  { trackIndex: 3, animationName: 'blink', time: 0.1, duration: 1, loop: false, timeScale: 1, queue: [] },
]

describe('slotState', () => {
  it('builds a snapshot that does not share mutable state with the stores', () => {
    const disabled = new Set(['placeholder_2'])
    const skins = ['gold']
    const ss = buildSlotSavedState({
      playback, activeSkins: skins, showPlaceholders: false, disabledPlaceholders: disabled,
      slot: { syncEnabled: false, indPosX: 3, indPosY: 4, indZoom: 2 },
      trackTimes: { 0: 0.5 },
    })
    expect(ss).toEqual({
      speed: 1.25, selectedAnimation: 'run', currentTrack: 2, loop: true, trackEnabled: { 1: false },
      trackPlaylists: { 0: [{ animationName: 'run', loop: true }] }, wasPlaying: true, trackTimes: { 0: 0.5 },
      selectedSkins: ['gold'], showPlaceholders: false, disabledPlaceholders: ['placeholder_2'],
      syncEnabled: false, indPosX: 3, indPosY: 4, indZoom: 2,
    })
    expect(ss.trackPlaylists).not.toBe(playback.trackPlaylists)
    expect(ss.trackPlaylists[0]).not.toBe(playback.trackPlaylists[0])
    expect(ss.trackEnabled).not.toBe(playback.trackEnabled)
    expect(ss.selectedSkins).not.toBe(skins)
    expect('placeholderChildren' in ss).toBe(false)
  })

  it('defaults the transform when the slot is unknown', () => {
    const ss = buildSlotSavedState({ playback, activeSkins: [], showPlaceholders: true, disabledPlaceholders: [] })
    expect(ss).toMatchObject({ syncEnabled: true, indPosX: 0, indPosY: 0, indZoom: 1 })
  })

  it('reads times and replayable playlists from live track states', () => {
    expect(trackTimesOf(states)).toEqual({ 0: 0.5, 3: 0.1 })
    expect(playlistsOf(states)).toEqual({
      0: [{ animationName: 'run', loop: true }, { animationName: 'stop', loop: false }],
      3: [{ animationName: 'blink', loop: false }],
    })
  })

  it('replays enabled tracks with their queues and saved times', () => {
    const adapter = { setAnimation: vi.fn(), addAnimation: vi.fn(), seekTo: vi.fn() }
    replaySavedTracks(adapter, {
      trackPlaylists: { 0: [{ animationName: 'run', loop: true }, { animationName: 'stop', loop: false }], 1: [{ animationName: 'blink', loop: true }], 2: [] },
      trackEnabled: { 1: false },
      trackTimes: { 0: 0.3, 1: 0.9 },
    })
    expect(adapter.setAnimation.mock.calls).toEqual([[0, 'run', false]])
    expect(adapter.addAnimation.mock.calls).toEqual([[0, 'stop', false]])
    expect(adapter.seekTo.mock.calls).toEqual([[0, 0.3]])
  })

  it('queues a single entry with its loop and a longer list non-looping', () => {
    const one = makeFakeAdapter()
    queueTrackList(one, 0, [{ animationName: 'idle', loop: true }])
    expect(one.setAnimation.mock.calls).toEqual([[0, 'idle', true]])
    expect(one.addAnimation).not.toHaveBeenCalled()

    const three = makeFakeAdapter()
    queueTrackList(three, 1, [{ animationName: 'a', loop: true }, { animationName: 'b', loop: false }, { animationName: 'c', loop: false }])
    expect(three.setAnimation.mock.calls).toEqual([[1, 'a', false]])
    expect(three.addAnimation.mock.calls).toEqual([[1, 'b', false], [1, 'c', false]])
  })

  it('re-arms a list-looping track once its last entry is playing', () => {
    const list = [{ animationName: 'a', loop: true }, { animationName: 'b', loop: false }]
    const last = track(0, 'b', 0.5, false)
    const adapter = makeFakeAdapter()
    rearmListLoops(adapter, [last], { 0: list }, {})
    expect(adapter.addAnimation.mock.calls).toEqual([[0, 'a', false], [0, 'b', false]])

    const noop = makeFakeAdapter()
    rearmListLoops(noop, [{ ...last, queue: [{ animationName: 'b', loop: false }] }], { 0: list }, {})
    rearmListLoops(noop, [last], { 0: list }, { 0: false })
    rearmListLoops(noop, [last], { 0: [list[0]] }, {})
    rearmListLoops(noop, [last], { 0: [{ ...list[0], loop: false }, list[1]] }, {})
    expect(noop.addAnimation).not.toHaveBeenCalled()
  })

  it('finds the playing entry in the list', () => {
    expect(playlistPosition(3, 2, false)).toBe(0)
    expect(playlistPosition(3, 1, false)).toBe(1)
    expect(playlistPosition(3, 0, false)).toBe(2)
    expect(playlistPosition(3, 3, false)).toBe(2)
    expect(playlistPosition(3, 0, true)).toBe(3)
  })
})
