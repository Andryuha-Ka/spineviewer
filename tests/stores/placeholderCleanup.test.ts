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

describe('placeholder action drain', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function queue() {
    const ph = usePlaceholderImagesStore()
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    ph.addSpineChild('b', 'p', spineEntry('e2', 'c2'))
    ph.addSpineChild('a', 'p', spineEntry('e3', 'c3'))
    return ph
  }

  it('keeps the actions the predicate accepts queued, in order', () => {
    const ph = queue()
    const drained = ph.drainActions(a => a.slotId === 'a')
    expect(drained.map(a => 'imageId' in a && a.imageId)).toEqual(['e2'])
    expect(ph.peekActions().map(a => 'imageId' in a && a.imageId)).toEqual(['e1', 'e3'])
    expect(ph.drainActions().map(a => 'imageId' in a && a.imageId)).toEqual(['e1', 'e3'])
  })

  it('drains everything without a predicate', () => {
    const ph = queue()
    expect(ph.drainActions().map(a => 'imageId' in a && a.imageId)).toEqual(['e1', 'e2', 'e3'])
    expect(ph.hasPendingActions).toBe(false)
  })

  it('addImageData lists the image first and queues add with its scale kept on the entry', () => {
    const ph = usePlaceholderImagesStore()
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    ph.drainActions()
    ph.addImageData('a', 'p', { fileName: 'x.png', dataURL: 'data:x', scale: 2 })
    const entries = ph.getPlaceholderImages('a', 'p')
    expect(entries.map(e => e.kind)).toEqual(['image', 'spine'])
    expect(entries[0]).toMatchObject({ fileName: 'x.png', dataURL: 'data:x', scale: 2, posX: 0, posY: 0, syncEnabled: true })
    expect(ph.peekActions()).toEqual([{ type: 'add', slotId: 'a', phName: 'p', imageId: entries[0].imageId, dataURL: 'data:x' }])
  })

  it('addSpineChild lists the child first and cloneImage lists the copy directly above its source (F8)', () => {
    const ph = usePlaceholderImagesStore()
    ph.addImageData('a', 'p', { fileName: 'bow.png', dataURL: 'data:b', scale: 1 })
    ph.addImageData('a', 'p', { fileName: 'hat.png', dataURL: 'data:h', scale: 1 })
    ph.addSpineChild('a', 'p', spineEntry('e1', 'c1'))
    const bow = ph.getPlaceholderImages('a', 'p')[2]
    ph.cloneImage('a', 'p', bow.imageId)
    const list = ph.getPlaceholderImages('a', 'p')
    expect(list.map(e => e.kind === 'spine' ? e.imageId : e.fileName)).toEqual(['e1', 'hat.png', 'bow.png', 'bow.png'])
    expect(list[3].imageId).toBe(bow.imageId)
    expect(list[2].imageId).not.toBe(bow.imageId)
  })

  it('moveChild lists the moved entry first in the destination (F8)', () => {
    const ph = usePlaceholderImagesStore()
    ph.addImageData('b', 'q', { fileName: 'bow.png', dataURL: 'data:b', scale: 1 })
    ph.addImageData('a', 'p', { fileName: 'hat.png', dataURL: 'data:h', scale: 1 })
    ph.moveChild('a', 'p', ph.getPlaceholderImages('a', 'p')[0].imageId, 'b', 'q')
    expect(ph.getPlaceholderImages('b', 'q').map(e => e.kind === 'image' && e.fileName)).toEqual(['hat.png', 'bow.png'])
  })
})
