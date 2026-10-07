/**
 * @file svpApi.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { nextTick } from 'vue'
import { until } from '@vueuse/core'
import { getStageCommands, type StageCommands } from './stageCommands'
import { SvpError, type SvpErrorCode } from './svpErrors'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useVersionStore, type SpineVersion } from '@/core/stores/useVersionStore'
import { useExportStore } from '@/core/stores/useExportStore'
import { useViewerStore } from '@/core/stores/useViewerStore'
import { useImageLayersStore } from '@/core/stores/useImageLayersStore'
import { useSkeletonEditStore, type KeyInput, type KeyRef } from '@/core/stores/useSkeletonEditStore'
import type { KeyEasing, KeyValue } from '@/core/spineJson/boneEdits'
import { IMAGE_MIME, dirOf, groupSpineFiles } from '@/core/utils/fileLoader'
import { saveSession } from '@/core/utils/fileHistory'
import { validateSpineFileSet } from '@/core/utils/spineValidator'
import { KNOWN_VERSIONS, detectFileSetVersion, runtimeSpineVersion, unsupportedVersionHint } from '@/core/utils/versionDetector'
import { withBackground } from '@/core/utils/exportUtils'
import type { SpineSlot } from '@/core/types/FileSet'
import type { BoneLocalTransform, ISpineAdapter } from '@/core/types/ISpineAdapter'

export const SVP_API_VERSION = '1.0.0'

export type SvpPage = 'picker' | 'viewer' | 'compare'

export interface SvpApiDeps {
  currentPage(): SvpPage
  openViewer(): void
  openPicker(): void
}

export interface SvpMethodInfo { name: string; args: string; returns: string; description: string }

type Json = unknown
export type SvpApi = { readonly version: string } & Record<string, (...args: Json[]) => Promise<Json>>

declare global {
  interface Window { svp?: SvpApi }
}

/** where: 'any' = every page, 'session' = picker + viewer, 'viewer' = viewer only (+ skeleton when `skeleton`) */
interface MethodDef extends SvpMethodInfo {
  where: 'any' | 'session' | 'viewer'
  skeleton?: boolean
  failCode?: SvpErrorCode
  run(...args: Json[]): Json | Promise<Json>
}

const PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const
const BLEND = ['normal', 'additive', 'multiply', 'screen']
const SETTLE_TIMEOUT_MS = 60_000
const UNKNOWN_VERSION = 'Unknown Spine version — pick a runtime on the picker'

const fail = (code: SvpErrorCode, message: string, details?: unknown) => new SvpError(code, message, details)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function options(v: unknown, where: string): Record<string, unknown> {
  if (v === undefined) return {}
  if (!isRecord(v)) throw fail('INVALID_ARGUMENT', `${where} must be an object`)
  return v
}

function optBool(v: unknown, where: string, fallback: boolean): boolean {
  if (v === undefined) return fallback
  if (typeof v !== 'boolean') throw fail('INVALID_ARGUMENT', `${where} must be a boolean`)
  return v
}

function finite(v: unknown, where: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw fail('INVALID_ARGUMENT', `${where} must be a finite number`)
  if (v < min || v > max) throw fail('INVALID_ARGUMENT', `${where} must be within ${min}–${max}, got ${v}`)
  return v
}

function trackArg(v: unknown): number {
  if (v === undefined) return 0
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 11) {
    throw fail('INVALID_ARGUMENT', `track must be an integer from 0 to 11, got ${String(v)}`)
  }
  return v as number
}

function stringList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some(s => typeof s !== 'string')) throw fail('INVALID_ARGUMENT', `${where} must be an array of strings`)
  return v as string[]
}

function transformArg(t: Record<string, unknown>, where: string): Partial<BoneLocalTransform> {
  const out: Partial<BoneLocalTransform> = {}
  for (const [k, v] of Object.entries(t)) {
    if (v === undefined) continue
    if (!(PROPS as readonly string[]).includes(k)) throw fail('INVALID_ARGUMENT', `${where}: unknown property "${k}"`)
    out[k as keyof BoneLocalTransform] = finite(v, `${where}.${k}`)
  }
  if (Object.keys(out).length === 0) throw fail('INVALID_ARGUMENT', `${where} needs at least one of ${PROPS.join(', ')}`)
  return out
}

function decodeBase64(value: string, where: string): { bytes: Uint8Array<ArrayBuffer>; mime: string | null } {
  const m = /^data:([^;,]*)(?:;[^,]*)?,/.exec(value)
  if (m && !value.slice(0, m[0].length).includes(';base64')) throw fail('INVALID_ARGUMENT', `${where} must be a base64 data: URL`)
  try {
    const bin = atob((m ? value.slice(m[0].length) : value).replace(/\s/g, ''))
    return { bytes: Uint8Array.from(bin, c => c.charCodeAt(0)), mime: m?.[1] || null }
  } catch {
    throw fail('INVALID_ARGUMENT', `${where} is not valid base64`)
  }
}

/** Optional entry directory: relative, forward slashes, no `..`; '' or '.' is the root. */
function dirArg(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined
  const bad = () => fail('INVALID_ARGUMENT', `${where} must be a relative directory with forward slashes, without ".."`)
  if (typeof v !== 'string' || v.includes('\\') || v.startsWith('/') || /^[a-z]:/i.test(v)) throw bad()
  const parts = v.split('/').filter(p => p !== '' && p !== '.')
  if (parts.includes('..')) throw bad()
  return parts.join('/')
}

/** `{ name, text | base64, path? }` entries → File objects for the normal loading pipeline. */
function toFiles(files: unknown): File[] {
  if (!Array.isArray(files) || files.length === 0) throw fail('INVALID_ARGUMENT', 'files must be a non-empty array')
  return files.map((f, i) => {
    const where = `files[${i}]`
    if (!isRecord(f) || typeof f.name !== 'string' || f.name === '') throw fail('INVALID_ARGUMENT', `${where}.name must be a non-empty string`)
    const hasText = f.text !== undefined, hasB64 = f.base64 !== undefined
    if (hasText === hasB64) throw fail('INVALID_ARGUMENT', `${where} needs exactly one of text or base64`)
    const dir = dirArg(f.path, `${where}.path`)
    let file: File
    if (hasText) {
      if (typeof f.text !== 'string') throw fail('INVALID_ARGUMENT', `${where}.text must be a string`)
      file = new File([f.text], f.name)
    } else {
      if (typeof f.base64 !== 'string') throw fail('INVALID_ARGUMENT', `${where}.base64 must be a string`)
      const { bytes, mime } = decodeBase64(f.base64, `${where}.base64`)
      const ext = f.name.split('.').pop()!.toLowerCase()
      file = new File([bytes], f.name, { type: IMAGE_MIME[ext] ?? mime ?? '' })
    }
    if (dir !== undefined) dirOf.set(file, dir)
    return file
  })
}

const isValid = (s: SpineSlot) => !s.error && !s.validationErrors?.length
const slotErrors = (s: SpineSlot) => [...(s.error ? [s.error] : []), ...(s.validationErrors ?? [])]

/** The picker's message for a load without a valid set: the first set's errors. */
function noValidSetMessage(slots: SpineSlot[]): string {
  const first = slots.find(s => slotErrors(s).length > 0)
  return first ? `${first.name}: ${slotErrors(first).join('; ')}` : 'No valid Spine files found'
}

/** Resolves on the next rendered frame, so a reloaded skeleton has its first world pose; hidden tabs get no frames. */
function nextFrame(): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 100)
    requestAnimationFrame(() => { clearTimeout(timer); resolve() })
  })
}

function slotRecord(s: SpineSlot) {
  const fs = s.fileSet
  return {
    id: s.id,
    name: s.name,
    spineVersion: fs ? detectFileSetVersion(fs) : null,
    format: fs ? (fs.skeleton.type === 'skeleton-json' ? 'json' : 'skel') : null,
    valid: isValid(s),
    errors: slotErrors(s),
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read the export'))
    reader.readAsDataURL(blob)
  })
}

/** The bare explanation of an error, without an SvpError code prefix. */
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^[A-Z_]+: /, '')

function toSvpError(e: unknown, code: SvpErrorCode): SvpError {
  if (e instanceof SvpError) return e
  return fail(code, e instanceof Error ? e.message : String(e))
}

/** Builds the window.svp object over the stores and the stage command registry. */
export function createSvpApi(deps: SvpApiDeps): SvpApi {
  const loader    = useFileLoaderStore()
  const selection = useSlotSelectionStore()
  const skeleton  = useSkeletonStore()
  const animation = useAnimationStore()
  const version   = useVersionStore()
  const exporter  = useExportStore()
  const viewer    = useViewerStore()
  const layers    = useImageLayersStore()
  const edits     = useSkeletonEditStore()

  function stage(): StageCommands {
    const cmds = getStageCommands()
    if (!cmds) throw fail('INVALID_STATE', 'The stage is not ready')
    return cmds
  }

  function adapter(): ISpineAdapter {
    const a = skeleton.getAdapter()
    if (!a) throw fail('NO_SKELETON', 'No active skeleton')
    return a
  }

  const hasSkeleton = () => !!selection.activeSlot && isValid(selection.activeSlot) && !!skeleton.getAdapter()

  /** Waits for the slot load or switch an earlier step started; the loading flag is set by a watcher, hence nextTick first. */
  async function settle(): Promise<void> {
    await nextTick()
    const cmds = getStageCommands()
    if (!cmds) return
    try {
      await until(() => !cmds.isBusy()).toBe(true, { timeout: SETTLE_TIMEOUT_MS, throwOnTimeout: true })
    } catch {
      throw fail('INVALID_STATE', 'Timed out waiting for the skeleton to load')
    }
  }

  function refuseUnsavedWork(discard: boolean): void {
    if (discard) return
    const lost = edits.unsavedWorkSummary()
    if (lost.length > 0) throw fail('UNSAVED_EDITS', `Unsaved work would be lost: ${lost.join(', ')}; pass discardEdits: true`)
  }

  function findSlot(idOrName: unknown): SpineSlot {
    if (typeof idOrName !== 'string') throw fail('INVALID_ARGUMENT', 'slotId must be a string')
    const slot = loader.spineSlots.find(s => s.id === idOrName) ?? loader.spineSlots.find(s => s.name === idOrName)
    if (!slot) throw fail('NOT_FOUND', `Slot "${idOrName}" not found`)
    return slot
  }

  /** `{ [bone]: partial transform }` with every bone and value checked. */
  function boneMap(v: unknown, a: ISpineAdapter): Record<string, Partial<BoneLocalTransform>> {
    const bones = options(v, 'bones')
    const entries = Object.entries(bones).map(([name, t]) => {
      requireBone(a, name)
      return [name, transformArg(options(t, `bones.${name}`), `bones.${name}`)] as const
    })
    if (entries.length === 0) throw fail('INVALID_ARGUMENT', 'bones must not be empty')
    return Object.fromEntries(entries)
  }

  const editState = () => edits.getEditState(selection.activeSlotId!)

  async function resetSession(): Promise<void> {
    skeleton.clear()
    animation.reset()
    loader.clear()
    exporter.finish()
    deps.openPicker()
    await nextTick()
  }

  function requireBone(a: ISpineAdapter, name: unknown, where = 'bone'): string {
    if (typeof name !== 'string') throw fail('INVALID_ARGUMENT', `${where} must be a string`)
    if (!a.bones.some(b => b.name === name)) throw fail('NOT_FOUND', `Bone "${name}" not found`)
    return name
  }

  function requireAnimation(a: ISpineAdapter, name: unknown): string {
    if (typeof name !== 'string') throw fail('INVALID_ARGUMENT', 'animation must be a string')
    if (!a.animations.includes(name)) throw fail('NOT_FOUND', `Animation "${name}" not found`)
    return name
  }

  const overrides = () => adapter().getBoneOverrides()

  function listSlots() {
    const active = selection.activeSlotId
    const topIds = layers.rows.filter(r => r.kind === 'slot').map(r => r.id)
    const byId = new Map(loader.spineSlots.map(s => [s.id, s]))
    const ordered = [
      ...topIds.map(id => byId.get(id)!).filter(Boolean),
      ...loader.spineSlots.filter(s => s.parentSlotId),
    ]
    return ordered.map(s => ({
      ...slotRecord(s),
      active: s.id === active,
      pinned: selection.isPinned(s.id),
      parentId: s.parentSlotId ?? null,
      edited: edits.isEdited(s.id),
      unsaved: edits.isUnsaved(s.id),
    }))
  }

  function getBones(names?: unknown) {
    const a = adapter()
    const wanted = names === undefined ? a.bones.map(b => b.name) : stringList(names, 'names')
    for (const n of wanted) requireBone(a, n)
    const local = new Map(a.getBoneLocalTransforms().map(b => [b.name, b]))
    const world = new Map(a.getBoneTransforms().map(b => [b.name, b]))
    const held = a.getBoneOverrides()
    const parents = new Map(a.bones.map(b => [b.name, b.parent]))
    return wanted.map(name => {
      const setup = a.getBoneSetupTransform(name)
      const l = local.get(name)
      const w = world.get(name)
      return {
        name,
        parent: parents.get(name) ?? null,
        local: l ? { ...l.local } : setup,
        applied: l ? { ...l.applied } : setup,
        world: w
          ? { x: w.x, y: w.y, rotation: w.rotation, scaleX: w.scaleX, scaleY: w.scaleY, shearX: 0, shearY: w.shearY }
          : null,
        setup,
        override: held[name] ?? null,
      }
    })
  }

  async function freshLoad(files: File[]) {
    const r = await loader.loadFileList(files)
    if (r.error) throw fail('LOAD_FAILED', r.error)
    if (!r.slots.some(isValid)) throw fail('LOAD_FAILED', noValidSetMessage(r.slots))
    if (!version.isReady) throw fail('LOAD_FAILED', r.unsupportedHint ?? UNKNOWN_VERSION)
    const result = { slots: r.slots.map(slotRecord), ignored: r.ignored }
    deps.openViewer()
    await settle()
    const err = getStageCommands()?.lastError()
    if (err) throw fail('LOAD_FAILED', err)
    return result
  }

  async function addLoad(files: File[], activate: boolean) {
    const r = await loader.addFileList(files)
    if (r.error) throw fail('LOAD_FAILED', r.error)
    const first = r.slots.find(isValid)
    if (first) await saveSession(files.map(f => f.name))
    if (activate && first) {
      selection.setActiveSlot(first.id)
      await settle()
    }
    return { slots: r.slots.map(slotRecord), ignored: r.ignored }
  }

  /** A replace must not wipe the session for a load that cannot succeed; same checks and messages as freshLoad. */
  async function precheck(files: File[]): Promise<void> {
    const g = await groupSpineFiles(files)
    if (g.globalError) throw fail('LOAD_FAILED', g.globalError)
    for (const s of g.slots) {
      const errs = s.fileSet && !s.error ? validateSpineFileSet(s.fileSet) : []
      if (errs.length > 0) s.validationErrors = errs
    }
    const first = g.slots.find(isValid)
    if (!first) throw fail('LOAD_FAILED', noValidSetMessage(g.slots))
    const detected = detectFileSetVersion(first.fileSet!)
    if (!KNOWN_VERSIONS.includes(detected as SpineVersion)) throw fail('LOAD_FAILED', unsupportedVersionHint(detected) ?? UNKNOWN_VERSION)
  }

  function setTrackOptions(opts: unknown) {
    const o = options(opts, 'options')
    const a = adapter()
    const track = trackArg(o.track)
    const loop = o.loop === undefined ? undefined : optBool(o.loop, 'loop', true)
    const patch: Record<string, unknown> = {}
    if (o.mixDuration !== undefined) patch.mixDuration = finite(o.mixDuration, 'mixDuration', 0)
    if (o.additive !== undefined) patch.additive = optBool(o.additive, 'additive', false)
    if (o.mixInterpolation !== undefined) {
      if (typeof o.mixInterpolation !== 'string') throw fail('INVALID_ARGUMENT', 'mixInterpolation must be a string')
      patch.mixInterpolation = o.mixInterpolation
    }
    if (loop === undefined && Object.keys(patch).length === 0) {
      throw fail('INVALID_ARGUMENT', 'setTrackOptions needs one of loop, mixDuration, additive, mixInterpolation')
    }
    if ((patch.additive !== undefined || patch.mixInterpolation !== undefined) && !a.mixInterpolations) {
      throw fail('UNSUPPORTED', 'additive and mixInterpolation need Spine 4.3')
    }
    if (patch.mixInterpolation !== undefined && !a.mixInterpolations!.includes(patch.mixInterpolation as string)) {
      throw fail('INVALID_ARGUMENT', `mixInterpolation must be one of ${a.mixInterpolations!.join(', ')}`)
    }
    const cmds = stage()
    if (loop !== undefined) cmds.setTrackLoop(track, loop)
    if (Object.keys(patch).length > 0) cmds.setTrackMixOptions(track, patch)
  }

  /** Key arguments go to boneEdits as given; it validates every field. */
  const keyArgs = (opts: unknown) => options(opts, 'options') as unknown as KeyRef & { value: KeyValue; easing: KeyEasing }

  const methods: MethodDef[] = [
    {
      name: 'info', where: 'any', args: '', returns: '{ apiVersion, appVersion, page, runtime: { pixi, spine } | null, slotCount, activeSlotId }',
      description: 'Session info',
      run: () => {
        const page = deps.currentPage()
        const { pixiVersion: pixi, spineVersion: selected } = version
        const fs = page === 'viewer' ? selection.activeSlot?.fileSet : undefined
        return {
          apiVersion: SVP_API_VERSION,
          appVersion: __APP_VERSION__,
          page,
          runtime: pixi && selected ? { pixi, spine: fs ? runtimeSpineVersion(fs, pixi, selected) : selected } : null,
          slotCount: loader.spineSlots.length,
          activeSlotId: page === 'viewer' ? selection.activeSlotId : null,
        }
      },
    },
    {
      name: 'help', where: 'any', args: '', returns: '[{ name, args, returns, description }]',
      description: 'This method list',
      run: () => methods.map(({ name, args, returns, description }) => ({ name, args, returns, description })),
    },
    {
      name: 'load', where: 'session', failCode: 'LOAD_FAILED',
      args: 'files: [{ name, text } | { name, base64 } (+ path?: relative directory)],{ mode?: "add" | "replace", activate?, discardEdits? }',
      returns: '{ slots: [{ id, name, spineVersion, format, valid, errors }], ignored }',
      description: 'Load skeleton sets (zip included); on the picker opens the viewer',
      run: async (files, opts) => {
        const o = options(opts, 'options')
        const mode = o.mode ?? 'add'
        if (mode !== 'add' && mode !== 'replace') throw fail('INVALID_ARGUMENT', 'mode must be "add" or "replace"')
        const activate = optBool(o.activate, 'activate', false)
        const discard = optBool(o.discardEdits, 'discardEdits', false)
        const list = toFiles(files)
        if (deps.currentPage() === 'viewer') {
          if (mode === 'add') return addLoad(list, activate)
          refuseUnsavedWork(discard)
          await precheck(list)
          await resetSession()
        }
        return freshLoad(list)
      },
    },
    {
      name: 'reset', where: 'session', args: '{ discardEdits? }', returns: 'undefined',
      description: 'Discard the session and show the picker',
      run: async (opts) => {
        const discard = optBool(options(opts, 'options').discardEdits, 'discardEdits', false)
        if (deps.currentPage() !== 'viewer') return undefined
        refuseUnsavedWork(discard)
        await resetSession()
        return undefined
      },
    },
    {
      name: 'listSlots', where: 'viewer', args: '',
      returns: '[{ id, name, spineVersion, format, valid, errors, active, pinned, parentId, edited, unsaved }]',
      description: 'Skeleton slots: top-level in list order, then child spines',
      run: listSlots,
    },
    {
      name: 'selectSlot', where: 'viewer', args: 'idOrName: string', returns: 'slot record (as listSlots)',
      description: 'Make a skeleton active; resolves once it is loaded',
      run: async (id) => {
        const slot = findSlot(id)
        if (!isValid(slot)) throw fail('INVALID_STATE', `Slot "${slot.name}" has errors: ${slotErrors(slot).join('; ')}`)
        if (selection.activeSlotId !== slot.id) {
          selection.setActiveSlot(slot.id)
          await settle()
        }
        return listSlots().find(s => s.id === slot.id)
      },
    },
    {
      name: 'getSkeleton', where: 'viewer', skeleton: true, args: '',
      returns: '{ slotId, name, spineVersion, format, bones: [{ name, parent }], slots: [{ name, bone, blend }], animations: [{ name, duration }], skins, events, edited, unsaved }',
      description: 'Active skeleton metadata',
      run: () => {
        const a = adapter()
        const rec = slotRecord(selection.activeSlot!)
        return {
          slotId: rec.id, name: rec.name, spineVersion: rec.spineVersion, format: rec.format,
          bones: a.bones.map(b => ({ name: b.name, parent: b.parent })),
          slots: a.slots.map(s => ({ name: s.name, bone: s.bone, blend: BLEND[s.blendMode] ?? 'normal' })),
          animations: a.animations.map(name => ({ name, duration: a.getAnimationDuration(name) ?? 0 })),
          skins: [...a.skins],
          events: a.events.map(e => e.name),
          edited: edits.isEdited(rec.id),
          unsaved: edits.isUnsaved(rec.id),
        }
      },
    },
    {
      name: 'setAnimation', where: 'viewer', skeleton: true, args: '{ track?: 0–11, animation, loop?: true }', returns: 'undefined',
      description: 'Replace a track\'s animation',
      run: (opts) => {
        const o = options(opts, 'options')
        const track = trackArg(o.track)
        const name = requireAnimation(adapter(), o.animation)
        const loop = optBool(o.loop, 'loop', true)
        stage().setAnimation(track, name, loop)
        if (track === animation.currentTrack) animation.selectedAnimation = name
        return undefined
      },
    },
    {
      name: 'addAnimation', where: 'viewer', skeleton: true, args: '{ track?: 0–11, animation, loop?: true }', returns: 'undefined',
      description: 'Queue an animation on a track',
      run: (opts) => {
        const o = options(opts, 'options')
        const track = trackArg(o.track)
        const name = requireAnimation(adapter(), o.animation)
        stage().addAnimation(track, name, optBool(o.loop, 'loop', true))
        return undefined
      },
    },
    {
      name: 'clearTrack', where: 'viewer', skeleton: true, args: '{ track?: 0–11 }', returns: 'undefined',
      description: 'Clear one track',
      run: (opts) => { stage().clearTrack(trackArg(options(opts, 'options').track)); return undefined },
    },
    {
      name: 'clearTracks', where: 'viewer', skeleton: true, args: '', returns: 'undefined',
      description: 'Clear every track (setup pose)',
      run: () => { stage().clearTracks(); return undefined },
    },
    {
      name: 'seek', where: 'viewer', skeleton: true, args: '{ track?: 0–11, time: seconds }', returns: 'undefined',
      description: 'Move a track to a time',
      run: (opts) => {
        const o = options(opts, 'options')
        const track = trackArg(o.track)
        const time = finite(o.time, 'time', 0)
        if (!adapter().getTrackStates().some(t => t.trackIndex === track)) throw fail('NOT_FOUND', `No animation on track ${track}`)
        stage().seekTo(track, time)
        return undefined
      },
    },
    {
      name: 'play', where: 'viewer', skeleton: true, args: '', returns: 'undefined',
      description: 'Resume playback',
      run: () => { animation.play(); return undefined },
    },
    {
      name: 'pause', where: 'viewer', skeleton: true, args: '', returns: 'undefined',
      description: 'Pause playback',
      run: () => { animation.pause(); return undefined },
    },
    {
      name: 'setSpeed', where: 'viewer', skeleton: true, args: 'speed: 0–3', returns: 'undefined',
      description: 'Playback speed',
      run: (speed) => { animation.speed = finite(speed, 'speed', 0, 3); return undefined },
    },
    {
      name: 'setTrackOptions', where: 'viewer', skeleton: true,
      args: '{ track?: 0–11, loop?, mixDuration?: seconds, additive? (4.3), mixInterpolation? (4.3) }', returns: 'undefined',
      description: 'Track loop, crossfade and 4.3 mix options',
      run: (opts) => { setTrackOptions(opts); return undefined },
    },
    {
      name: 'getTracks', where: 'viewer', skeleton: true, args: '',
      returns: '[{ track, animation, time, duration, loop, timeScale, mixDuration, queue }]',
      description: 'Running tracks',
      run: () => adapter().getTrackStates().map(t => ({
        track: t.trackIndex, animation: t.animationName, time: t.time, duration: t.duration, loop: t.loop,
        timeScale: t.timeScale, mixDuration: t.mixDuration, queue: t.queue.map(q => q.animationName),
      })),
    },
    {
      name: 'setSkins', where: 'viewer', skeleton: true, args: 'names: string[]', returns: 'undefined',
      description: 'Apply one skin or compose several',
      run: (names) => {
        const list = stringList(names, 'names')
        if (list.length === 0) throw fail('INVALID_ARGUMENT', 'names must not be empty')
        const a = adapter()
        const unknown = list.find(n => !a.skins.includes(n))
        if (unknown !== undefined) throw fail('NOT_FOUND', `Skin "${unknown}" not found`)
        skeleton.activeSkins = [...list]
        skeleton.composerMode = list.length > 1
        stage().setSkins([...list])
        return undefined
      },
    },
    {
      name: 'getSkins', where: 'viewer', skeleton: true, args: '', returns: '{ available, applied }',
      description: 'Skin names',
      run: () => ({ available: [...adapter().skins], applied: [...skeleton.activeSkins] }),
    },
    {
      name: 'getBones', where: 'viewer', skeleton: true, args: 'names?: string[]',
      returns: '[{ name, parent, local, applied, world, setup, override }]',
      description: 'Bone transforms (local, after constraints, world, setup) and overrides',
      run: getBones,
    },
    {
      name: 'setBoneOverride', where: 'viewer', skeleton: true,
      args: '{ bone, x?, y?, rotation?, scaleX?, scaleY?, shearX?, shearY? }', returns: '{ [bone]: partial transform }',
      description: 'Hold local values of one bone over animations',
      run: (opts) => {
        const { bone, ...rest } = options(opts, 'options')
        const name = requireBone(adapter(), bone)
        skeleton.setBoneOverride(name, transformArg(rest, 'setBoneOverride'))
        return overrides()
      },
    },
    {
      name: 'applyPose', where: 'viewer', skeleton: true, args: '{ bones: { [bone]: partial transform } }',
      returns: '{ [bone]: partial transform }',
      description: 'Override several bones at once (all or none)',
      run: (opts) => {
        const bones = boneMap(options(opts, 'options').bones, adapter())
        for (const [name, t] of Object.entries(bones)) skeleton.setBoneOverride(name, t)
        return overrides()
      },
    },
    {
      name: 'releaseOverride', where: 'viewer', skeleton: true, args: '{ bones?: string[], properties?: string[] }',
      returns: '{ [bone]: partial transform }',
      description: 'Release overrides (all bones / all properties when omitted)',
      run: (opts) => {
        const o = options(opts, 'options')
        const a = adapter()
        const bones = o.bones === undefined ? Object.keys(a.getBoneOverrides()) : stringList(o.bones, 'bones')
        bones.forEach(b => requireBone(a, b))
        let props: Array<keyof BoneLocalTransform> | undefined
        if (o.properties !== undefined) {
          props = stringList(o.properties, 'properties') as Array<keyof BoneLocalTransform>
          const bad = props.find(p => !(PROPS as readonly string[]).includes(p))
          if (bad !== undefined || props.length === 0) throw fail('INVALID_ARGUMENT', `properties must be a non-empty subset of ${PROPS.join(', ')}`)
        }
        for (const b of bones) skeleton.releaseBoneOverride(b, props)
        return overrides()
      },
    },
    {
      name: 'getOverrides', where: 'viewer', skeleton: true, args: '', returns: '{ [bone]: partial transform }',
      description: 'Held bone overrides',
      run: overrides,
    },
    {
      name: 'setSetupPose', where: 'viewer', skeleton: true, args: '{ bones: { [bone]: partial transform } }', returns: 'bone records',
      description: 'Write local values into the setup pose (keys stay relative to it); one edit, one reload',
      run: async (opts) => {
        const bones = boneMap(options(opts, 'options').bones, adapter())
        await edits.setSetupPose(bones)
        await nextFrame()
        return getBones(Object.keys(bones))
      },
    },
    {
      name: 'applyOverridesToSetupPose', where: 'viewer', skeleton: true, args: '{ bones?: string[] }', returns: 'bone records',
      description: 'Bake overrides (or the live unconstrained pose of a bone without one) into the setup pose; releases them',
      run: async (opts) => {
        const o = options(opts, 'options')
        const a = adapter()
        const bones = o.bones === undefined ? undefined : stringList(o.bones, 'bones')
        bones?.forEach(b => requireBone(a, b))
        const names = await edits.applyOverridesToSetupPose(bones)
        if (names.length > 0) await nextFrame()
        return getBones(names)
      },
    },
    {
      name: 'createAnimation', where: 'viewer', skeleton: true, args: '{ name }', returns: '{ name, duration }',
      description: 'Create an empty animation',
      run: async (opts) => {
        const name = options(opts, 'options').name as string
        await edits.createAnimation(name)
        return { name, duration: adapter().getAnimationDuration(name) ?? 0 }
      },
    },
    {
      name: 'getKeys', where: 'viewer', skeleton: true, args: '{ animation, bone? }',
      returns: '[{ bone, type, keys: [{ time, value, easing }] }]',
      description: 'Bone timelines of an animation',
      run: (opts) => {
        const o = options(opts, 'options')
        return edits.getKeys(o.animation as string, o.bone as string | undefined)
      },
    },
    {
      name: 'setKey', where: 'viewer', skeleton: true, args: '{ animation, bone, type, time, value, easing? }',
      returns: '{ bone, type, keys }', description: 'Create or update a key',
      run: (opts) => edits.setKey(keyArgs(opts)),
    },
    {
      name: 'deleteKey', where: 'viewer', skeleton: true, args: '{ animation, bone, type, time }',
      returns: '{ bone, type, keys }', description: 'Delete a key',
      run: (opts) => edits.deleteKey(keyArgs(opts)),
    },
    {
      name: 'setKeyEasing', where: 'viewer', skeleton: true, args: '{ animation, bone, type, time, easing }',
      returns: '{ bone, type, keys }', description: 'Change a key\'s easing',
      run: (opts) => edits.setKeyEasing(keyArgs(opts)),
    },
    {
      name: 'keyCurrentPose', where: 'viewer', skeleton: true, args: '{ animation, bones?, time? }',
      returns: '[{ bone, type, keys }]', description: 'Key the live pose',
      run: (opts) => {
        const o = options(opts, 'options')
        const bones = o.bones === undefined ? undefined : stringList(o.bones, 'bones')
        const time = o.time === undefined ? undefined : finite(o.time, 'time', 0)
        return edits.keyCurrentPose(o.animation as string, bones, time)
      },
    },
    {
      name: 'buildAnimation', where: 'viewer', skeleton: true,
      args: '{ name, keys: [{ bone, type, time, value, easing? }], replace? }', returns: '{ name, duration, timelines }',
      description: 'Apply many keys as one edit',
      run: async (opts) => {
        const o = options(opts, 'options')
        const name = o.name as string
        const timelines = await edits.buildAnimation(name, o.keys as KeyInput[], optBool(o.replace, 'replace', false))
        return { name, duration: adapter().getAnimationDuration(name) ?? 0, timelines }
      },
    },
    {
      name: 'undo', where: 'viewer', skeleton: true, args: '', returns: 'edit state',
      description: 'Undo the last data edit',
      run: async () => { await edits.undo(); return editState() },
    },
    {
      name: 'redo', where: 'viewer', skeleton: true, args: '', returns: 'edit state',
      description: 'Redo an undone edit',
      run: async () => { await edits.redo(); return editState() },
    },
    {
      name: 'getEditState', where: 'viewer', skeleton: true, args: '',
      returns: '{ edited, unsaved, overrides, warnings, canUndo, canRedo }',
      description: 'Edit state of the active skeleton', run: editState,
    },
    {
      name: 'revertToSource', where: 'viewer', skeleton: true, args: '{ slotId? }', returns: 'undefined',
      description: 'Revert a skeleton (the active one by default) to its source data; undoable, keeps overrides',
      run: async (opts) => {
        const o = options(opts, 'options')
        const slot = o.slotId === undefined ? selection.activeSlot! : findSlot(o.slotId)
        if (!isValid(slot)) throw fail('INVALID_STATE', `Slot "${slot.name}" has errors: ${slotErrors(slot).join('; ')}`)
        await edits.revertToSource(slot.id)
        return undefined
      },
    },
    {
      name: 'capturePng', where: 'viewer', skeleton: true, failCode: 'EXPORT_FAILED', args: '',
      returns: '{ artifact: { name, mimeType, dataUrl } }',
      description: 'Current frame as PNG (Export tab scale and background)',
      run: async () => {
        const frame = await stage().captureCurrentFrame({ scale: exporter.scale })
        if (!frame) throw fail('EXPORT_FAILED', 'Nothing to capture')
        const canvas = exporter.includeBackground ? withBackground(frame.canvas, viewer.bgColor) : frame.canvas
        return { artifact: { name: 'spine-frame.png', mimeType: 'image/png', dataUrl: canvas.toDataURL('image/png') } }
      },
    },
    {
      name: 'getPose', where: 'viewer', skeleton: true, failCode: 'EXPORT_FAILED', args: '',
      returns: '{ bones: [{ name, x, y, rotation, scaleX, scaleY, shearY }], timestamp }',
      description: 'World pose, as the Export tab JSON',
      run: () => ({ bones: stage().getBoneTransformsSnapshot().map(b => ({ ...b })), timestamp: Date.now() }),
    },
    {
      name: 'exportSkeleton', where: 'viewer', skeleton: true, failCode: 'EXPORT_FAILED', args: '{ format: "zip" | "json" }',
      returns: '{ artifact: { name, mimeType, dataUrl }, warnings }',
      description: 'Edited skeleton as zip (JSON + atlas + pages) or Spine JSON alone; counts as saving',
      run: async (opts) => {
        const format = options(opts, 'options').format
        if (format !== 'zip' && format !== 'json') throw fail('INVALID_ARGUMENT', 'format must be "zip" or "json"')
        try {
          const res = await edits.exportSkeleton(selection.activeSlotId!, format)
          return { artifact: { name: res.name, mimeType: res.mimeType, dataUrl: await blobToDataUrl(res.blob) }, warnings: res.warnings }
        } catch (e) {
          throw fail('EXPORT_FAILED', reason(e))
        }
      },
    },
  ]

  function gate(m: MethodDef): void {
    const page = deps.currentPage()
    if (m.where === 'session' && page === 'compare') throw fail('NOT_IN_VIEWER', `${m.name}() is not available on the compare page`)
    if (m.where === 'viewer' && page !== 'viewer') throw fail('NOT_IN_VIEWER', `${m.name}() needs the viewer page`)
    if (m.skeleton && !hasSkeleton()) throw fail('NO_SKELETON', 'No active skeleton')
  }

  // one chain for every call: a call starts after all earlier ones settled
  let tail: Promise<unknown> = Promise.resolve()
  function call(m: MethodDef, args: Json[]): Promise<Json> {
    const p = tail.then(async () => {
      try {
        gate(m)
        const result = await m.run(...args)
        await nextTick()
        return result
      } catch (e) {
        throw toSvpError(e, m.failCode ?? 'INVALID_STATE')
      }
    })
    tail = p.catch(() => {})
    return p
  }

  const api: Record<string, unknown> = { version: SVP_API_VERSION }
  for (const m of methods) api[m.name] = (...args: Json[]) => call(m, args)
  return Object.freeze(api) as SvpApi
}

export function installSvpApi(deps: SvpApiDeps): SvpApi {
  const api = createSvpApi(deps)
  Object.defineProperty(window, 'svp', { value: api, configurable: true, enumerable: true, writable: false })
  return api
}

export function uninstallSvpApi(): void {
  delete window.svp
}
