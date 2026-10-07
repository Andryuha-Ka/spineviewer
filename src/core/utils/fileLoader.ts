/**
 * @file fileLoader.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { toRaw } from 'vue'
import type { FileSet, SpineFileType, SpineSlot } from '@/core/types/FileSet'

// ── Readers ───────────────────────────────────────────────────────────────────

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

// ── Type detection ────────────────────────────────────────────────────────────

const SPINE_EXTENSIONS = {
  'skeleton-json': ['json'],
  'skeleton-skel': ['skel'],
  atlas:           ['atlas'],
  image:           ['png', 'jpg', 'jpeg', 'webp', 'avif'],
} as const satisfies Record<SpineFileType, readonly string[]>

/** Image-layer / placeholder drops also accept gif. */
export const IMAGE_DROP_EXTENSIONS = [...SPINE_EXTENSIONS.image, 'gif'] as const

export const SPINE_ACCEPT_EXTENSIONS: string[] =
  [...Object.values(SPINE_EXTENSIONS).flat().map(e => `.${e}`), '.zip']

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function guessFileType(filename: string): SpineFileType | null {
  const ext = extOf(filename)
  for (const [type, exts] of Object.entries(SPINE_EXTENSIONS) as [SpineFileType, readonly string[]][]) {
    if (exts.includes(ext)) return type
  }
  return null
}

export function isTextureFileName(name: string): boolean {
  return guessFileType(name) === 'image'
}

export function isImageDropFileName(name: string): boolean {
  return (IMAGE_DROP_EXTENSIONS as readonly string[]).includes(extOf(name))
}

// ── Zip archives ──────────────────────────────────────────────────────────────

/** Source archive name of every file extracted by `expandZipFiles`. */
export const archiveOf = new WeakMap<File, string>()

/** Relative directory ('' = root, forward slashes) of files whose location is known: zip entries, folder picks, API `path`. */
export const dirOf = new WeakMap<File, string>()

/** Relative directory of a file; undefined for a loose file (location unknown). */
export function fileDir(f: File): string | undefined {
  const raw = toRaw(f)
  const known = dirOf.get(raw)
  if (known !== undefined) return known
  const rel = raw.webkitRelativePath
  return rel ? rel.slice(0, Math.max(0, rel.lastIndexOf('/'))) : undefined
}

export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
}

function keepZipEntry(path: string): boolean {
  if (path.endsWith('/') || path.startsWith('__MACOSX/')) return false
  const parts = path.split(/[\\/]/)
  return !parts.some(p => p.startsWith('.')) && guessFileType(parts[parts.length - 1]) !== null
}

/** Replaces every `.zip` with its Spine entries (base names); throws "Cannot read archive: <name>". */
export async function expandZipFiles(files: File[]): Promise<File[]> {
  if (!files.some(f => extOf(f.name) === 'zip')) return files
  const { unzipSync } = await import('fflate')
  const out: File[] = []
  for (const file of files) {
    if (extOf(file.name) !== 'zip') { out.push(file); continue }
    let entries: Record<string, Uint8Array<ArrayBuffer>>
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: e => keepZipEntry(e.name) })
    } catch {
      throw new Error(`Cannot read archive: ${file.name}`)
    }
    const parent = fileDir(file)
    const root   = parent ? `${parent}/${file.name}` : file.name
    for (const [path, bytes] of Object.entries(entries)) {
      const parts     = path.split(/[\\/]/)
      const name      = parts.pop()!
      const extracted = new File([bytes], name, { type: IMAGE_MIME[extOf(name)] ?? '' })
      archiveOf.set(extracted, file.name)
      dirOf.set(extracted, [root, ...parts].join('/'))
      out.push(extracted)
    }
  }
  return out
}

// ── Multi-spine grouping ──────────────────────────────────────────────────────

export interface GroupSpineResult {
  slots: SpineSlot[]
  globalError?: string
}

/** Extract image filenames referenced by an atlas (one per page header line). */
function parseAtlasImageNames(atlasText: string): string[] {
  return atlasText
    .split('\n')
    .map(l => l.trim())
    .filter(l => isTextureFileName(l) && !l.includes(':'))
}

function makeId(): string {
  return crypto.randomUUID()
}

const isSkeletonFile = (f: File) => {
  const t = guessFileType(f.name)
  return t === 'skeleton-json' || t === 'skeleton-skel'
}

const parentDir = (d: string): string | undefined => d === '' ? undefined : d.slice(0, Math.max(0, d.lastIndexOf('/')))

/**
 * Splits files by directory: each file goes to the nearest directory (its own or an ancestor) that holds
 * both a skeleton and an atlas; files without such a directory, or of unknown location, share one bucket.
 */
function bucketsByDirectory(files: File[], types: Array<SpineFileType | null>): File[][] {
  const dirs = files.map(fileDir)
  const dirsOf = (pick: (t: SpineFileType | null) => boolean) =>
    new Set(dirs.filter((d, i): d is string => d !== undefined && pick(types[i])))
  const atlasDirs = dirsOf(t => t === 'atlas')
  const complete  = [...dirsOf(t => t === 'skeleton-json' || t === 'skeleton-skel')].filter(d => atlasDirs.has(d))
  if (complete.length === 0) return [files]
  const buckets = new Map<string | null, File[]>()
  files.forEach((f, i) => {
    let d = dirs[i]
    while (d !== undefined && !complete.includes(d)) d = parentDir(d)
    const key = d ?? null
    buckets.set(key, [...(buckets.get(key) ?? []), f])
  })
  return [...buckets.values()]
}

/** Pairs skeletons with atlases: by base name (case-insensitive), then remaining orphans 1-to-1 in order. */
function pairSkeletons(skeletons: File[], atlases: File[], texts: Map<File, string>) {
  const free = [...atlases]
  const matched: Array<{ skel: File; atlas: File; atlasText: string }> = []
  const orphans: File[] = []
  for (const skel of skeletons) {
    const base = skel.name.replace(/\.(json|skel)$/i, '').toLowerCase()
    const idx  = free.findIndex(a => a.name.replace(/\.atlas$/i, '').toLowerCase() === base)
    if (idx < 0) { orphans.push(skel); continue }
    const [atlas] = free.splice(idx, 1)
    matched.push({ skel, atlas, atlasText: texts.get(atlas)! })
  }
  const unmatched: File[] = []
  for (const skel of orphans) {
    const atlas = free.shift()
    if (atlas) matched.push({ skel, atlas, atlasText: texts.get(atlas)! })
    else unmatched.push(skel)
  }
  return { matched, unmatched }
}

/**
 * Groups an arbitrary list of dropped files into per-spine slots.
 *
 * Files of a known directory (zip entries, folder picks, API `path`) are first split per directory
 * (`bucketsByDirectory`), so two folders with same-named pages never mix; loose files keep name matching.
 * Per bucket: skeleton ↔ atlas by base name, then orphans 1-to-1; unpaired skeletons become error slots.
 * Images per pair: the pages the atlas names (path-stripped) from its bucket, else from all files;
 * an atlas naming no page takes all images; none found → error slot.
 */
export async function groupSpineFiles(input: File[]): Promise<GroupSpineResult> {
  let files: File[]
  try {
    files = await expandZipFiles(input)
  } catch (e) {
    return { slots: [], globalError: (e as Error).message }
  }
  const types    = files.map(f => guessFileType(f.name))
  const skeletons = files.filter((_, i) => types[i] === 'skeleton-json' || types[i] === 'skeleton-skel')
  const atlases   = files.filter((_, i) => types[i] === 'atlas')
  const images    = files.filter((_, i) => types[i] === 'image')

  if (skeletons.length === 0)
    return { slots: [], globalError: 'Missing skeleton file (.json or .skel)' }
  if (atlases.length === 0)
    return { slots: [], globalError: 'Missing atlas file (.atlas)' }
  if (images.length === 0)
    return { slots: [], globalError: 'Missing image files (.png / .jpg / .webp / .avif)' }

  // Read all atlas files upfront (needed for image name extraction)
  const texts = new Map(await Promise.all(atlases.map(async a => [a, await a.text()] as const)))

  const matched: Array<{ skel: File; atlas: File; atlasText: string; images: File[] }> = []
  const stillUnmatched: File[] = []
  for (const bucket of bucketsByDirectory(files, types)) {
    const pairs = pairSkeletons(bucket.filter(isSkeletonFile), bucket.filter(f => texts.has(f)), texts)
    const bucketImages = bucket.filter(f => isTextureFileName(f.name))
    matched.push(...pairs.matched.map(m => ({ ...m, images: bucketImages })))
    stillUnmatched.push(...pairs.unmatched)
  }

  // Build slots from matched groups
  const slots: SpineSlot[] = []

  for (const { skel, atlas, atlasText, images: bucketImages } of matched) {
    const name   = skel.name.replace(/\.(json|skel)$/i, '')
    const isJson = skel.name.toLowerCase().endsWith('.json')

    // Images referenced by this atlas: its own directory first, then every dropped image
    const refs   = parseAtlasImageNames(atlasText).map(r => r.split('/').pop()!.toLowerCase())
    const pick   = (list: File[]) => refs.length > 0 ? list.filter(img => refs.includes(img.name.toLowerCase())) : list
    const local  = pick(bucketImages)
    const slotImages = local.length > 0 ? local : pick(images)

    if (slotImages.length === 0) {
      slots.push({ id: makeId(), name, error: 'No matching images found in dropped files' })
      continue
    }

    const [skelBody, ...imgBodies] = await Promise.all([
      isJson ? skel.text() : skel.arrayBuffer(),
      ...slotImages.map(f => readFileAsDataURL(f)),
    ])

    const fileSet: FileSet = {
      skeleton: {
        filename: skel.name,
        fileBody: skelBody,
        type:     isJson ? 'skeleton-json' : 'skeleton-skel',
        mimeType: isJson ? 'application/json' : 'application/octet-stream',
      },
      atlas: {
        filename: atlas.name,
        fileBody: atlasText,
        type:     'atlas',
        mimeType: 'text/plain',
      },
      images: slotImages.map((f, i) => ({
        filename: f.name,
        fileBody: imgBodies[i] as string,
        type:     'image' as const,
        mimeType: f.type || 'image/png',
      })),
    }

    slots.push({ id: makeId(), name, fileSet })
  }

  // Step 3 (Variant C) — error slots for completely unmatched skeletons
  for (const skel of stillUnmatched) {
    slots.push({
      id:    makeId(),
      name:  skel.name.replace(/\.(json|skel)$/i, ''),
      error: 'No matching atlas found',
    })
  }

  return { slots }
}

// ── DataTransfer → File[] (supports dropped folders) ─────────────────────────

export async function getFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const files: File[] = []

  async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    const all: FileSystemEntry[] = []
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej),
      )
      if (batch.length === 0) break
      all.push(...batch)
    }
    return all
  }

  async function processEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      )
      dirOf.set(file, entry.fullPath.slice(1, Math.max(1, entry.fullPath.lastIndexOf('/'))))
      files.push(file)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const entries = await readAllEntries(reader)
      await Promise.all(entries.map(processEntry))
    }
  }

  const entries = Array.from(dt.items)
    .map(item => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)

  await Promise.all(entries.map(processEntry))
  return files
}
