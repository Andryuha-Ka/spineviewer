import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveSession } from '@/core/utils/fileHistory'

interface FakeTx {
  oncomplete: (() => void) | null
  onerror:    (() => void) | null
  onabort:    (() => void) | null
  error:      unknown
  objectStore: () => typeof store
}

const puts: FakeTx[] = []
const getAll = vi.fn()
let currentTx: FakeTx

const store = {
  put: vi.fn(() => { puts.push(currentTx) }),
  getAll: vi.fn(() => {
    getAll()
    const req: { result: unknown[]; onsuccess: (() => void) | null; onerror: null } = { result: [], onsuccess: null, onerror: null }
    queueMicrotask(() => req.onsuccess?.())
    return req
  }),
  delete: vi.fn(),
}

const db = {
  objectStoreNames: { contains: () => true },
  transaction: vi.fn(() => {
    currentTx = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore: () => store }
    return currentTx
  }),
}

const fakeIndexedDB = {
  open: vi.fn(() => {
    const req: { result: typeof db; onsuccess: ((e: unknown) => void) | null; onerror: null; onupgradeneeded: null } =
      { result: db, onsuccess: null, onerror: null, onupgradeneeded: null }
    queueMicrotask(() => req.onsuccess?.({ target: req }))
    return req
  }),
}

const handle = {} as FileSystemFileHandle

beforeEach(() => {
  puts.length = 0
  getAll.mockClear()
  vi.stubGlobal('indexedDB', fakeIndexedDB)
  vi.stubGlobal('showOpenFilePicker', vi.fn())
  vi.stubGlobal('FileSystemFileHandle', class {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('saveSession IndexedDB write', () => {
  it('warns on a failed put and skips prune', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const done = saveSession(['a.json'], [handle])
    await vi.waitFor(() => expect(puts).toHaveLength(1))
    const err = new Error('quota')
    puts[0].error = err
    puts[0].onerror?.()
    await done
    expect(warn).toHaveBeenCalledWith('[fileHistory] IndexedDB write failed', err)
    expect(getAll).not.toHaveBeenCalled()
  })

  it('prunes only after the put transaction completes', async () => {
    const done = saveSession(['a.json'], [handle])
    await vi.waitFor(() => expect(puts).toHaveLength(1))
    await Promise.resolve()
    expect(getAll).not.toHaveBeenCalled()
    puts[0].oncomplete?.()
    await done
    expect(getAll).toHaveBeenCalledTimes(1)
  })
})
