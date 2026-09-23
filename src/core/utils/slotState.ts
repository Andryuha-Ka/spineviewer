/**
 * @file slotState.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { ISpineAdapter, TrackState, TrackQueueEntry } from '@/core/types/ISpineAdapter'
import type { PHChildEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

/** Playback fields of the animation store that a slot snapshot keeps. */
export interface PlaybackSnapshot {
  speed: number
  selectedAnimation: string | null
  currentTrack: number
  loop: boolean
  trackEnabled: Record<number, boolean>
  trackPlaylists: Record<number, TrackQueueEntry[]>
  isPlaying: boolean
}

export interface SlotSnapshotInput {
  playback: PlaybackSnapshot
  activeSkins: readonly string[]
  showPlaceholders: boolean
  disabledPlaceholders: Iterable<string>
  slot?: Pick<SpineSlot, 'syncEnabled' | 'indPosX' | 'indPosY' | 'indZoom'>
  trackTimes?: Record<number, number>
  placeholderChildren?: Record<string, PHChildEntry[]>
}

/** Snapshot of the slot that is leaving the stage, built from the live UI state. */
export function buildSlotSavedState(input: SlotSnapshotInput): SpineSlotSavedState {
  const { playback, slot } = input
  const state: SpineSlotSavedState = {
    speed:                playback.speed,
    selectedAnimation:    playback.selectedAnimation,
    currentTrack:         playback.currentTrack,
    loop:                 playback.loop,
    trackEnabled:         { ...playback.trackEnabled },
    trackPlaylists:       JSON.parse(JSON.stringify(playback.trackPlaylists)),
    wasPlaying:           playback.isPlaying,
    selectedSkins:        [...input.activeSkins],
    showPlaceholders:     input.showPlaceholders,
    disabledPlaceholders: [...input.disabledPlaceholders],
    syncEnabled:          slot?.syncEnabled ?? true,
    indPosX:              slot?.indPosX ?? 0,
    indPosY:              slot?.indPosY ?? 0,
    indZoom:              slot?.indZoom ?? 1,
  }
  if (input.trackTimes) state.trackTimes = input.trackTimes
  if (input.placeholderChildren) state.placeholderChildren = input.placeholderChildren
  return state
}

/** Runtime chain for one track's list: a single entry keeps its loop, a longer list is queued non-looping and cycled by `rearmListLoops`. */
export function queueTrackList(
  adapter: Pick<ISpineAdapter, 'setAnimation' | 'addAnimation'>,
  track: number,
  playlist: readonly TrackQueueEntry[],
): void {
  if (playlist.length === 0) return
  adapter.setAnimation(track, playlist[0].animationName, playlist.length === 1 ? playlist[0].loop : false)
  for (let i = 1; i < playlist.length; i++) adapter.addAnimation(track, playlist[i].animationName, false)
}

/** Queues the whole list again on every enabled list-looping track whose last entry is playing. */
export function rearmListLoops(
  adapter: Pick<ISpineAdapter, 'addAnimation'>,
  states: readonly TrackState[],
  playlists: Record<number, TrackQueueEntry[]>,
  enabled: Record<number, boolean>,
): void {
  for (const ts of states) {
    const list = playlists[ts.trackIndex]
    if (!list || list.length < 2 || !list[0].loop || enabled[ts.trackIndex] === false || ts.queue.length > 0) continue
    for (const e of list) adapter.addAnimation(ts.trackIndex, e.animationName, false)
  }
}

/** Index of the playing entry in a list of `length` with `queued` live entries after it; `length` once a non-looping list has finished. */
export function playlistPosition(length: number, queued: number, atEnd: boolean): number {
  if (atEnd) return length
  return (length - 1 - queued + length) % length
}

/** Puts a saved slot back on an adapter that was mounted without it: enabled tracks, their queues and times. */
export function replaySavedTracks(
  adapter: Pick<ISpineAdapter, 'setAnimation' | 'addAnimation' | 'seekTo'>,
  state: Pick<SpineSlotSavedState, 'trackPlaylists' | 'trackEnabled' | 'trackTimes'>,
): void {
  for (const [idxStr, playlist] of Object.entries(state.trackPlaylists)) {
    const track = Number(idxStr)
    if (playlist.length === 0 || state.trackEnabled[track] === false) continue
    queueTrackList(adapter, track, playlist)
    const time = state.trackTimes?.[track]
    if (time !== undefined) adapter.seekTo(track, time)
  }
}

export function trackTimesOf(states: readonly TrackState[]): Record<number, number> {
  const times: Record<number, number> = {}
  for (const ts of states) times[ts.trackIndex] = ts.time
  return times
}

/** Live entry plus its queue per track — what Play would replay. */
export function playlistsOf(states: readonly TrackState[]): Record<number, TrackQueueEntry[]> {
  const playlists: Record<number, TrackQueueEntry[]> = {}
  for (const ts of states) playlists[ts.trackIndex] = [{ animationName: ts.animationName, loop: ts.loop }, ...ts.queue]
  return playlists
}
