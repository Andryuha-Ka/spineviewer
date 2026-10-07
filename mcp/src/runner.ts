/**
 * @file runner.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { mkdir, readdir, readFile, stat, writeFile, access } from 'node:fs/promises'
import { basename, dirname, extname, join, posix, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Page } from 'playwright-core'
import { ApiError, callApi, RESTART_NOTE, type Session } from './session.js'

export const MB = 1024 * 1024
export const LOAD_LIMIT_MB = 200
export const INPUT_SELECTOR = 'input[data-svp-api]'
const MIME: Record<string, string> = {
  '.zip': 'application/zip', '.json': 'application/json', '.atlas': 'text/plain', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.skel': 'application/octet-stream',
}

/** `dir`: the file's directory relative to the loaded folder's parent (forward slashes), so `<folder>[/sub…]`. */
export interface DiskFile { path: string; name: string; size: number; dir?: string }
export interface Artifact { name: string; mimeType?: string; dataUrl: string }
export interface Written { path: string; uri: string; name: string; mimeType: string; size: number }
export interface LoadOptions { mode?: 'add' | 'replace'; activate?: boolean; discardEdits?: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const mimeOf = (name: string) => MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'

/** JSON as text + structured content (non-objects wrapped in `{ result }`); `artifact` images inline. */
export function toContent(value: unknown, notes: string[] = []): CallToolResult {
  const extra = notes.map(text => ({ type: 'text' as const, text }))
  const art = isRecord(value) && isRecord(value.artifact) ? value.artifact : null
  const image = typeof art?.dataUrl === 'string' ? /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(art.dataUrl) : null
  if (art && image) {
    const meta = { name: art.name, mimeType: image[1] }
    return { content: [{ type: 'image', mimeType: image[1], data: image[2] }, { type: 'text', text: JSON.stringify(meta) }, ...extra], structuredContent: meta }
  }
  const v = value === undefined ? { ok: true } : value
  const structured = isRecord(v) ? v : { result: v }
  return {
    content: [{ type: 'text', text: JSON.stringify(v) }, ...extra],
    structuredContent: notes.length ? { ...structured, notes } : structured,
  }
}

export function errorContent(e: unknown): CallToolResult {
  const error = String((e as Error)?.message ?? e)
  const body = e instanceof ApiError && e.code ? { ok: false, code: e.code, error } : { ok: false, error }
  return { content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body, isError: true }
}

/** Expands paths (absolute or cwd-relative files, folders recursively, zips as is); checks all before reading any. */
export async function collectFiles(paths: string[], cwd = process.cwd()): Promise<DiskFile[]> {
  const out: DiskFile[] = []
  for (const p of paths) {
    const abs = resolve(cwd, p)
    const info = await stat(abs).catch(() => null)
    if (!info) throw new Error(`File not found: ${p}`)
    if (!info.isDirectory()) { out.push({ path: abs, name: basename(abs), size: info.size }); continue }
    const root = basename(abs) || 'root'
    for (const rel of (await readdir(abs, { recursive: true })).sort()) {
      const file = join(abs, rel)
      const s = await stat(file)
      if (s.isFile()) out.push({ path: file, name: basename(file), size: s.size, dir: posix.join(root, ...dirname(rel).split(sep)) })
    }
  }
  if (out.length === 0) throw new Error(`No files found in ${paths.join(', ')}`)
  const total = out.reduce((n, f) => n + f.size, 0)
  if (total > LOAD_LIMIT_MB * MB) throw new Error(`Load too large (${(total / MB).toFixed(1)} MB, limit ${LOAD_LIMIT_MB} MB)`)
  return out
}

/** A free `<stem>[-n]<ext>` in `dir`, also free as a folder `<stem>[-n]` when `withFolder`. */
export async function freeName(dir: string, name: string, withFolder = false): Promise<string> {
  const ext = extname(name), stem = name.slice(0, name.length - ext.length) || 'export'
  const taken = (p: string) => access(p).then(() => true, () => false)
  for (let n = 0; ; n++) {
    const s = n === 0 ? stem : `${stem}-${n}`
    if (await taken(join(dir, s + ext))) continue
    if (withFolder && await taken(join(dir, s))) continue
    return s + ext
  }
}

export const safeName = (name: string) => name.replace(/[^a-z0-9_.-]/gi, '_').replace(/^\.+/, '') || 'export'

export function decodeDataUrl(dataUrl: unknown): Buffer {
  const m = typeof dataUrl === 'string' ? /^data:[^,]*;base64,(.*)$/s.exec(dataUrl) : null
  if (!m) throw new Error('The export did not return an embedded file')
  return Buffer.from(m[1], 'base64')
}

/** Serial tool runner over the session: one `pending` chain for every tool and both pages. */
export class Runner {
  private pending: Promise<unknown> = Promise.resolve()
  readonly written = new Map<string, Written>()
  readonly exportDir: string

  constructor(readonly session: Session, private onWritten: (w: Written) => void = () => {}) {
    this.exportDir = session.config.exportDir
  }

  run(task: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const p = this.pending.then(task).catch(errorContent)
    this.pending = p
    return p
  }

  idle(): Promise<unknown> { return this.pending }

  /** The viewer page plus the restart note for the next result. */
  async viewer(url?: string): Promise<{ page: Page; notes: string[] }> {
    const { page, restarted } = await this.session.viewerPage(url)
    return { page, notes: restarted ? [RESTART_NOTE] : [] }
  }

  async svp(method: string, ...args: unknown[]): Promise<CallToolResult> {
    const { page, notes } = await this.viewer()
    return toContent(await callApi(page, 'svp', method, args), notes)
  }

  async keyframe(method: string, args: unknown[] = []): Promise<unknown> {
    return callApi(await this.session.keyframePage(), 'keyframe', method, args)
  }

  /** svp.load for files on disk: D11 variant B, Chrome reads the paths set on a hidden input (A crashed the page at ~80 MB). */
  async loadFiles(page: Page, files: DiskFile[], opts: LoadOptions): Promise<unknown> {
    await page.evaluate((sel) => {
      if (document.querySelector(sel)) return
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.hidden = true
      input.setAttribute('data-svp-api', '')
      document.body.appendChild(input)
    }, INPUT_SELECTOR)
    await page.locator(INPUT_SELECTOR).setInputFiles(files.map(f => f.path))
    return callApi(page, 'svp', 'load', [opts], { selector: INPUT_SELECTOR, paths: files.map(f => f.dir) })
  }

  async load(paths: string[], opts: LoadOptions): Promise<CallToolResult> {
    const files = await collectFiles(paths)
    const { page, notes } = await this.viewer()
    return toContent(await this.loadFiles(page, files, opts), notes)
  }

  private async record(path: string, size: number): Promise<Written> {
    const w: Written = { path, uri: pathToFileURL(path).href, name: basename(path), mimeType: mimeOf(path), size }
    this.written.set(w.uri, w)
    this.onWritten(w)
    return w
  }

  /** Writes an export artifact without overwriting; a zip with `unpack` also lands in a sibling folder. */
  async writeArtifact(art: Artifact, unpack = false): Promise<Written[]> {
    const bytes = decodeDataUrl(art.dataUrl)
    await mkdir(this.exportDir, { recursive: true })
    const name = await freeName(this.exportDir, safeName(art.name), unpack)
    const path = join(this.exportDir, name)
    await writeFile(path, bytes, { flag: 'wx' })
    const out = [await this.record(path, bytes.length)]
    if (unpack) {
      const folder = path.slice(0, path.length - extname(path).length)
      for (const [rel, data] of Object.entries(unzipSync(bytes))) {
        if (rel.endsWith('/')) continue
        const file = resolve(folder, rel)
        if (!file.startsWith(folder + sep)) continue
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, data, { flag: 'wx' })
        out.push(await this.record(file, data.length))
      }
    }
    return out
  }

  /** Text JSON + one resource link per written file. */
  writtenContent(result: Record<string, unknown>, files: Written[], notes: string[] = []): CallToolResult {
    const body = { ...result, paths: files.map(f => f.path), ...(notes.length ? { notes } : {}) }
    return {
      content: [
        { type: 'text', text: JSON.stringify(body) },
        ...files.map(f => ({ type: 'resource_link' as const, uri: f.uri, name: f.name, mimeType: f.mimeType })),
        ...notes.map(text => ({ type: 'text' as const, text })),
      ],
      structuredContent: body,
    }
  }

  async readResource(uri: string) {
    const w = this.written.get(uri)
    if (!w) throw new Error('Unknown resource; only files written in this session can be read')
    return { contents: [{ uri, mimeType: w.mimeType, blob: (await readFile(w.path)).toString('base64') }] }
  }

  async exportSkeleton(format: 'zip' | 'json', unpacked: boolean): Promise<CallToolResult> {
    const { page, notes } = await this.viewer()
    const res = await callApi(page, 'svp', 'exportSkeleton', [{ format }]) as { artifact: Artifact; warnings?: unknown[] }
    const files = await this.writeArtifact(res.artifact, unpacked && format === 'zip')
    return this.writtenContent({ ok: true, warnings: res.warnings ?? [] }, files, notes)
  }

  async screenshot(): Promise<CallToolResult> {
    const { page, notes } = await this.viewer()
    const data = (await page.screenshot({ type: 'png' })).toString('base64')
    return { content: [{ type: 'image', mimeType: 'image/png', data }, ...notes.map(text => ({ type: 'text' as const, text }))] }
  }

  async keyframeToViewer(version: '4.2' | '3.8', binary: boolean | undefined, mode: 'add' | 'replace'): Promise<CallToolResult> {
    const res = await this.keyframe('exportArtifact', [{ format: 'spine', version, ...(binary !== undefined ? { binary } : {}) }])
    const art = (isRecord(res) && isRecord(res.artifact) ? res.artifact : res) as unknown as Artifact
    const [zip] = await this.writeArtifact({ ...art, name: art.name || 'keyframe-spine.zip' })
    const { page, notes } = await this.viewer()
    const loaded = await this.loadFiles(page, [{ path: zip.path, name: zip.name, size: zip.size }], { mode, activate: true })
    return this.writtenContent({ ok: true, zip: zip.path, ...(isRecord(loaded) ? loaded : { loaded }) }, [zip], notes)
  }

  async viewerToKeyframe(doImport: boolean): Promise<CallToolResult> {
    const { page, notes } = await this.viewer()
    const res = await callApi(page, 'svp', 'exportSkeleton', [{ format: 'zip' }]) as { artifact: Artifact; warnings?: unknown[] }
    const files = await this.writeArtifact(res.artifact, true)
    const unpacked = files.slice(1).filter(f => !/\.html?$/i.test(f.name))
    const folder = files[0].path.slice(0, -extname(files[0].path).length)
    const base = { ok: true, zip: files[0].path, folder, warnings: res.warnings ?? [] }
    if (!doImport) return this.writtenContent({ ...base, imported: false, reason: 'import: false' }, files, notes)
    const outcome = await this.importIntoKeyframe(unpacked.map(f => f.path))
    const manual = outcome.imported ? {} : { manualStep: `In keyframe.it choose Menu → Import Spine… and select every file in ${folder}` }
    return this.writtenContent({ ...base, ...outcome, ...manual }, files, notes)
  }

  /** Best effort: "Import Spine…" through the file chooser, else the editor's hidden Spine input. Never throws. */
  async importIntoKeyframe(paths: string[]): Promise<{ imported: boolean; reason?: string; via?: string; message?: string }> {
    let page: Page
    try { page = await this.session.keyframePage() } catch (e) { return { imported: false, reason: (e as Error).message } }
    const before = await callApi(page, 'keyframe', 'sessionInfo').catch(() => null) as Record<string, unknown> | null
    const messages: string[] = []
    const onDialog = (d: { message(): string }) => { messages.push(d.message()) }
    page.on('dialog', onDialog)
    try {
      let via = 'filechooser'
      try {
        const item = page.getByText(/Import Spine/i).first()
        if (!await item.isVisible()) await page.getByRole('button', { name: /menu/i }).first().click({ timeout: 5_000 })
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), item.click({ timeout: 10_000 })])
        await chooser.setFiles(paths)
      } catch {
        via = 'input'
        const input = page.locator('input[type=file][accept*=".atlas"]').first()
        try { await input.setInputFiles(paths, { timeout: 5_000 }) } catch {
          return { imported: false, reason: 'The "Import Spine…" picker could not be found in keyframe.it' }
        }
      }
      for (let i = 0; i < 40; i++) {
        const failed = messages.find(m => /could not import/i.test(m))
        if (failed) return { imported: false, via, reason: failed }
        const after = await callApi(page, 'keyframe', 'sessionInfo').catch(() => null) as Record<string, unknown> | null
        const changed = after && (!before || after.projectId !== before.projectId || after.revision !== before.revision)
        if (changed || messages.length) return { imported: true, via, ...(messages.length ? { message: messages.join('\n') } : {}) }
        await new Promise(r => setTimeout(r, 250))
      }
      return { imported: false, via, reason: 'keyframe.it did not report an imported project within 10 s' }
    } finally {
      page.off('dialog', onDialog)
    }
  }
}
