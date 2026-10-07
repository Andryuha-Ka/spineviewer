/**
 * @file fileHistory.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { SPINE_ACCEPT_EXTENSIONS, dirOf } from '@/core/utils/fileLoader'

export interface HistorySession {
  id: string
  timestamp: number
  fileNames: string[]
  /** true if this session has handles stored in IndexedDB (FSAA variant B) */
  hasHandles: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const DB_NAME    = 'svp-file-history'
const DB_STORE   = 'sessions'
const LS_KEY     = 'svp:history:sessions'
const MAX        = 20

// ── FSAA detection ────────────────────────────────────────────────────────────

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'FileSystemFileHandle' in window
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror   = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, record: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
    tx.onabort    = () => reject(tx.error)
    tx.objectStore(DB_STORE).put(record)
  })
}

async function idbGet<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror   = () => reject(req.error)
  })
}

async function idbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror   = () => reject(req.error)
  })
}

async function idbPrune(db: IDBDatabase): Promise<void> {
  const all = await idbGetAll<{ id: string; timestamp: number }>(db)
  if (all.length <= MAX) return
  all.sort((a, b) => a.timestamp - b.timestamp)
  const tx = db.transaction(DB_STORE, 'readwrite')
  const store = tx.objectStore(DB_STORE)
  for (const s of all.slice(0, all.length - MAX)) store.delete(s.id)
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function lsLoad(): HistorySession[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function lsSave(sessions: HistorySession[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(sessions.slice(0, MAX))) } catch {}
}

function makeId(): string {
  return crypto.randomUUID()
}

/** Folder-relative directory of handles from `pickFolderViaFSAA`, stored with the session so a reload groups the same way. */
const handleDirs = new WeakMap<FileSystemFileHandle, string>()

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a new session.
 * @param fileNames  - list of file names that were loaded
 * @param handles    - optional FSAA handles (only provided when FSAA is supported)
 */
export async function saveSession(
  fileNames: string[],
  handles?: FileSystemFileHandle[],
): Promise<void> {
  if (!fileNames.length) return

  const session: HistorySession = {
    id:         makeId(),
    timestamp:  Date.now(),
    fileNames,
    hasHandles: !!(handles && handles.length > 0 && isFileSystemAccessSupported()),
  }

  // Always persist metadata to localStorage
  const existing = lsLoad()
  lsSave([session, ...existing])

  // Additionally store handles to IndexedDB when FSAA is available
  if (session.hasHandles && handles) {
    try {
      const db = await openDB()
      await idbPut(db, { ...session, handles, dirs: handles.map(h => handleDirs.get(h) ?? null) })
      await idbPrune(db)
    } catch (e) {
      console.warn('[fileHistory] IndexedDB write failed', e)
    }
  }
}

/** Return all sessions (metadata only, sorted newest first). */
export function getSessions(): HistorySession[] {
  return lsLoad()
}

/**
 * Get stored handles for a session without requesting permission.
 * Used for startIn navigation when auto-reload fails.
 */
export async function getSessionHandles(id: string): Promise<FileSystemFileHandle[] | null> {
  if (!isFileSystemAccessSupported()) return null
  try {
    const db = await openDB()
    const stored = await idbGet<{ handles: FileSystemFileHandle[] }>(db, id)
    return stored?.handles?.length ? stored.handles : null
  } catch { return null }
}

/**
 * Try to reload a session's files from stored handles (variant B).
 * Returns null if handles are unavailable or permission denied.
 */
export async function reloadSession(session: HistorySession): Promise<File[] | null> {
  if (!session.hasHandles || !isFileSystemAccessSupported()) return null
  try {
    const db = await openDB()
    const stored = await idbGet<{ handles: FileSystemFileHandle[]; dirs?: Array<string | null> }>(db, session.id)
    if (!stored?.handles?.length) return null

    const files: File[] = []
    for (const handle of stored.handles) {
      // TODO: remove cast when File System Access API types are stable in TypeScript lib
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perm = await (handle as any).requestPermission({ mode: 'read' })
      if (perm !== 'granted') return null
      const file = await handle.getFile()
      const dir = stored.dirs?.[files.length]
      if (typeof dir === 'string') dirOf.set(file, dir)
      files.push(file)
    }
    return files
  } catch { return null }
}

/** Delete a single session by id (localStorage + IndexedDB). */
export async function deleteSession(id: string): Promise<void> {
  const sessions = lsLoad().filter(s => s.id !== id)
  lsSave(sessions)
  if (isFileSystemAccessSupported()) {
    try {
      const db = await openDB()
      db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id)
    } catch {}
  }
}

/** Delete all history (localStorage + IndexedDB). */
export async function clearHistory(): Promise<void> {
  localStorage.removeItem(LS_KEY)
  if (isFileSystemAccessSupported()) {
    try {
      const db = await openDB()
      db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).clear()
    } catch {}
  }
}

/** Attempt to open files via File System Access API picker. Returns handles + files. */
export async function pickFilesViaFSAA(
  multiple = true,
  startIn?: FileSystemHandle,
): Promise<{ files: File[]; handles: FileSystemFileHandle[] } | null> {
  try {
    // TODO: remove cast when File System Access API types are stable in TypeScript lib
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
      multiple,
      ...(startIn ? { startIn } : {}),
      types: [{
        description: 'Spine files',
        accept: { 'application/octet-stream': SPINE_ACCEPT_EXTENSIONS },
      }],
    })
    const files = await Promise.all(handles.map((h: FileSystemFileHandle) => h.getFile()))
    return { files, handles }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') console.warn('[fileHistory] showOpenFilePicker failed', e)
    return null
  }
}

/** Attempt to open a folder via File System Access API. Returns handles + files. */
export async function pickFolderViaFSAA(): Promise<{ files: File[]; handles: FileSystemFileHandle[] } | null> {
  try {
    // TODO: remove cast when File System Access API types are stable in TypeScript lib
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' })
    const handles: FileSystemFileHandle[] = []
    const files: File[] = []
    const walk = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
      // TODO: remove cast when File System Access API types are stable in TypeScript lib
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const entry of (dir as any).values()) {
        if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, `${path}/${entry.name}`)
        else if (entry.kind === 'file') {
          const file = await (entry as FileSystemFileHandle).getFile()
          handleDirs.set(entry, path)
          dirOf.set(file, path)
          handles.push(entry as FileSystemFileHandle)
          files.push(file)
        }
      }
    }
    await walk(dirHandle, dirHandle.name)
    return { files, handles }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') console.warn('[fileHistory] showDirectoryPicker failed', e)
    return null
  }
}
