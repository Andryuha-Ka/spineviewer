/**
 * @file fileHistory.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

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

function idbPut(db: IDBDatabase, record: object): void {
  const tx = db.transaction(DB_STORE, 'readwrite')
  tx.objectStore(DB_STORE).put(record)
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
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return String(Date.now()) + Math.random().toString(36).slice(2)
}

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
      idbPut(db, { ...session, handles })
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
    const stored = await idbGet<{ handles: FileSystemFileHandle[] }>(db, session.id)
    if (!stored?.handles?.length) return null

    const files: File[] = []
    for (const handle of stored.handles) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // TODO: remove cast when File System Access API types are stable in TypeScript lib
      const perm = await (handle as any).requestPermission({ mode: 'read' })
      if (perm !== 'granted') return null
      files.push(await handle.getFile())
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // TODO: remove cast when File System Access API types are stable in TypeScript lib
    const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
      multiple,
      ...(startIn ? { startIn } : {}),
      types: [{
        description: 'Spine files',
        accept: { 'application/octet-stream': ['.json', '.skel', '.atlas', '.png', '.jpg', '.jpeg', '.webp', '.avif'] },
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // TODO: remove cast when File System Access API types are stable in TypeScript lib
    const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' })
    const handles: FileSystemFileHandle[] = []
    const files: File[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // TODO: remove cast when File System Access API types are stable in TypeScript lib
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file') {
        handles.push(entry as FileSystemFileHandle)
        files.push(await (entry as FileSystemFileHandle).getFile())
      }
    }
    return { files, handles }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') console.warn('[fileHistory] showDirectoryPicker failed', e)
    return null
  }
}

/**
 * Try to get FileSystemFileHandles from a DataTransfer (drag-drop).
 * Only works if FSAA is supported AND items have the getAsFileSystemHandle method.
 */
export async function handlesFromDataTransfer(dt: DataTransfer): Promise<FileSystemFileHandle[]> {
  if (!isFileSystemAccessSupported()) return []
  const handles: FileSystemFileHandle[] = []
  for (const item of Array.from(dt.items)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // TODO: remove cast when File System Access API types are stable in TypeScript lib
      const handle = await (item as any).getAsFileSystemHandle?.()
      if (handle?.kind === 'file') {
        handles.push(handle as FileSystemFileHandle)
      } else if (handle?.kind === 'directory') {
        // Enumerate files from dropped directory
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // TODO: remove cast when File System Access API types are stable in TypeScript lib
        for await (const entry of (handle as any).values()) {
          if (entry.kind === 'file') handles.push(entry as FileSystemFileHandle)
        }
      }
    } catch {}
  }
  return handles
}
