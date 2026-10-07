import { describe, it, expect, vi } from 'vitest'
import { applyEntryMixDuration, applySavedBoneOverrides, applySavedTrackMix, buildSlotSavedState, playlistPosition, playlistsOf, queueTrackList, rearmListLoops, replaySavedTracks, shouldAutoStop, trackMixOf, trackTimesOf } from '@/core/utils/slotState'
import { makeFakeAdapter, track, withSpine43 } from '../helpers/fakeAdapter'
import type { TrackMixOptions, TrackState } from '@/core/types/ISpineAdapter'
import type { FileSet, PHSpineEntry } from '@/core/types/FileSet'

const playback = {
  speed: 1.25, selectedAnimation: 'run', currentTrack: 2, loop: true,
  trackEnabled: { 1: false }, trackPlaylists: { 0: [{ animationName: 'run', loop: true }] }, isPlaying: true,
  trackMix: {},
}

const states: TrackState[] = [
  { trackIndex: 0, animationName: 'run', time: 0.5, duration: 1, loop: true, timeScale: 1, queue: [{ animationName: 'stop', loop: false }], mixDuration: 0 },
  { trackIndex: 3, animationName: 'blink', time: 0.1, duration: 1, loop: false, timeScale: 1, queue: [], mixDuration: 0 },
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

  it('strips fileSet from placeholder spine entries (C23)', () => {
    const fileSet = {
      skeleton: { filename: 's.skel', fileBody: new ArrayBuffer(8), type: 'skeleton-skel', mimeType: '' },
      atlas: { filename: 's.atlas', fileBody: '', type: 'atlas', mimeType: '' },
      images: [],
    } as FileSet
    const entry: PHSpineEntry = { kind: 'spine', imageId: 'e1', childSlotId: 'kid', fileName: 'kid', fileSet, syncEnabled: false, posX: 1, posY: 2, scale: 3 }
    const ss = buildSlotSavedState({ playback, activeSkins: [], showPlaceholders: true, disabledPlaceholders: [], placeholderChildren: { p: [entry] } })
    const [out] = ss.placeholderChildren!.p
    expect('fileSet' in out).toBe(false)
    expect(out).toEqual({ kind: 'spine', imageId: 'e1', childSlotId: 'kid', fileName: 'kid', syncEnabled: false, posX: 1, posY: 2, scale: 3 })
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

  it('reads the mix duration of every track and 4.3 options where reported', () => {
    expect(trackMixOf([{ ...states[0], mixDuration: 0.4 }, states[1]])).toEqual({ 0: { mixDuration: 0.4 }, 3: { mixDuration: 0 } })
    const mixed: TrackState[] = [
      { ...states[0], additive: false, mixInterpolation: 'linear' },
      { ...states[1], mixDuration: 0.2, additive: true, mixInterpolation: 'circle' },
    ]
    expect(trackMixOf(mixed)).toEqual({
      0: { mixDuration: 0, additive: false, mixInterpolation: 'linear' },
      3: { mixDuration: 0.2, additive: true, mixInterpolation: 'circle' },
    })
  })

  it('snapshot copies the store trackMix only when it is non-empty', () => {
    const base = { activeSkins: [], showPlaceholders: true, disabledPlaceholders: [] }
    expect('trackMix' in buildSlotSavedState({ ...base, playback })).toBe(false)
    const trackMix = { 1: { mixDuration: 0.3 }, 2: { mixDuration: 0, additive: true, mixInterpolation: 'circle' } }
    const ss = buildSlotSavedState({ ...base, playback: { ...playback, trackMix } })
    expect(ss.trackMix).toEqual(trackMix)
    expect(ss.trackMix).not.toBe(trackMix)
    expect(ss.trackMix![1]).not.toBe(trackMix[1])
  })

  it('applies saved options to every track, disabled ones included, an old record reading as 0', () => {
    const adapter = makeFakeAdapter([], ['a', 'b'])
    applySavedTrackMix(adapter, { 0: { mixDuration: 0.5 }, 1: { additive: true, mixInterpolation: 'circle' } as TrackMixOptions })
    expect(adapter.setTrackMixOptions.mock.calls).toEqual([
      [0, { mixDuration: 0.5 }],
      [1, { mixDuration: 0, additive: true, mixInterpolation: 'circle' }],
    ])
    applySavedTrackMix(adapter, undefined)
    expect(adapter.setTrackMixOptions).toHaveBeenCalledTimes(2)
  })

  it('replay applies saved options to disabled tracks too, before any setAnimation', () => {
    const adapter = withSpine43(makeFakeAdapter([], ['a', 'b']))
    replaySavedTracks(adapter, {
      trackPlaylists: { 0: [{ animationName: 'a', loop: true }], 1: [{ animationName: 'b', loop: true }] },
      trackEnabled: { 1: false },
      trackMix: { 0: { mixDuration: 0.25 }, 1: { mixDuration: 0.3, additive: true, mixInterpolation: 'circle' } },
    })
    expect(adapter.setTrackMixOptions.mock.calls).toEqual([
      [0, { mixDuration: 0.25 }],
      [1, { mixDuration: 0.3, additive: true, mixInterpolation: 'circle' }],
    ])
    expect(adapter.setAnimation.mock.calls).toEqual([[0, 'a', true]])
    expect(adapter.setTrackMixOptions.mock.invocationCallOrder[1]).toBeLessThan(adapter.setAnimation.mock.invocationCallOrder[0])
  })

  it('queueTrackList does not touch mix options', () => {
    const adapter = makeFakeAdapter()
    queueTrackList(adapter, 0, [{ animationName: 'a', loop: true }])
    expect(adapter.setTrackMixOptions).not.toHaveBeenCalled()
  })

  it('replays enabled tracks with their queues and saved times', () => {
    const adapter = { animations: ['run', 'stop', 'blink'], bones: [], setAnimation: vi.fn(), addAnimation: vi.fn(), seekTo: vi.fn(), setTrackMixOptions: vi.fn(), setBoneOverride: vi.fn() }
    replaySavedTracks(adapter, {
      trackPlaylists: { 0: [{ animationName: 'run', loop: true }, { animationName: 'stop', loop: false }], 1: [{ animationName: 'blink', loop: true }], 2: [] },
      trackEnabled: { 1: false },
      trackTimes: { 0: 0.3, 1: 0.9 },
    })
    expect(adapter.setAnimation.mock.calls).toEqual([[0, 'run', false]])
    expect(adapter.addAnimation.mock.calls).toEqual([[0, 'stop', false]])
    expect(adapter.seekTo.mock.calls).toEqual([[0, 0.3]])
  })

  it('replay skips animations the skeleton lacks and still plays the other tracks', () => {
    const adapter = makeFakeAdapter([], ['transition/start', 'idle', 'fx'])
    replaySavedTracks(adapter, {
      trackPlaylists: {
        0: [{ animationName: 'M/win', loop: true }],
        1: [{ animationName: 'M/win', loop: true }, { animationName: 'idle', loop: false }, { animationName: 'fx', loop: false }],
        2: [{ animationName: 'transition/start', loop: true }],
      },
      trackEnabled: { 0: true, 1: true, 2: true },
      trackTimes: { 0: 0.5, 2: 0.25 },
    })
    expect(adapter.setAnimation.mock.calls).toEqual([[1, 'idle', false], [2, 'transition/start', true]])
    expect(adapter.addAnimation.mock.calls).toEqual([[1, 'fx', false]])
    expect(adapter.seekTo.mock.calls).toEqual([[2, 0.25]])
  })

  it('re-arm skips animations the skeleton lacks', () => {
    const adapter = makeFakeAdapter([], ['a'])
    const list = [{ animationName: 'a', loop: true }, { animationName: 'gone', loop: false }]
    rearmListLoops(adapter, [track(0, 'a', 0.5, false)], { 0: list }, {})
    expect(adapter.addAnimation.mock.calls).toEqual([[0, 'a', false]])
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

  it('re-arms as soon as a shortened delay makes the last entry current', () => {
    const list = [{ animationName: 'a', loop: true }, { animationName: 'b', loop: false }]
    const adapter = makeFakeAdapter()
    rearmListLoops(adapter, [{ ...track(0, 'b', 0.01, false), mixDuration: 0.5 }], { 0: list }, {})
    expect(adapter.addAnimation.mock.calls).toEqual([[0, 'a', false], [0, 'b', false]])
  })

  it('finds the playing entry in the list', () => {
    expect(playlistPosition(3, 2, false)).toBe(0)
    expect(playlistPosition(3, 1, false)).toBe(1)
    expect(playlistPosition(3, 0, false)).toBe(2)
    expect(playlistPosition(3, 3, false)).toBe(2)
    expect(playlistPosition(3, 0, true)).toBe(3)
  })

  describe('shouldAutoStop', () => {
    const info = (disabled: number[] = [], lists: Record<number, number> = {}) => ({
      isEnabled:  (t: number) => !disabled.includes(t),
      isListLoop: (t: number) => (lists[t] ?? 0) > 0,
      listLength: (t: number) => lists[t] ?? 0,
    })
    const ended = track(0, 'a', 2, false)

    it('stops when a disabled non-looping track is still mid-animation', () => {
      expect(shouldAutoStop([ended, track(1, 'b', 0.5, false)], info([1]))).toBe(true)
    })

    it('stops when only disabled tracks loop or cycle a list', () => {
      expect(shouldAutoStop([ended, track(1, 'b', 0.5, true)], info([1]))).toBe(true)
      expect(shouldAutoStop([ended, track(1, 'b', 0.5, false)], info([1], { 1: 3 }))).toBe(true)
    })

    it('does not stop while an enabled track cycles a list of two or more', () => {
      expect(shouldAutoStop([track(0, 'a', 2, false)], info([], { 0: 2 }))).toBe(false)
    })

    it('stops when every track is disabled', () => {
      expect(shouldAutoStop([track(0, 'a', 0.5, true)], info([0]))).toBe(true)
    })

    it('does not stop while an enabled track is mid-animation', () => {
      expect(shouldAutoStop([ended, track(1, 'b', 0.5, false)], info())).toBe(false)
    })

    it('a list entry started early by a shortened delay counts as playing, not ended', () => {
      // with a 500 ms mix the last entry becomes current while the previous one still fades out
      const early = { ...track(0, 'b', 0.05, false), mixDuration: 0.5 }
      expect(shouldAutoStop([early], info())).toBe(false)
      expect(shouldAutoStop([{ ...early, time: 2 }], info())).toBe(true)
    })
  })
})

describe('applyEntryMixDuration', () => {
  it('set entry: duration applied, delay untouched', () => {
    const e = { mixDuration: 0, delay: 0 }
    applyEntryMixDuration(e, 0.5, false)
    expect(e).toEqual({ mixDuration: 0.5, delay: 0 })
  })

  it('queued entry starts mix before its predecessor ends', () => {
    const e = { mixDuration: 0, delay: 2 } // runtime: complete - queue-time mix 0
    applyEntryMixDuration(e, 0.5, true)
    expect(e).toEqual({ mixDuration: 0.5, delay: 1.5 })
    applyEntryMixDuration(e, 0.2, true) // re-timed from the old mix, not stacked
    expect(e).toEqual({ mixDuration: 0.2, delay: 1.8 })
  })

  it('clamps the delay at 0 when mix exceeds the remaining time', () => {
    const e = { mixDuration: 0, delay: 0.3 }
    applyEntryMixDuration(e, 1, true)
    expect(e).toEqual({ mixDuration: 1, delay: 0 })
  })

  it('not queued (empty track or explicit delay): delay unchanged', () => {
    const e = { mixDuration: 0, delay: 0.7 }
    applyEntryMixDuration(e, 0.4, false)
    expect(e.delay).toBe(0.7)
  })
})

describe('slotState bone overrides', () => {
  const input = (boneOverrides?: Record<string, object>) => ({
    playback, activeSkins: [], showPlaceholders: true, disabledPlaceholders: [], boneOverrides,
  })

  it('saves a deep copy of held overrides and omits an empty map', () => {
    const held = { arm: { rotation: 30 } }
    const ss = buildSlotSavedState(input(held))
    held.arm.rotation = 99
    expect(ss.boneOverrides).toEqual({ arm: { rotation: 30 } })
    expect(buildSlotSavedState(input({})).boneOverrides).toBeUndefined()
    expect(buildSlotSavedState(input()).boneOverrides).toBeUndefined()
  })

  it('replays saved overrides and skips bones the skeleton lacks', () => {
    const adapter = makeFakeAdapter()
    Object.assign(adapter, { bones: [{ name: 'arm', parent: null }] })
    applySavedBoneOverrides(adapter, { boneOverrides: { arm: { rotation: 30, x: 2 }, gone: { y: 1 } } })
    expect(adapter.setBoneOverride.mock.calls).toEqual([['arm', { rotation: 30, x: 2 }]])
    expect(adapter.getBoneOverrides()).toEqual({ arm: { rotation: 30, x: 2 } })
  })

  it('replaySavedTracks replays overrides too', () => {
    const adapter = makeFakeAdapter()
    Object.assign(adapter, { bones: [{ name: 'arm', parent: null }] })
    replaySavedTracks(adapter, { trackPlaylists: {}, trackEnabled: {}, boneOverrides: { arm: { scaleX: 2 } } })
    expect(adapter.getBoneOverrides()).toEqual({ arm: { scaleX: 2 } })
  })
})
