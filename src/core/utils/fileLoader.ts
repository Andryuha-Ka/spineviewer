import type { FileSet, SpineFile, SpineFileType } from '@/core/types/FileSet'

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

// ── Classification ────────────────────────────────────────────────────────────

export type ClassifyResult =
  | { ok: true; fileSet: FileSet }
  | { ok: false; error: string }

export async function classifyFiles(files: File[]): Promise<ClassifyResult> {
  const skeletonFiles = files.filter(f => /\.(json|skel)$/i.test(f.name))
  const atlasFiles    = files.filter(f => /\.atlas$/i.test(f.name))
  const imageFiles    = files.filter(f => /\.(png|jpe?g|webp|avif)$/i.test(f.name))

  if (skeletonFiles.length === 0)
    return { ok: false, error: 'Missing skeleton file (.json or .skel)' }
  if (atlasFiles.length === 0)
    return { ok: false, error: 'Missing atlas file (.atlas)' }
  if (imageFiles.length === 0)
    return { ok: false, error: 'Missing image files (.png / .jpg / .webp / .avif)' }

  // Prefer .json over binary .skel
  const jsonCandidates = skeletonFiles.filter(f => f.name.toLowerCase().endsWith('.json'))
  const skelFile = jsonCandidates[0] ?? skeletonFiles[0]
  const isJson   = skelFile.name.toLowerCase().endsWith('.json')

  const atlasFile = atlasFiles[0]

  const [skeletonBody, atlasBody, ...imageBodies] = await Promise.all([
    isJson ? readFileAsText(skelFile) : readFileAsArrayBuffer(skelFile),
    readFileAsText(atlasFile),
    ...imageFiles.map(f => readFileAsDataURL(f)),
  ])

  const skeleton: SpineFile = {
    filename: skelFile.name,
    fileBody: skeletonBody,
    type: isJson ? 'skeleton-json' : 'skeleton-skel',
    mimeType: isJson ? 'application/json' : 'application/octet-stream',
  }

  const atlas: SpineFile = {
    filename: atlasFile.name,
    fileBody: atlasBody as string,
    type: 'atlas',
    mimeType: 'text/plain',
  }

  const images: SpineFile[] = imageFiles.map((f, i) => ({
    filename: f.name,
    fileBody: imageBodies[i] as string,
    type: 'image',
    mimeType: f.type || 'image/png',
  }))

  return { ok: true, fileSet: { skeleton, atlas, images } }
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
