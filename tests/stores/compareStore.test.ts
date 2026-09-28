import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { FileSet } from '@/core/types/FileSet'
import type { GroupSpineResult } from '@/core/utils/fileLoader'

const group = vi.fn<() => Promise<GroupSpineResult>>()
const validate = vi.fn<() => string[]>(() => [])
vi.mock('@/core/utils/fileLoader', () => ({ groupSpineFiles: () => group() }))
vi.mock('@/core/utils/spineValidator', () => ({ validateSpineFileSet: () => validate() }))

const { useCompareStore } = await import('@/core/stores/useCompareStore')
const { useVersionStore } = await import('@/core/stores/useVersionStore')

const fileSet = (filename: string, spine: string): FileSet => ({
  skeleton: { filename, fileBody: JSON.stringify({ skeleton: { spine } }), type: 'skeleton-json', mimeType: '' },
  atlas:    { filename: 'a.atlas', fileBody: '', type: 'atlas', mimeType: '' },
  images:   [],
})
const groupOf = (fs?: FileSet) => group.mockResolvedValue({ slots: fs ? [{ id: 's', name: 's', fileSet: fs }] : [] } as GroupSpineResult)

describe('useCompareStore.loadDirect (B7)', () => {
  const prev = { source: 'loaded', slotId: 'p', label: 'prev' } as const

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    validate.mockReturnValue([])
    useVersionStore().selectVersion(8, '4.2')
    useCompareStore().setLeft(prev)
  })

  it('keeps the previous source on a version mismatch', async () => {
    const store = useCompareStore()
    groupOf(fileSet('hero.json', '3.8.99'))
    await store.loadDirect('left', [])
    expect(store.leftSlot).toEqual(prev)
    expect(store.sourceError.left).toBe('Spine version mismatch: hero.json is 3.8, viewer is set to 4.2')
  })

  it('keeps the previous source and shows validation errors', async () => {
    const store = useCompareStore()
    groupOf(fileSet('hero.json', '4.2.10'))
    validate.mockReturnValue(['Missing region "arm"'])
    await store.loadDirect('left', [])
    expect(store.leftSlot).toEqual(prev)
    expect(store.sourceError.left).toBe('Missing region "arm"')
  })

  it('reports no valid set', async () => {
    const store = useCompareStore()
    groupOf()
    await store.loadDirect('left', [])
    expect(store.leftSlot).toEqual(prev)
    expect(store.sourceError.left).toBe('No valid Spine files found')
  })

  it('loads a valid set and the next source action clears the error', async () => {
    const store = useCompareStore()
    groupOf()
    await store.loadDirect('left', [])
    groupOf(fileSet('hero.json', '4.2.10'))
    await store.loadDirect('left', [])
    expect(store.leftSlot).toMatchObject({ source: 'direct', label: 'hero.json' })
    expect(store.sourceError.left).toBeNull()

    groupOf()
    await store.loadDirect('left', [])
    store.setLeft(prev)
    expect(store.sourceError.left).toBeNull()

    await store.loadDirect('right', [])
    expect(store.sourceError.right).not.toBeNull()
    store.reset()
    expect(store.sourceError).toEqual({ left: null, right: null })
  })
})
