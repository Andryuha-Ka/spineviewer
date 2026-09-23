import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlaceholderImagesStore } from '@/core/stores/usePlaceholderImagesStore'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import type { PHSpineEntry, SpineSlot } from '@/core/types/FileSet'

const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, ...extra })

function spineEntry(imageId: string, childSlotId: string): PHSpineEntry {
  return {
    kind: 'spine', imageId, childSlotId, fileName: 'c.skel',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileSet: {} as any, syncEnabled: true, posX: 0, posY: 0, scale: 1,
  }
}

describe('placeholder store cleanup (C16)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('hasSlot is true for an emptied slot entry', () => {
    const ph = usePlaceholderImagesStore()
    expect(ph.hasSlot('a')).toBe(false)
    ph.addSpineChild('a', 'placeholder_1', spineEntry('e1', 'child'))
    ph.removeSpineChild('a', 'placeholder_1', 'e1')
    expect(ph.hasSlot('a')).toBe(true)
    expect(ph.getSlotImages('a')).toEqual({ placeholder_1: [] })
  })

  it('clearSlotImages drops the entry and an active image that belonged to it', () => {
    const ph = usePlaceholderImagesStore()
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    ph.addSpineChild('b', 'p', spineEntry('e2', 'c2'))
    ph.setActiveImage('e1')
    ph.clearSlotImages('b')
    expect(ph.activeImageId).toBe('e1')
    ph.clearSlotImages('a')
    expect(ph.activeImageId).toBeNull()
    expect(ph.hasSlot('a')).toBe(false)
  })

  it('removeSlot forgets the placeholder entries of the removed slot', () => {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    loader.setSlots([slot('a'), slot('b')], '4.2')
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    ph.addSpineChild('b', 'p', spineEntry('e2', 'c2'))
    loader.removeSlot('a')
    expect(ph.hasSlot('a')).toBe(false)
    expect(ph.hasSlot('b')).toBe(true)
  })

  it('removeSlotCascade also forgets child slots', () => {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    loader.setSlots([slot('parent'), slot('child', { parentSlotId: 'parent' })], '4.2')
    ph.addSpineChild('child', 'p', spineEntry('e1', 'grand'))
    loader.removeSlotCascade('parent')
    expect(ph.hasSlot('child')).toBe(false)
    expect(loader.spineSlots).toEqual([])
  })

  it('a new session (setSlots) and the viewer reset (clear) drop every entry and queued action', () => {
    const loader = useFileLoaderStore()
    const ph = usePlaceholderImagesStore()
    loader.setSlots([slot('a')], '4.2')
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    ph.setActiveImage('e1')
    expect(ph.hasPendingActions).toBe(true)

    loader.setSlots([slot('x')], '4.2')
    expect(ph.children).toEqual({})
    expect(ph.hasPendingActions).toBe(false)
    expect(ph.activeImageId).toBeNull()

    ph.addSpineChild('x', 'p', spineEntry('e2', 'c2'))
    loader.clear()
    expect(ph.children).toEqual({})
    expect(useSlotSelectionStore().activeSlotId).toBeNull()
  })
})
