/**
 * @file slotState.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { BoneOverrides, ISpineAdapter, TrackState, TrackQueueEntry, TrackMixOptions } from '@/core/types/ISpineAdapter'
import type { PHChildEntry, PHImageEntry, PHSpineEntry, SpineSlot, SpineSlotSavedState } from '@/core/types/FileSet'

/** Plain copies of placeholder entries; `PHSpineEntry.fileSet` stays in loaderStore.spineSlots, never in a snapshot. */
export function withoutFileSets(children: Record<string, PHChildEntry[]> | undefined): Record<string, PHChildEntry[]> {
  const result: Record<string, PHChildEntry[]> = {}
  for (const [ph, entries] of Object.entries(children ?? {})) {
    result[ph] = entries.map(e => {
      if (e.kind === 'spine') {
        return {
          kind: 'spine', imageId: e.imageId, childSlotId: e.childSlotId,
          fileName: e.fileName, syncEnabled: e.syncEnabled,
          posX: e.posX, posY: e.posY, scale: e.scale,
        } as PHSpineEntry
      }
      return { kind: 'image', imageId: e.imageId, fileName: e.fileName, dataURL: e.dataURL,
        syncEnabled: e.syncEnabled, posX: e.posX, posY: e.posY, scale: e.scale } as PHImageEntry
    })
  }
  return result
}

/** Playback fields of the animation store that a slot snapshot keeps. */
interface PlaybackSnapshot {
  speed: number
  selectedAnimation: string | null
  currentTrack: number
  loop: boolean
  trackEnabled: Record<number, boolean>
  trackPlaylists: Record<number, TrackQueueEntry[]>
  trackMix: Record<number, TrackMixOptions>
  isPlaying: boolean
}

interface SlotSnapshotInput {
  playback: PlaybackSnapshot
  activeSkins: readonly string[]
  showPlaceholders: boolean
  disabledPlaceholders: Iterable<string>
  slot?: Pick<SpineSlot, 'syncEnabled' | 'indPosX' | 'indPosY' | 'indZoom'>
  trackTimes?: Record<number, number>
  placeholderChildren?: Record<string, PHChildEntry[]>
  boneOverrides?: BoneOverrides
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
  if (Object.keys(playback.trackMix).length > 0) state.trackMix = JSON.parse(JSON.stringify(playback.trackMix))
  if (input.placeholderChildren) state.placeholderChildren = withoutFileSets(input.placeholderChildren)
  if (input.boneOverrides && Object.keys(input.boneOverrides).length > 0) state.boneOverrides = JSON.parse(JSON.stringify(input.boneOverrides))
  return state
}

/** Entries the skeleton has — a saved list can name an animation this skeleton lacks. */
function playable(adapter: Pick<ISpineAdapter, 'animations'>, list: readonly TrackQueueEntry[]): TrackQueueEntry[] {
  return list.filter(e => adapter.animations.includes(e.animationName))
}

/** Runtime chain for one track's list: a single entry keeps its loop, a longer list is queued non-looping and cycled by `rearmListLoops`. Unknown animations are skipped. */
export function queueTrackList(
  adapter: Pick<ISpineAdapter, 'animations' | 'setAnimation' | 'addAnimation'>,
  track: number,
  playlist: readonly TrackQueueEntry[],
): boolean {
  const list = playable(adapter, playlist)
  if (list.length === 0) return false
  adapter.setAnimation(track, list[0].animationName, list.length === 1 ? list[0].loop : false)
  for (let i = 1; i < list.length; i++) adapter.addAnimation(track, list[i].animationName, false)
  return true
}

/** Queues the whole list again on every enabled list-looping track whose last entry is playing. */
export function rearmListLoops(
  adapter: Pick<ISpineAdapter, 'animations' | 'addAnimation'>,
  states: readonly TrackState[],
  playlists: Record<number, TrackQueueEntry[]>,
  enabled: Record<number, boolean>,
): void {
  for (const ts of states) {
    const list = playlists[ts.trackIndex]
    if (!list || list.length < 2 || !list[0].loop || enabled[ts.trackIndex] === false || ts.queue.length > 0) continue
    for (const e of playable(adapter, list)) adapter.addAnimation(ts.trackIndex, e.animationName, false)
  }
}

/** Index of the playing entry in a list of `length` with `queued` live entries after it; `length` once a non-looping list has finished. */
export function playlistPosition(length: number, queued: number, atEnd: boolean): number {
  if (atEnd) return length
  return (length - 1 - queued + length) % length
}

interface AutoStopTrackInfo {
  isEnabled: (track: number) => boolean
  isListLoop: (track: number) => boolean
  listLength: (track: number) => number
}

/** True when no enabled track loops, cycles a list or has a queue, and every enabled track has reached its end. */
export function shouldAutoStop(states: readonly TrackState[], info: AutoStopTrackInfo): boolean {
  const enabled = states.filter(t => info.isEnabled(t.trackIndex))
  if (enabled.some(t => t.loop || (info.isListLoop(t.trackIndex) && info.listLength(t.trackIndex) >= 2))) return false
  if (enabled.some(t => t.queue.length > 0)) return false
  return enabled.every(t => t.duration > 0 && t.time >= t.duration - 0.02)
}

/** Saved per-track options onto the adapter for every track, enabled or not, so a later re-enable or pick uses them. */
export function applySavedTrackMix(
  adapter: Pick<ISpineAdapter, 'setTrackMixOptions'>,
  trackMix: Record<number, Partial<TrackMixOptions>> | undefined,
): void {
  for (const [idxStr, opts] of Object.entries(trackMix ?? {})) {
    adapter.setTrackMixOptions(Number(idxStr), { ...opts, mixDuration: opts.mixDuration ?? 0 })
  }
}

/** Saved bone overrides onto the adapter; bones this skeleton lacks are skipped. */
export function applySavedBoneOverrides(
  adapter: Pick<ISpineAdapter, 'bones' | 'setBoneOverride'>,
  state: Pick<SpineSlotSavedState, 'boneOverrides'> | undefined,
): void {
  const saved = state?.boneOverrides
  if (!saved) return
  const known = new Set(adapter.bones.map(b => b.name))
  for (const [name, t] of Object.entries(saved)) {
    if (known.has(name)) adapter.setBoneOverride(name, { ...t })
  }
}

/** Puts a saved slot back on an adapter that was mounted without it: per-track options, bone overrides, enabled tracks, their queues and times. */
export function replaySavedTracks(
  adapter: Pick<ISpineAdapter, 'animations' | 'bones' | 'setAnimation' | 'addAnimation' | 'seekTo' | 'setTrackMixOptions' | 'setBoneOverride'>,
  state: Pick<SpineSlotSavedState, 'trackPlaylists' | 'trackEnabled' | 'trackTimes' | 'trackMix' | 'boneOverrides'>,
): void {
  applySavedTrackMix(adapter, state.trackMix)
  applySavedBoneOverrides(adapter, state)
  for (const [idxStr, playlist] of Object.entries(state.trackPlaylists)) {
    const track = Number(idxStr)
    if (state.trackEnabled[track] === false || !queueTrackList(adapter, track, playlist)) continue
    const time = state.trackTimes?.[track]
    if (time !== undefined) adapter.seekTo(track, time)
  }
}

export function trackTimesOf(states: readonly TrackState[]): Record<number, number> {
  const times: Record<number, number> = {}
  for (const ts of states) times[ts.trackIndex] = ts.time
  return times
}

/** Mix duration per live track, plus additive / mix interpolation where the adapter reports them (Spine 4.3). */
export function trackMixOf(states: readonly TrackState[]): Record<number, TrackMixOptions> {
  const mix: Record<number, TrackMixOptions> = {}
  for (const ts of states) {
    const opts: TrackMixOptions = { mixDuration: ts.mixDuration }
    if (ts.additive !== undefined) opts.additive = ts.additive
    if (ts.mixInterpolation !== undefined) opts.mixInterpolation = ts.mixInterpolation
    mix[ts.trackIndex] = opts
  }
  return mix
}

/** Live entry plus its queue per track — what Play would replay. */
export function playlistsOf(states: readonly TrackState[]): Record<number, TrackQueueEntry[]> {
  const playlists: Record<number, TrackQueueEntry[]> = {}
  for (const ts of states) playlists[ts.trackIndex] = [{ animationName: ts.animationName, loop: ts.loop }, ...ts.queue]
  return playlists
}

/** Sets an entry's crossfade; a queued entry (caller's delay <= 0) starts `mix` before its predecessor ends, as Spine 4.2+ does. */
export function applyEntryMixDuration(entry: { mixDuration: number; delay: number }, mix: number, queued: boolean): void {
  if (queued) entry.delay = Math.max(entry.delay + entry.mixDuration - mix, 0)
  entry.mixDuration = mix
}
