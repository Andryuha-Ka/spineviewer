import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAnimationStore } from '@/core/stores/useAnimationStore'

const names = (store: ReturnType<typeof useAnimationStore>) =>
  store.trackPlaylists[0].map(e => e.animationName)

describe('track playlist', () => {
  let store: ReturnType<typeof useAnimationStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAnimationStore()
    store.setTrackPlaylist(0, ['A', 'B', 'C'].map(animationName => ({ animationName, loop: false })))
  })

  it('removes an upcoming entry by playlist index', () => {
    store.removePlaylistEntry(0, 1) // A plays, queue [B, C] → ✕ on B
    expect(names(store)).toEqual(['A', 'C'])
  })

  it('removes an entry after the queue advanced (B2 case)', () => {
    store.removePlaylistEntry(0, 2) // B plays, queue [C] → ✕ on C
    expect(names(store)).toEqual(['A', 'B'])
  })

  it('removes a played entry', () => {
    store.removePlaylistEntry(0, 0) // C plays → ✕ on A
    expect(names(store)).toEqual(['B', 'C'])
  })

  it('ignores an index outside the playlist', () => {
    store.removePlaylistEntry(0, 3)
    store.removePlaylistEntry(0, -1)
    expect(names(store)).toEqual(['A', 'B', 'C'])
  })

  it('gets and sets the list-loop flag on the head entry', () => {
    expect(store.isTrackListLoop(0)).toBe(false)
    store.setTrackListLoop(0, true)
    expect(store.isTrackListLoop(0)).toBe(true)
    expect(store.trackPlaylists[0].map(e => e.loop)).toEqual([true, false, false])
    expect(store.isTrackListLoop(5)).toBe(false)
  })

  it('append keeps entries after the head non-looping', () => {
    store.clearTrackPlaylist(0)
    store.appendToTrackPlaylist(0, 'A', true)
    store.appendToTrackPlaylist(0, 'B', true)
    expect(store.trackPlaylists[0].map(e => e.loop)).toEqual([true, false])
  })
})
