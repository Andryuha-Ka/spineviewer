/**
 * @file fileLoader.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { FileSet, SpineFileType, SpineSlot } from '@/core/types/FileSet'

// ── Readers ───────────────────────────────────────────────────────────────────

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(file)
  })
}

// ── Type detection ────────────────────────────────────────────────────────────

export function guessFileType(filename: string): SpineFileType | null {
  const name = filename.toLowerCase()
  if (name.endsWith('.json')) return 'skeleton-json'
  if (name.endsWith('.skel')) return 'skeleton-skel'
  if (name.endsWith('.atlas')) return 'atlas'
  if (/\.(png|jpe?g|webp|avif)$/.test(name)) return 'image'
  return null
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
    .filter(l => /\.(png|jpe?g|webp|avif)$/i.test(l) && !l.includes(':'))
}

function makeId(): string {
  return crypto.randomUUID()
}

/**
 * Groups an arbitrary list of dropped files into per-spine slots.
 *
 * Matching strategy:
 *   1. Match each skeleton to an atlas by base-name (exact, case-insensitive).
 *   2. Variant B: auto-pair remaining orphan skeletons with remaining orphan atlases (1-to-1).
 *   3. Variant C: create error slots for skeletons that couldn't be paired at all.
 *
 * Image assignment per matched pair:
 *   - Parse atlas text for referenced image names; match by filename (path-stripped).
 *   - Fallback: if atlas references nothing matchable, use ALL dropped images.
 *   - If no images found → error slot.
 */
export async function groupSpineFiles(files: File[]): Promise<GroupSpineResult> {
  const skeletons = files.filter(f => /\.(json|skel)$/i.test(f.name))
  const atlases   = files.filter(f => /\.atlas$/i.test(f.name))
  const images    = files.filter(f => /\.(png|jpe?g|webp|avif)$/i.test(f.name))

  if (skeletons.length === 0)
    return { slots: [], globalError: 'Missing skeleton file (.json or .skel)' }
  if (atlases.length === 0)
    return { slots: [], globalError: 'Missing atlas file (.atlas)' }
  if (images.length === 0)
    return { slots: [], globalError: 'Missing image files (.png / .jpg / .webp / .avif)' }

  // Read all atlas files upfront (needed for image name extraction)
  const atlasTexts = await Promise.all(atlases.map(a => readFileAsText(a)))

  // Step 1 — match by base-name
  const atlasUsed = new Set<number>()
  const matched: Array<{ skel: File; atlas: File; atlasText: string }> = []
  const unmatchedSkels: File[] = []

  for (const skel of skeletons) {
    const base = skel.name.replace(/\.(json|skel)$/i, '').toLowerCase()
    const idx  = atlases.findIndex((a, i) =>
      !atlasUsed.has(i) && a.name.replace(/\.atlas$/i, '').toLowerCase() === base,
    )
    if (idx >= 0) {
      atlasUsed.add(idx)
      matched.push({ skel, atlas: atlases[idx], atlasText: atlasTexts[idx] })
    } else {
      unmatchedSkels.push(skel)
    }
  }

  // Step 2 (Variant B) — auto-pair remaining orphans
  const orphanAtlases    = atlases.filter((_, i) => !atlasUsed.has(i))
  const orphanAtlasTexts = atlasTexts.filter((_, i) => !atlasUsed.has(i))
  const stillUnmatched: File[] = []

  for (const skel of unmatchedSkels) {
    if (orphanAtlases.length > 0) {
      matched.push({
        skel,
        atlas:     orphanAtlases.shift()!,
        atlasText: orphanAtlasTexts.shift()!,
      })
    } else {
      stillUnmatched.push(skel)
    }
  }

  // Build slots from matched groups
  const slots: SpineSlot[] = []

  for (const { skel, atlas, atlasText } of matched) {
    const name   = skel.name.replace(/\.(json|skel)$/i, '')
    const isJson = skel.name.toLowerCase().endsWith('.json')

    // Find images referenced by this atlas
    const refs        = parseAtlasImageNames(atlasText)
    const slotImages  = refs.length > 0
      ? images.filter(img => refs.some(r =>
          r.split('/').pop()!.toLowerCase() === img.name.toLowerCase(),
        ))
      : images  // fallback: all images (single-spine scenario)

    if (slotImages.length === 0) {
      slots.push({ id: makeId(), name, error: 'No matching images found in dropped files' })
      continue
    }

    const [skelBody, ...imgBodies] = await Promise.all([
      isJson ? readFileAsText(skel) : readFileAsArrayBuffer(skel),
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
