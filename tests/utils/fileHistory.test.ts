import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getSessions, pickFilesViaFSAA, pickFolderViaFSAA, reloadSession, saveSession } from '@/core/utils/fileHistory'
import { SPINE_ACCEPT_EXTENSIONS, fileDir } from '@/core/utils/fileLoader'

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
  get: vi.fn((id: string) => {
    const req: { result: unknown; onsuccess: (() => void) | null; onerror: null } = { result: stored[id], onsuccess: null, onerror: null }
    queueMicrotask(() => req.onsuccess?.())
    return req
  }),
}
const stored: Record<string, unknown> = {}

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

const fileHandle = (file: File) => ({ kind: 'file', getFile: async () => file, requestPermission: async () => 'granted' })
const dir = (name: string, entries: unknown[]) => ({ kind: 'directory', name, values: async function* () { yield* entries } })

describe('zip archives in pickers and history', () => {
  it('file picker filters to the shared accept list, which includes .zip', async () => {
    const zip = new File(['z'], 'hero.zip')
    const picker = vi.fn(async () => [fileHandle(zip)])
    vi.stubGlobal('showOpenFilePicker', picker)
    const res = await pickFilesViaFSAA()
    expect(picker.mock.calls[0]).toEqual([expect.objectContaining({
      types: [{ description: 'Spine files', accept: { 'application/octet-stream': SPINE_ACCEPT_EXTENSIONS } }],
    })])
    expect(SPINE_ACCEPT_EXTENSIONS).toContain('.zip')
    expect(res!.files).toEqual([zip])
  })

  it('folder picker reads subfolders recursively', async () => {
    const a = new File(['a'], 'hero.zip')
    const b = new File(['b'], 'enemy.json')
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => dir('pick', [fileHandle(a), dir('sub', [fileHandle(b)])])))
    const res = await pickFolderViaFSAA()
    expect(res!.files).toEqual([a, b])
    expect(res!.handles).toHaveLength(2)
    expect(res!.files.map(fileDir)).toEqual(['pick', 'pick/sub'])
  })

  it('a folder session reloads with the directories of its files', async () => {
    localStorage.clear()
    const a = new File(['a'], 'hero.json')
    const b = new File(['b'], 'hero.json')
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => dir('pick', [dir('one', [fileHandle(a)]), dir('two', [fileHandle(b)])])))
    const { handles } = (await pickFolderViaFSAA())!
    const done = saveSession(['hero.json', 'hero.json'], handles)
    await vi.waitFor(() => expect(puts).toHaveLength(1))
    const record = store.put.mock.lastCall as unknown as [{ dirs: string[] }]
    expect(record[0].dirs).toEqual(['pick/one', 'pick/two'])
    puts[0].oncomplete?.()
    await done
    const [session] = getSessions()
    const a2 = new File(['a'], 'hero.json'), b2 = new File(['b'], 'hero.json')
    stored[session.id] = { handles: [fileHandle(a2), fileHandle(b2)], dirs: record[0].dirs }
    expect((await reloadSession(session))!.map(fileDir)).toEqual(['pick/one', 'pick/two'])
  })

  it('a picked archive is recorded by its name and reloads from its handle', async () => {
    localStorage.clear()
    const zip = new File(['z'], 'hero.zip')
    const h = fileHandle(zip) as unknown as FileSystemFileHandle
    const done = saveSession(['hero.zip'], [h])
    await vi.waitFor(() => expect(puts).toHaveLength(1))
    puts[0].oncomplete?.()
    await done
    const [session] = getSessions()
    expect(session.fileNames).toEqual(['hero.zip'])
    stored[session.id] = { handles: [h] }
    expect(await reloadSession(session)).toEqual([zip])
  })
})
