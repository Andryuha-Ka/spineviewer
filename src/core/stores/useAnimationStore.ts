import { defineStore } from 'pinia'
import type { TrackState, TrackQueueEntry } from '@/core/types/ISpineAdapter'

export const useAnimationStore = defineStore('animation', () => {
  // Live state — updated every ticker tick by PreviewStage
  const tracks = ref<TrackState[]>([])

  // Controls
  const speed             = ref(1)     // 0.0 – 3.0
  const loop              = ref(false)
  const currentTrack      = ref(0)     // selected track index 0–11
  const isPlaying         = ref(false)
  const isPaused          = ref(false) // true = frozen mid-animation; false = fully stopped
  const selectedAnimation = ref<string | null>(null)

  // Per-track enabled flag — absent / true = enabled, false = disabled
  const trackEnabled = ref<Record<number, boolean>>({})

  // Master playlists — full intended sequence per track.
  // Persists across animation advancement so Play can replay the whole sequence.
  const trackPlaylists = ref<Record<number, TrackQueueEntry[]>>({})

  function isTrackEnabled(trackIndex: number): boolean {
    return trackEnabled.value[trackIndex] !== false
  }

  function setTrackEnabled(trackIndex: number, enabled: boolean) {
    trackEnabled.value = { ...trackEnabled.value, [trackIndex]: enabled }
  }

  function setTrackPlaylist(trackIndex: number, entries: TrackQueueEntry[]) {
    trackPlaylists.value = { ...trackPlaylists.value, [trackIndex]: [...entries] }
  }

  function appendToTrackPlaylist(trackIndex: number, animationName: string, loopEntry: boolean) {
    const existing = trackPlaylists.value[trackIndex] ?? []
    trackPlaylists.value = { ...trackPlaylists.value, [trackIndex]: [...existing, { animationName, loop: loopEntry }] }
  }

  function removeFromTrackPlaylist(trackIndex: number, entryIndex: number) {
    const playlist = trackPlaylists.value[trackIndex]
    if (!playlist) return
    trackPlaylists.value = {
      ...trackPlaylists.value,
      [trackIndex]: playlist.filter((_, i) => i !== entryIndex),
    }
  }

  function clearTrackPlaylist(trackIndex: number) {
    const updated = { ...trackPlaylists.value }
    delete updated[trackIndex]
    trackPlaylists.value = updated
  }

  function clearAllTrackPlaylists() {
    trackPlaylists.value = {}
  }

  function setTracks(newTracks: TrackState[]) {
    tracks.value = newTracks
  }

  /** User clicked Pause — freeze in place */
  function pause() {
    isPaused.value  = true
    isPlaying.value = false
  }

  /** Animation completed or new skeleton loaded — full stop */
  function stop() {
    isPaused.value  = false
    isPlaying.value = false
  }

  /** User clicked Play — PreviewStage decides restart vs resume based on isPaused */
  function play() {
    isPlaying.value = true
  }

  function reset() {
    tracks.value            = []
    speed.value             = 1
    loop.value              = false
    currentTrack.value      = 0
    isPaused.value          = false
    isPlaying.value         = false
    selectedAnimation.value = null
    trackEnabled.value      = {}
    trackPlaylists.value    = {}
  }

  return {
    tracks, speed, loop, currentTrack, isPlaying, isPaused, selectedAnimation,
    trackEnabled, trackPlaylists,
    isTrackEnabled, setTrackEnabled,
    setTrackPlaylist, appendToTrackPlaylist, removeFromTrackPlaylist,
    clearTrackPlaylist, clearAllTrackPlaylists,
    setTracks, pause, stop, play, reset,
  }
})
