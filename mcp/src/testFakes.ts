/**
 * @file testFakes.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Config } from './config.js'

/** The page's hidden svp input: FakePage.setInputFiles fills it from disk. */
export const pageInput = { files: [] as File[], value: '' }

class FakeReader {
  result: string | null = null
  onload: () => void = () => {}
  onerror: () => void = () => {}
  readAsDataURL(f: File) { void f.arrayBuffer().then(b => { this.result = `data:;base64,${Buffer.from(b).toString('base64')}`; this.onload() }) }
}

/** Page globals for loads through the hidden input; spread into installGlobals. */
export const inputGlobals = { document: { querySelector: () => pageInput }, FileReader: FakeReader }

/** Fake Playwright page: evaluate runs the function in Node against globalThis fakes. */
export class FakePage {
  closed = false
  href = 'about:blank'
  evaluations: any[] = []
  handlers: Record<string, ((...a: any[]) => void)[]> = {}
  gotoError: Error | null = null
  importBehaviour: 'chooser' | 'input' | 'none' = 'none'
  chosenFiles: string[] | null = null
  onFilesChosen: () => void = () => {}

  isClosed() { return this.closed }
  url() { return this.href }
  async goto(u: string) { if (this.gotoError) throw this.gotoError; this.href = u }
  async waitForFunction(fn: () => unknown) { if (!fn()) throw new Error('Timeout 30000ms exceeded.') }
  async evaluate(fn: (a: any) => unknown, arg?: any) { this.evaluations.push(arg); return fn(arg) }
  on(ev: string, h: (...a: any[]) => void) { (this.handlers[ev] ??= []).push(h) }
  off(ev: string, h: (...a: any[]) => void) { this.handlers[ev] = (this.handlers[ev] ?? []).filter(x => x !== h) }
  emit(ev: string, ...a: any[]) { for (const h of this.handlers[ev] ?? []) h(...a) }
  async close() { this.closed = true }
  async screenshot() { return Buffer.from('PNGDATA') }
  private choose(paths: string[]) { this.chosenFiles = paths; this.onFilesChosen() }
  getByText() {
    const page = this
    return { first: () => ({
      isVisible: async () => page.importBehaviour === 'chooser',
      click: async () => { if (page.importBehaviour !== 'chooser') throw new Error('not found') },
    }) }
  }
  getByRole() { return { first: () => ({ click: async () => { throw new Error('Timeout 5000ms exceeded.') } }) } }
  async waitForEvent() {
    if (this.importBehaviour !== 'chooser') throw new Error('Timeout 10000ms exceeded.')
    return { setFiles: async (p: string[]) => this.choose(p) }
  }
  inputFiles: string[] | null = null
  locator(selector: string): any {
    return { first: () => this.locator(selector), setInputFiles: async (p: string[]) => {
      if (selector === 'input[data-svp-api]') {
        this.inputFiles = p
        pageInput.files = p.map(f => new File([readFileSync(f)], basename(f)))
        pageInput.value = 'set'
        return
      }
      if (this.importBehaviour !== 'input') throw new Error('Timeout 5000ms exceeded.')
      this.choose(p)
    } }
  }
}

export class FakeContext {
  pagesList: FakePage[] = [new FakePage()]
  closed = false
  closeHandlers: (() => void)[] = []
  nextPage: FakePage | null = null
  pages() { return this.pagesList }
  async newPage() { const p = this.nextPage ?? new FakePage(); this.nextPage = null; this.pagesList.push(p); return p }
  on(_ev: 'close', h: () => void) { this.closeHandlers.push(h) }
  async close() { this.closed = true; this.closeHandlers.forEach(h => h()) }
}

export class FakeChromium {
  launches: any[] = []
  contexts: FakeContext[] = []
  error: Error | null = null
  async launchPersistentContext(profile: string, opts: any) {
    this.launches.push({ profile, opts })
    if (this.error) throw this.error
    const ctx = new FakeContext()
    this.contexts.push(ctx)
    return ctx as any
  }
}

export function testConfig(over: Partial<Config> = {}): Config {
  const dir = mkdtempSync(join(tmpdir(), 'svp-mcp-'))
  return {
    url: 'http://localhost:5173/spineviewer/', headed: false, profile: join(dir, 'profile'), exportDir: join(dir, 'exports'),
    keyframeUrl: 'https://www.keyframe.it.com/?editor=1', ...over,
  }
}

/** Installs fake window APIs on globalThis; returns a restore function. */
export function installGlobals(globals: Record<string, unknown>): () => void {
  const g = globalThis as any
  const before = Object.fromEntries(Object.keys(globals).map(k => [k, g[k]]))
  Object.assign(g, globals)
  return () => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete g[k]; else g[k] = v } }
}

export class SvpError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`) }
}

/** window.svp fake: methods record calls; `impl` overrides results. */
export function fakeSvp(impl: Record<string, (...a: any[]) => unknown> = {}, version = '1.0.0') {
  const calls: { method: string; args: unknown[] }[] = []
  const names = ['info', 'help', 'load', 'reset', 'listSlots', 'selectSlot', 'getSkeleton', 'setAnimation', 'addAnimation', 'clearTrack',
    'clearTracks', 'seek', 'play', 'pause', 'setSpeed', 'setTrackOptions', 'getTracks', 'setSkins', 'getSkins', 'getBones', 'setBoneOverride',
    'applyPose', 'releaseOverride', 'getOverrides', 'setSetupPose', 'applyOverridesToSetupPose', 'createAnimation', 'getKeys', 'setKey',
    'deleteKey', 'setKeyEasing', 'keyCurrentPose', 'buildAnimation', 'undo', 'redo', 'getEditState', 'revertToSource', 'capturePng', 'getPose', 'exportSkeleton']
  const api: Record<string, unknown> = { version }
  for (const n of names) {
    api[n] = async (...args: unknown[]) => { calls.push({ method: n, args }); return impl[n] ? impl[n](...args) : undefined }
  }
  return { api, calls }
}
