/**
 * @file session.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { BrowserContext, BrowserType, Dialog, Page } from 'playwright-core'
import { allowedUrl, type Config } from './config.js'

export const SUPPORTED_API_MAJOR = 1
export const PAGE_WAIT_MS = 30_000
export const CHROME_MISSING = 'Google Chrome was not found; install Chrome or set its path'
export const RESTART_NOTE = 'The viewer page was closed or crashed and has been reopened: the previous session and its edits were lost.'

/** A rejected page API call, carrying the SvpError code when the page gave one. */
export class ApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}

export type ApiReply = { ok: true; value: unknown } | { ok: false; code?: string; error: string }

/** Files set on a page input: read them as the first argument, `paths[i]` becoming entry i's `path`. */
export interface FromInput { selector: string; paths: (string | undefined)[] }

interface InPageCall { global: string; method: string; args: unknown[]; fromInput?: FromInput }

/** Runs inside the page: calls globalThis[global][method], never throws. */
async function invokeInPage({ global, method, args, fromInput }: InPageCall): Promise<ApiReply> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (globalThis as any)[global]
  if (!api || !Object.prototype.hasOwnProperty.call(api, method) || typeof api[method] !== 'function') {
    return { ok: false, code: 'NOT_FOUND', error: `NOT_FOUND: Unknown API method ${method}` }
  }
  try {
    if (fromInput) {
      const input = document.querySelector(fromInput.selector) as HTMLInputElement
      const files = Array.from(input.files ?? [])
      const entries = await Promise.all(files.map((f, i) => new Promise((res, rej) => {
        const r = new FileReader()
        const path = fromInput.paths[i]
        r.onload = () => res(path ? { name: f.name, base64: r.result, path } : { name: f.name, base64: r.result })
        r.onerror = () => rej(r.error)
        r.readAsDataURL(f)
      })))
      input.value = ''
      args = [entries, ...args]
    }
    const value = await api[method](...args)
    if (value && typeof value === 'object' && value.ok === false) {
      return { ok: false, code: typeof value.code === 'string' ? value.code : undefined, error: String(value.error ?? 'Failed') }
    }
    return { ok: true, value }
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any
    return { ok: false, code: typeof err?.code === 'string' ? err.code : undefined, error: String(err?.message ?? err) }
  }
}

export async function callApi(page: Page, global: string, method: string, args: unknown[] = [], fromInput?: FromInput): Promise<unknown> {
  const reply = await page.evaluate(invokeInPage, { global, method, args, fromInput })
  if (!reply.ok) throw new ApiError(reply.error, reply.code)
  return reply.value
}

const isChromeMissing = (e: unknown) =>
  /is not found at|executable doesn't exist|ENOENT|not installed/i.test(String((e as Error)?.message ?? e))

/** Accepts the viewer's beforeunload prompt on navigation; other dialogs are dismissed. */
const dialogs = (d: Dialog) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {})

/** One persistent Chrome profile with up to two pages: the viewer and keyframe.it. */
export class Session {
  context: BrowserContext | null = null
  viewer: Page | null = null
  keyframe: Page | null = null
  viewerUrl: string
  keyframeUrl: string
  private keyframeLoaded = ''
  private viewerCrashed = false
  private viewerWasOpen = false
  private apiVersion = ''

  constructor(private chromium: Pick<BrowserType, 'launchPersistentContext'>, readonly config: Config) {
    this.viewerUrl = config.url
    this.keyframeUrl = config.keyframeUrl
  }

  async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context
    const { chromePath, profile, headed } = this.config
    let ctx: BrowserContext
    try {
      ctx = await this.chromium.launchPersistentContext(profile, {
        ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
        headless: !headed,
        viewport: { width: 1440, height: 900 },
      })
    } catch (e) {
      if (isChromeMissing(e)) throw new Error(CHROME_MISSING)
      throw e
    }
    ctx.on('close', () => { this.context = null; this.viewer = null; this.keyframe = null })
    this.context = ctx
    return ctx
  }

  private async newPage(): Promise<Page> {
    const ctx = await this.ensureContext()
    const taken = [this.viewer, this.keyframe]
    const blank = ctx.pages().find(p => !taken.includes(p) && !p.isClosed() && p.url() === 'about:blank')
    const page = blank ?? await ctx.newPage()
    page.on('dialog', dialogs)
    return page
  }

  private viewerAlive(): boolean {
    return !!this.viewer && !this.viewer.isClosed() && !this.viewerCrashed
  }

  /** The viewer page, opened or reopened as needed; `restarted` when an earlier page was lost. */
  async viewerPage(url?: string): Promise<{ page: Page; restarted: boolean }> {
    const target = url ? allowedUrl(url, 'url') : this.viewerUrl
    const restarted = this.viewerWasOpen && !this.viewerAlive()
    if (!this.viewerAlive()) {
      if (this.viewer && !this.viewer.isClosed()) await this.viewer.close().catch(() => {})
      this.viewer = await this.newPage()
      this.viewerCrashed = false
      this.viewer.on('crash', () => { this.viewerCrashed = true })
      await this.navigateViewer(target)
    } else if ((url && this.viewerUrl !== target) || !this.apiVersion) {
      await this.navigateViewer(target)
    }
    this.checkVersion()
    return { page: this.viewer!, restarted }
  }

  private async navigateViewer(target: string): Promise<void> {
    const page = this.viewer!
    this.viewerUrl = target
    this.apiVersion = ''
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: PAGE_WAIT_MS })
      await page.waitForFunction(() => !!(globalThis as { svp?: unknown }).svp, undefined, { timeout: PAGE_WAIT_MS })
    } catch {
      throw new Error(`Viewer API not available at ${target}`)
    }
    this.apiVersion = String(await page.evaluate(() => (globalThis as unknown as { svp: { version: string } }).svp.version))
    this.viewerWasOpen = true
  }

  private checkVersion(): void {
    if (Number.parseInt(this.apiVersion, 10) !== SUPPORTED_API_MAJOR) {
      throw new Error(`Unsupported viewer API version ${this.apiVersion}; this server supports ${SUPPORTED_API_MAJOR}.x`)
    }
  }

  /** The keyframe.it page with its API ready; every failure reads "keyframe.it is not available: <reason>". */
  async keyframePage(url?: string): Promise<Page> {
    const target = url ? allowedUrl(url, 'url') : this.keyframeUrl
    try {
      if (!this.keyframe || this.keyframe.isClosed()) {
        this.keyframe = await this.newPage()
        this.keyframeLoaded = ''
      }
      if (this.keyframeLoaded !== target) {
        this.keyframeLoaded = ''
        await this.keyframe.goto(target, { waitUntil: 'domcontentloaded', timeout: PAGE_WAIT_MS })
        await this.keyframe.waitForFunction(() => !!(globalThis as { keyframe?: unknown }).keyframe, undefined, { timeout: PAGE_WAIT_MS })
        this.keyframeUrl = this.keyframeLoaded = target
      }
      await callApi(this.keyframe, 'keyframe', 'ready')
    } catch (e) {
      if ((e as Error).message === CHROME_MISSING) throw e
      throw new Error(`keyframe.it is not available: ${(e as Error).message.split('\n')[0]}`)
    }
    return this.keyframe
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {})
  }
}
