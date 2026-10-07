import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { zipSync, strToU8 } from 'fflate'
import { saveSession } from '@/core/utils/fileHistory'
import { createSvpApi, installSvpApi, uninstallSvpApi, type SvpApi, type SvpPage } from '@/core/api/svpApi'
import { SvpError, SVP_ERROR_CODES } from '@/core/api/svpErrors'
import { registerStageCommands, unregisterStageCommands, getStageCommands, type StageCommands } from '@/core/api/stageCommands'
import { useFileLoaderStore } from '@/core/stores/useFileLoaderStore'
import { useSlotSelectionStore } from '@/core/stores/useSlotSelectionStore'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'
import { useAnimationStore } from '@/core/stores/useAnimationStore'
import { useVersionStore } from '@/core/stores/useVersionStore'
import type { BoneEffect, BoneInfo, BoneLocalTransform, BoneTransform } from '@/core/types/ISpineAdapter'
import type { FileSet, SpineSlot } from '@/core/types/FileSet'
import { makeFakeAdapter, withSpine43, track } from '../helpers/fakeAdapter'
import { loadRuntime } from '../fixtures/spine/fixtures'
import { parse } from '../fixtures/spine/roundTrip'

vi.mock('@/core/utils/fileHistory', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/utils/fileHistory')>(),
  saveSession: vi.fn(async () => {}),
}))

const T = (over: Partial<BoneLocalTransform> = {}): BoneLocalTransform =>
  ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, ...over })

const ATLAS = (name: string) => `${name}.png
size: 4,4
format: RGBA8888
filter: Linear,Linear
repeat: none
r
  rotate: false
  xy: 0, 0
  size: 4, 4
  orig: 4, 4
  offset: 0, 0
  index: -1
`
const skeletonJson = (spine: string) =>
  JSON.stringify({ skeleton: { spine }, bones: [{ name: 'root' }, { name: 'arm', parent: 'root' }, { name: 'head', parent: 'root' }], slots: [], skins: [], animations: {} })
const PNG_B64 = btoa(String.fromCharCode(137, 80, 78, 71))

/** API file entries of one set: JSON + atlas as text, the page as base64. */
const entries = (name: string, spine: string, opts: { atlas?: boolean } = {}) => [
  { name: `${name}.json`, text: skeletonJson(spine) },
  ...(opts.atlas === false ? [] : [{ name: `${name}.atlas`, text: ATLAS(name) }]),
  { name: `${name}.png`, base64: `data:image/png;base64,${PNG_B64}` },
]

const FILESET: FileSet = {
  skeleton: { filename: 'hero.json', fileBody: skeletonJson('4.2.40'), type: 'skeleton-json', mimeType: 'application/json' },
  atlas:    { filename: 'hero.atlas', fileBody: ATLAS('hero'), type: 'atlas', mimeType: 'text/plain' },
  images:   [],
}

function makeAdapter() {
  const a = makeFakeAdapter([track(0, 'idle', 0.25)])
  const world: BoneTransform[] = [
    { name: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearY: 0 },
    { name: 'arm', x: 5, y: 0, rotation: 40, scaleX: 1, scaleY: 1, shearY: 12 },
  ]
  const bones: BoneInfo[] = [{ name: 'root', parent: null }, { name: 'arm', parent: 'root' }, { name: 'head', parent: 'root' }]
  return Object.assign(a, {
    bones,
    skins: ['default', 'hat'],
    slots: [{ name: 'body', bone: 'root', blendMode: 1 }],
    events: [{ name: 'step', intValue: 0, floatValue: 0, stringValue: '' }],
    getAnimationDuration: vi.fn(() => 2),
    getBoneTransforms: vi.fn(() => world),
    getBoneSetupTransform: vi.fn(() => T()),
    // arm: animated rotation 10, an IK constraint bends it to 25
    getBoneLocalTransforms: vi.fn(() => bones.map(b => {
      const held = a.overrides[b.name] ?? {}
      const local = T(b.name === 'arm' ? { rotation: 10, ...held } : held)
      return { name: b.name, local, applied: b.name === 'arm' ? { ...local, rotation: 25 } : local }
    })),
    getBoneEffects: vi.fn((): BoneEffect[] => [
      { name: 'root', visible: true, reason: null, keyed: false, constraints: [] },
      { name: 'arm', visible: true, reason: null, keyed: true, constraints: ['arm-ik'] },
      { name: 'head', visible: false, reason: 'no-attachments', keyed: true, constraints: [] },
    ]),
    clearTrack: vi.fn(), clearTracks: vi.fn(), setTrackLoop: vi.fn(), setToSetupPose: vi.fn(),
  })
}

function makeStage(busy = ref(false)) {
  const frame = { canvas: { toDataURL: () => 'data:image/png;base64,AAAA' }, scale: 1 }
  return {
    busy,
    setAnimation: vi.fn(), addAnimation: vi.fn(), setTrackLoop: vi.fn(), setTrackMixOptions: vi.fn(),
    clearTrack: vi.fn(), clearTracks: vi.fn(), seekTo: vi.fn(), setSkins: vi.fn(),
    captureCurrentFrame: vi.fn(async () => frame as unknown as { canvas: HTMLCanvasElement; scale: number } | null),
    getBoneTransformsSnapshot: vi.fn(() => [{ name: 'root', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1, shearY: 0 }]),
    isBusy: () => busy.value,
    lastError: vi.fn((): string | null => null),
    reloadSlot: vi.fn<(id: string) => Promise<void>>(async () => {}),
  }
}

const slot = (id: string, extra: Partial<SpineSlot> = {}): SpineSlot => ({ id, name: id, fileSet: FILESET, ...extra })

async function rejection(p: Promise<unknown>): Promise<SvpError> {
  try { await p } catch (e) { return e as SvpError }
  throw new Error('expected a rejection')
}

let page: ReturnType<typeof ref<SvpPage>>
let deps: { currentPage: () => SvpPage; openViewer: Mock<() => void>; openPicker: Mock<() => void> }
let svp: SvpApi

function setup(start: SvpPage = 'picker') {
  page = ref<SvpPage>(start)
  deps = {
    currentPage: () => page.value!,
    openViewer: vi.fn(() => { page.value = 'viewer' }),
    openPicker: vi.fn(() => { page.value = 'picker' }),
  }
  svp = createSvpApi(deps)
}

/** Viewer with slots hero (valid, active) + broken, a fake adapter attached and a fake stage registered. */
function viewer() {
  setup('viewer')
  useVersionStore().selectVersion(8, '4.2')
  useFileLoaderStore().setSlots([slot('hero'), slot('broken', { fileSet: undefined, error: 'Missing atlas file (.atlas)' })], '4.2')
  const adapter = makeAdapter()
  useSkeletonStore().attachAdapter(adapter)
  const stage = makeStage()
  registerStageCommands(stage as unknown as StageCommands)
  return { adapter, stage }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(saveSession).mockClear()
})
afterEach(() => {
  const c = getStageCommands()
  if (c) unregisterStageCommands(c)
})

describe('SvpError', () => {
  it('every code prefixes the message and survives as a field', () => {
    for (const code of SVP_ERROR_CODES) {
      const e = new SvpError(code, 'why', { n: 1 })
      expect(e).toBeInstanceOf(Error)
      expect(e.name).toBe('SvpError')
      expect(e.code).toBe(code)
      expect(e.message.startsWith(code + ': ')).toBe(true)
      expect(e.details).toEqual({ n: 1 })
    }
  })
})

describe('svp object, info and help', () => {
  it('has a frozen 1.1.0 version and help lists every method exactly once', async () => {
    setup()
    expect(svp.version).toBe('1.1.0')
    expect(Object.isFrozen(svp)).toBe(true)
    const help = await svp.help() as Array<{ name: string; args: string; returns: string; description: string }>
    const names = help.map(h => h.name)
    expect(names).toEqual(Object.keys(svp).filter(k => k !== 'version'))
    expect(new Set(names).size).toBe(40)
    for (const h of help) expect(typeof h.args === 'string' && typeof h.returns === 'string' && h.description.length > 0).toBe(true)
  })

  it('info on the picker and in the viewer', async () => {
    setup()
    expect(await svp.info()).toEqual({
      apiVersion: '1.1.0', appVersion: __APP_VERSION__, page: 'picker', runtime: null, slotCount: 0, activeSlotId: null,
    })
    viewer()
    expect(await svp.info()).toMatchObject({ page: 'viewer', runtime: { pixi: 8, spine: '4.2' }, slotCount: 2, activeSlotId: 'hero' })
  })

  it('install keeps one window.svp across page changes; uninstall removes it', async () => {
    const p = ref<SvpPage>('picker')
    const api = installSvpApi({ currentPage: () => p.value, openViewer: () => { p.value = 'viewer' }, openPicker: () => { p.value = 'picker' } })
    const kept = window.svp
    expect(kept).toBe(api)
    p.value = 'viewer'
    p.value = 'picker'
    expect(window.svp).toBe(kept)
    expect(await kept!.info()).toMatchObject({ page: 'picker' })
    uninstallSvpApi()
    expect(window.svp).toBeUndefined()
  })
})

describe('serial execution and errors', () => {
  it('a read issued without awaiting the write sees it', async () => {
    viewer()
    const write = svp.setBoneOverride({ bone: 'arm', rotation: 45 })
    const read = svp.getBones(['arm'])
    await write
    const [arm] = await read as Array<{ local: BoneLocalTransform; override: unknown }>
    expect(arm.local.rotation).toBe(45)
    expect(arm.override).toEqual({ rotation: 45 })
  })

  it('a rejected call does not block the next one', async () => {
    viewer()
    const bad = svp.getBones(['nope'])
    const next = svp.getOverrides()
    const e = await rejection(bad)
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toMatch(/^NOT_FOUND: .*nope/)
    expect(await next).toEqual({})
  })

  it('wraps unexpected errors into SvpError', async () => {
    const { stage } = viewer()
    stage.captureCurrentFrame.mockRejectedValueOnce(new Error('GPU lost'))
    const e = await rejection(svp.capturePng())
    expect([e.name, e.code, e.message]).toEqual(['SvpError', 'EXPORT_FAILED', 'EXPORT_FAILED: GPU lost'])
  })
})

describe('page gating', () => {
  it('picker: bone reads need the viewer', async () => {
    setup()
    expect((await rejection(svp.getBones())).code).toBe('NOT_IN_VIEWER')
    expect((await rejection(svp.listSlots())).code).toBe('NOT_IN_VIEWER')
  })

  it('compare: everything but info and help is rejected', async () => {
    setup('compare')
    const help = await svp.help() as Array<{ name: string }>
    for (const { name } of help) {
      if (name === 'info' || name === 'help') continue
      expect((await rejection(svp[name]())).code, name).toBe('NOT_IN_VIEWER')
    }
    expect(await svp.info()).toMatchObject({ page: 'compare' })
    expect(deps.openViewer).not.toHaveBeenCalled()
  })

  it('viewer without a valid active skeleton: NO_SKELETON', async () => {
    setup('viewer')
    useFileLoaderStore().setSlots([slot('broken', { fileSet: undefined, error: 'x' })], '4.2')
    expect((await rejection(svp.getSkeleton())).code).toBe('NO_SKELETON')
    expect(await svp.listSlots()).toHaveLength(1)
  })

})

describe('load and reset', () => {
  it('picker: text + base64 load opens the viewer with one valid slot', async () => {
    setup()
    const res = await svp.load(entries('hero', '4.2.40'))
    expect(res).toMatchObject({ slots: [{ name: 'hero', spineVersion: '4.2', format: 'json', valid: true, errors: [] }], ignored: 0 })
    expect(deps.openViewer).toHaveBeenCalledTimes(1)
    expect([useVersionStore().pixiVersion, useVersionStore().spineVersion]).toEqual([8, '4.2'])
    expect(saveSession).toHaveBeenCalledWith(['hero.json', 'hero.atlas', 'hero.png'], undefined)
    const png = useFileLoaderStore().spineSlots[0].fileSet!.images[0]
    expect(png.fileBody).toMatch(/^data:image\/png;base64,/)
  })

  it('picker: a zip is unpacked and extra files ignored', async () => {
    setup()
    const zip = zipSync({
      'hero.json': strToU8(skeletonJson('4.2.40')), 'hero.atlas': strToU8(ATLAS('hero')),
      'hero.png': new Uint8Array([137, 80, 78, 71]), 'test.html': strToU8('<html>'),
    })
    const res = await svp.load([{ name: 'export.zip', base64: btoa(String.fromCharCode(...zip)) }]) as { slots: unknown[] }
    expect(res.slots).toHaveLength(1)
  })

  it('missing atlas: LOAD_FAILED with the drop-zone message, stays on the picker', async () => {
    setup()
    const e = await rejection(svp.load(entries('hero', '4.2.40', { atlas: false })))
    expect(e.code).toBe('LOAD_FAILED')
    expect(e.message).toBe('LOAD_FAILED: Missing atlas file (.atlas)')
    expect(deps.openViewer).not.toHaveBeenCalled()
  })

  it('validates entries before touching the session', async () => {
    const { adapter } = viewer()
    for (const bad of [[], [{ name: 'a.json' }], [{ name: 'a.json', text: 'x', base64: 'eA==' }], [{ name: 'a.png', base64: '%%%' }]]) {
      expect((await rejection(svp.load(bad, { mode: 'replace', discardEdits: true }))).code).toBe('INVALID_ARGUMENT')
    }
    expect((await rejection(svp.load(entries('x', '4.2.40'), { mode: 'merge' }))).code).toBe('INVALID_ARGUMENT')
    expect(useFileLoaderStore().spineSlots).toHaveLength(2)
    expect(useSkeletonStore().getAdapter()).toBe(adapter)
  })

  it('viewer add: a set of the other Pixi version becomes an error row', async () => {
    setup('viewer')
    useVersionStore().selectVersion(7, '4.1')
    useFileLoaderStore().setSlots([slot('old')], '4.1')
    const res = await svp.load(entries('hero', '4.2.40')) as { slots: Array<{ valid: boolean; errors: string[] }> }
    expect(res.slots[0].valid).toBe(false)
    expect(res.slots[0].errors[0]).toMatch(/^Spine version mismatch/)
    expect(useFileLoaderStore().spineSlots).toHaveLength(2)
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('viewer add with activate selects the first new set once it loaded', async () => {
    const { stage } = viewer()
    const sel = useSlotSelectionStore()
    const stop = watchSwitch(sel, stage.busy)
    const res = await svp.load(entries('cat', '4.2.40'), { activate: true }) as { slots: Array<{ id: string }> }
    expect(sel.activeSlotId).toBe(res.slots[0].id)
    expect(stage.busy.value).toBe(false)
    expect(saveSession).toHaveBeenCalledTimes(1)
    stop()
  })

  it('replace and reset refuse to drop held overrides unless discardEdits', async () => {
    viewer()
    await svp.setBoneOverride({ bone: 'arm', rotation: 5 })
    expect((await rejection(svp.load(entries('cat', '4.2.40'), { mode: 'replace' }))).code).toBe('UNSAVED_EDITS')
    expect((await rejection(svp.reset())).code).toBe('UNSAVED_EDITS')
    expect(useFileLoaderStore().spineSlots.map(s => s.id)).toEqual(['hero', 'broken'])
    expect(page.value).toBe('viewer')
    // a replace that cannot load keeps the session
    expect((await rejection(svp.load(entries('cat', '4.2.40', { atlas: false }), { mode: 'replace', discardEdits: true }))).code).toBe('LOAD_FAILED')
    expect(useFileLoaderStore().spineSlots).toHaveLength(2)

    const res = await svp.load(entries('cat', '4.2.40'), { mode: 'replace', discardEdits: true }) as { slots: Array<{ name: string }> }
    expect(deps.openPicker).toHaveBeenCalledTimes(1)
    expect(deps.openViewer).toHaveBeenCalledTimes(1)
    expect(res.slots.map(s => s.name)).toEqual(['cat'])
    expect(useFileLoaderStore().spineSlots.map(s => s.name)).toEqual(['cat'])
  })

  it('overrides parked in another slot also count as unsaved work', async () => {
    viewer()
    useFileLoaderStore().saveSlotState('broken', { boneOverrides: { arm: { x: 1 } } } as never)
    expect((await rejection(svp.reset())).code).toBe('UNSAVED_EDITS')
  })

  it('forced reset shows the picker with an empty session; reset on the picker does nothing', async () => {
    viewer()
    await svp.setBoneOverride({ bone: 'arm', x: 1 })
    await svp.reset({ discardEdits: true })
    expect(page.value).toBe('picker')
    expect(useFileLoaderStore().spineSlots).toEqual([])
    expect(useSkeletonStore().getAdapter()).toBeNull()
    await svp.reset()
    expect(deps.openPicker).toHaveBeenCalledTimes(1)
  })
})

/** Simulates the stage: a slot switch sets the loading flag in a watcher and clears it a little later. */
function watchSwitch(sel: ReturnType<typeof useSlotSelectionStore>, busy: { value: boolean }) {
  return watch(() => sel.activeSlotId, () => {
    busy.value = true
    setTimeout(() => { busy.value = false }, 20)
  })
}

describe('slots', () => {
  it('listSlots reports list order, active, pinned and errors', async () => {
    viewer()
    useSlotSelectionStore().setPinned('hero', true)
    expect(await svp.listSlots()).toEqual([
      { id: 'hero', name: 'hero', spineVersion: '4.2', format: 'json', valid: true, errors: [], active: true, pinned: true, parentId: null, edited: false, unsaved: false },
      { id: 'broken', name: 'broken', spineVersion: null, format: null, valid: false, errors: ['Missing atlas file (.atlas)'], active: false, pinned: false, parentId: null, edited: false, unsaved: false },
    ])
  })

  it('selectSlot: unknown NOT_FOUND, error slot INVALID_STATE, valid one resolves after loading', async () => {
    const { stage } = viewer()
    const loader = useFileLoaderStore()
    loader.addSlot(slot('cat'))
    const sel = useSlotSelectionStore()
    expect((await rejection(svp.selectSlot('nope'))).code).toBe('NOT_FOUND')
    expect((await rejection(svp.selectSlot('broken'))).code).toBe('INVALID_STATE')
    expect(sel.activeSlotId).toBe('hero')
    const stop = watchSwitch(sel, stage.busy)
    const rec = await svp.selectSlot('cat')
    expect(stage.busy.value).toBe(false)
    expect(rec).toMatchObject({ id: 'cat', active: true })
    stop()
  })
})

describe('skeleton, playback and skins', () => {
  it('getSkeleton reports bones, slots, animations with durations, skins and events', async () => {
    viewer()
    const sk = await svp.getSkeleton() as Record<string, unknown>
    expect(sk).toMatchObject({
      slotId: 'hero', name: 'hero', spineVersion: '4.2', format: 'json',
      bones: [{ name: 'root', parent: null }, { name: 'arm', parent: 'root' }, { name: 'head', parent: 'root' }],
      slots: [{ name: 'body', bone: 'root', blend: 'additive' }],
      skins: ['default', 'hat'], events: ['step'], edited: false, unsaved: false,
    })
    expect((sk.animations as unknown[])[0]).toEqual({ name: 'idle', duration: 2 })
  })

  it('range and name checks reject before the stage is touched', async () => {
    const { stage } = viewer()
    const codes = async (p: Promise<unknown>) => (await rejection(p)).code
    expect(await codes(svp.setAnimation({ track: 12, animation: 'idle' }))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.setAnimation({ track: 1.5, animation: 'idle' }))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.setAnimation({ animation: 'nope' }))).toBe('NOT_FOUND')
    expect(await codes(svp.seek({ track: 0, time: -1 }))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.seek({ track: 3, time: 1 }))).toBe('NOT_FOUND')
    expect(await codes(svp.setSpeed(3.5))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.setTrackOptions({ mixDuration: -1 }))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.setTrackOptions({ additive: true }))).toBe('UNSUPPORTED')
    expect(await codes(svp.setSkins([]))).toBe('INVALID_ARGUMENT')
    expect(await codes(svp.setSkins(['default', 'cape']))).toBe('NOT_FOUND')
    for (const fn of [stage.setAnimation, stage.seekTo, stage.setTrackMixOptions, stage.setSkins]) expect(fn).not.toHaveBeenCalled()
  })

  it('drives the stage and the animation store like the Anim tab', async () => {
    const { stage } = viewer()
    const anim = useAnimationStore()
    await svp.setAnimation({ animation: 'run' })
    await svp.addAnimation({ track: 1, animation: 'idle', loop: false })
    await svp.seek({ track: 0, time: 0.5 })
    await svp.setTrackOptions({ track: 0, loop: false, mixDuration: 0.2 })
    await svp.clearTrack({ track: 1 })
    await svp.clearTracks()
    await svp.setSpeed(2)
    await svp.play()
    expect(anim.isPlaying).toBe(true)
    await svp.pause()
    expect([anim.isPlaying, anim.isPaused, anim.speed, anim.selectedAnimation]).toEqual([false, true, 2, 'run'])
    expect(stage.setAnimation).toHaveBeenCalledWith(0, 'run', true)
    expect(stage.addAnimation).toHaveBeenCalledWith(1, 'idle', false)
    expect(stage.seekTo).toHaveBeenCalledWith(0, 0.5)
    expect(stage.setTrackLoop).toHaveBeenCalledWith(0, false)
    expect(stage.setTrackMixOptions).toHaveBeenCalledWith(0, { mixDuration: 0.2 })
    expect(stage.clearTrack).toHaveBeenCalledWith(1)
    expect(stage.clearTracks).toHaveBeenCalled()
    expect(await svp.getTracks()).toEqual([
      { track: 0, animation: 'idle', time: 0.25, duration: 2, loop: true, timeScale: 1, mixDuration: 0, queue: [] },
    ])
  })

  it('4.3 mix options pass through; an unknown interpolation is rejected', async () => {
    const { adapter, stage } = viewer()
    withSpine43(adapter)
    await svp.setTrackOptions({ track: 2, additive: true, mixInterpolation: 'smooth' })
    expect(stage.setTrackMixOptions).toHaveBeenCalledWith(2, { additive: true, mixInterpolation: 'smooth' })
    expect((await rejection(svp.setTrackOptions({ mixInterpolation: 'wobble' }))).code).toBe('INVALID_ARGUMENT')
  })

  it('setSkins composes and getSkins reports', async () => {
    const { stage } = viewer()
    await svp.setSkins(['default', 'hat'])
    expect(stage.setSkins).toHaveBeenCalledWith(['default', 'hat'])
    expect(useSkeletonStore().composerMode).toBe(true)
    expect(await svp.getSkins()).toEqual({ available: ['default', 'hat'], applied: ['default', 'hat'] })
  })
})

describe('bones and overrides', () => {
  it('local vs applied on a constrained bone, world with shear, setup and override', async () => {
    viewer()
    const [arm] = await svp.getBones(['arm']) as Array<Record<string, unknown>>
    expect(arm).toEqual({
      name: 'arm', parent: 'root',
      local: T({ rotation: 10 }), applied: T({ rotation: 25 }),
      world: { x: 5, y: 0, rotation: 40, scaleX: 1, scaleY: 1, shearX: 0, shearY: 12 },
      setup: T(), override: null,
      effect: { visible: true, reason: null, keyed: true, constraints: ['arm-ik'] },
    })
    expect((await svp.getBones() as unknown[]).length).toBe(3)
  })

  it('"Bone without a visible effect": effect is JSON, one getBoneEffects call per read', async () => {
    const { adapter } = viewer()
    adapter.getBoneEffects.mockClear()
    const records = await svp.getBones() as Array<{ name: string; effect: unknown }>
    expect(adapter.getBoneEffects).toHaveBeenCalledTimes(1)
    expect(records.find(r => r.name === 'head')!.effect).toEqual({ visible: false, reason: 'no-attachments', keyed: true, constraints: [] })
    expect(JSON.parse(JSON.stringify(records))).toEqual(records)
    const help = await svp.help() as Array<{ name: string; returns: string }>
    expect(help.find(h => h.name === 'getBones')!.returns).toContain('effect: { visible, reason, keyed, constraints }')
  })

  it('non-finite or unknown properties set nothing', async () => {
    const { adapter } = viewer()
    for (const bad of [{ bone: 'arm', rotation: NaN }, { bone: 'arm', rotation: Infinity }, { bone: 'arm', spin: 1 }, { bone: 'arm' }, { rotation: 1 }]) {
      expect((await rejection(svp.setBoneOverride(bad))).code).toBe('INVALID_ARGUMENT')
    }
    expect((await rejection(svp.setBoneOverride({ bone: 'nope', x: 1 }))).code).toBe('NOT_FOUND')
    expect(adapter.setBoneOverride).not.toHaveBeenCalled()
    expect(await svp.getOverrides()).toEqual({})
  })

  it('applyPose is all or nothing', async () => {
    const { adapter } = viewer()
    const e = await rejection(svp.applyPose({ bones: { arm: { rotation: 45 }, nope: { x: 1 } } }))
    expect(e.code).toBe('NOT_FOUND')
    expect((await rejection(svp.applyPose({ bones: { arm: { rotation: 45 }, head: { x: 'a' } } }))).code).toBe('INVALID_ARGUMENT')
    expect(adapter.setBoneOverride).not.toHaveBeenCalled()
    expect(await svp.applyPose({ bones: { arm: { rotation: 45 }, head: { x: 3, y: -2 } } }))
      .toEqual({ arm: { rotation: 45 }, head: { x: 3, y: -2 } })
    expect(useSkeletonStore().boneOverrides).toEqual({ arm: { rotation: 45 }, head: { x: 3, y: -2 } })
  })

  it('releaseOverride releases properties of given bones, or everything', async () => {
    viewer()
    await svp.applyPose({ bones: { arm: { rotation: 45, x: 2 }, head: { y: 1 } } })
    expect(await svp.releaseOverride({ bones: ['arm'], properties: ['rotation'] })).toEqual({ arm: { x: 2 }, head: { y: 1 } })
    expect((await rejection(svp.releaseOverride({ properties: ['spin'] }))).code).toBe('INVALID_ARGUMENT')
    expect((await rejection(svp.releaseOverride({ bones: ['nope'] }))).code).toBe('NOT_FOUND')
    expect(await svp.releaseOverride()).toEqual({})
  })
})

describe('capture', () => {
  it('capturePng returns a PNG artifact; no frame is EXPORT_FAILED "Nothing to capture"', async () => {
    const { stage } = viewer()
    expect(await svp.capturePng()).toEqual({
      artifact: { name: 'spine-frame.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
    })
    stage.captureCurrentFrame.mockResolvedValueOnce(null)
    const e = await rejection(svp.capturePng())
    expect([e.code, e.message]).toEqual(['EXPORT_FAILED', 'EXPORT_FAILED: Nothing to capture'])
  })

  it('getPose is the Export tab JSON', async () => {
    viewer()
    const pose = await svp.getPose() as { bones: unknown[]; timestamp: number }
    expect(pose.bones).toEqual([{ name: 'root', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1, shearY: 0 }])
    expect(typeof pose.timestamp).toBe('number')
    await nextTick()
  })
})

describe('setup pose, undo, revert and export (5.11)', () => {
  const heroDoc = () => JSON.parse(useFileLoaderStore().spineSlots.find(s => s.id === 'hero')!.fileSet!.skeleton.fileBody as string)
  const heroBone = (name: string) => heroDoc().bones.find((b: { name: string }) => b.name === name)
  const slotRec = async (id: string) => (await svp.listSlots() as Array<{ id: string; edited: boolean; unsaved: boolean }>).find(s => s.id === id)

  it('"Explicit setup value": one reload, bone records back, slot edited and unsaved', async () => {
    const { stage } = viewer()
    const res = await svp.setSetupPose({ bones: { arm: { rotation: 20 } } }) as Array<{ name: string; effect: { constraints: string[] } }>
    expect(res.map(r => r.name)).toEqual(['arm'])
    expect(res[0].effect.constraints).toEqual(['arm-ik'])
    expect(heroBone('arm').rotation).toBe(20)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(await slotRec('hero')).toMatchObject({ edited: true, unsaved: true })
    expect(await svp.getSkeleton()).toMatchObject({ edited: true, unsaved: true })
  })

  it('setSetupPose validates before any change', async () => {
    const { stage } = viewer()
    expect((await rejection(svp.setSetupPose({ bones: { arm: { rotation: 1 }, nope: { x: 1 } } }))).code).toBe('NOT_FOUND')
    expect((await rejection(svp.setSetupPose({ bones: { arm: { rotation: NaN } } }))).code).toBe('INVALID_ARGUMENT')
    expect((await rejection(svp.setSetupPose({ bones: {} }))).code).toBe('INVALID_ARGUMENT')
    expect(stage.reloadSlot).not.toHaveBeenCalled()
    expect(await slotRec('hero')).toMatchObject({ edited: false })
  })

  it('"Overrides to setup pose" and "Bake the animated pose"', async () => {
    viewer()
    await svp.setBoneOverride({ bone: 'head', rotation: 45 })
    await svp.applyOverridesToSetupPose()
    expect(heroBone('head').rotation).toBe(45)
    expect(await svp.getOverrides()).toEqual({})
    // arm is animated at local rotation 10 without an override
    const res = await svp.applyOverridesToSetupPose({ bones: ['arm'] }) as Array<{ name: string }>
    expect(res.map(r => r.name)).toEqual(['arm'])
    expect(heroBone('arm').rotation).toBe(10)
    expect((await rejection(svp.applyOverridesToSetupPose({ bones: ['nope'] }))).code).toBe('NOT_FOUND')
  })

  it('"Undo a key" analogue: undo, canRedo, redo; nothing to undo is INVALID_STATE', async () => {
    viewer()
    expect((await rejection(svp.undo())).code).toBe('INVALID_STATE')
    await svp.setSetupPose({ bones: { arm: { x: 3 } } })
    expect(await svp.undo()).toMatchObject({ edited: false, canUndo: false, canRedo: true })
    expect(heroBone('arm')?.x).toBeUndefined()
    expect(await svp.redo()).toMatchObject({ edited: true, unsaved: true, canRedo: false })
    expect(heroBone('arm').x).toBe(3)
    expect((await rejection(svp.redo())).code).toBe('INVALID_STATE')
    expect(await svp.getEditState()).toEqual({ edited: true, unsaved: true, overrides: 0, warnings: [], canUndo: true, canRedo: false })
  })

  it('"Revert the active skeleton" keeps it undoable; a non-active slot is reverted by id', async () => {
    const { stage } = viewer()
    await svp.setSetupPose({ bones: { arm: { x: 3 } } })
    await svp.revertToSource()
    expect(await slotRec('hero')).toMatchObject({ edited: false, unsaved: false })
    expect(await svp.getEditState()).toMatchObject({ canUndo: true })

    const loader = useFileLoaderStore()
    loader.addSlot(slot('cat'))
    const cat = loader.spineSlots.find(s => s.id === 'cat')!
    cat.edit = { source: cat.fileSet!.skeleton, unsaved: true, warnings: [], undo: [], redo: [] }
    cat.fileSet = { ...cat.fileSet!, skeleton: { ...cat.fileSet!.skeleton, fileBody: '{"edited":1}' } }
    expect(await slotRec('cat')).toMatchObject({ edited: true, unsaved: true })
    stage.reloadSlot.mockClear()
    await svp.revertToSource({ slotId: 'cat' })
    expect(stage.reloadSlot).toHaveBeenCalledWith('cat')
    expect(await slotRec('cat')).toMatchObject({ edited: false, unsaved: false })
    expect((await rejection(svp.revertToSource({ slotId: 'nope' }))).code).toBe('NOT_FOUND')
    expect((await rejection(svp.revertToSource({ slotId: 'broken' }))).code).toBe('INVALID_STATE')
  })

  it('"Export zip" and "JSON export also saves"', async () => {
    viewer()
    await svp.setSetupPose({ bones: { arm: { x: 3 } } })
    const zip = await svp.exportSkeleton({ format: 'zip' }) as { artifact: { name: string; mimeType: string; dataUrl: string }; warnings: string[] }
    expect(zip.artifact).toMatchObject({ name: 'hero.zip', mimeType: 'application/zip' })
    expect(zip.artifact.dataUrl).toMatch(/^data:application\/zip;base64,/)
    expect(zip.warnings).toEqual([])
    expect(await slotRec('hero')).toMatchObject({ edited: true, unsaved: false })

    await svp.setSetupPose({ bones: { arm: { x: 4 } } })
    const json = await svp.exportSkeleton({ format: 'json' }) as { artifact: { name: string; mimeType: string; dataUrl: string } }
    expect(json.artifact).toMatchObject({ name: 'hero.json', mimeType: 'application/json' })
    const text = atob(json.artifact.dataUrl.split(',')[1])
    expect(JSON.parse(text).bones[1].x).toBe(4)
    expect(await slotRec('hero')).toMatchObject({ unsaved: false })
    expect((await rejection(svp.exportSkeleton({ format: 'rar' }))).code).toBe('INVALID_ARGUMENT')
  })

  it('an unedited JSON export is the source text', async () => {
    viewer()
    const json = await svp.exportSkeleton({ format: 'json' }) as { artifact: { dataUrl: string } }
    expect(atob(json.artifact.dataUrl.split(',')[1])).toBe(FILESET.skeleton.fileBody)
    expect(await slotRec('hero')).toMatchObject({ edited: false })
  })

  it('a failing export is EXPORT_FAILED', async () => {
    viewer()
    const loader = useFileLoaderStore()
    const hero = loader.spineSlots.find(s => s.id === 'hero')!
    hero.fileSet = { ...hero.fileSet!, skeleton: { filename: 'hero.skel', fileBody: new ArrayBuffer(4), type: 'skeleton-skel', mimeType: '' } }
    vi.mocked(useSkeletonStore().getAdapter()!.toSpineJson).mockImplementationOnce(() => { throw new Error('not implemented yet') })
    const e = await rejection(svp.exportSkeleton({ format: 'zip' }))
    expect(e.code).toBe('EXPORT_FAILED')
    expect(e.message).toBe('EXPORT_FAILED: not implemented yet')
  })

  it('"Replace with unsaved work" / "Reset with unsaved edits" name the skeleton', async () => {
    viewer()
    await svp.setSetupPose({ bones: { arm: { x: 3 } } })
    const e = await rejection(svp.reset())
    expect(e.code).toBe('UNSAVED_EDITS')
    expect(e.message).toContain('hero (edits)')
    expect((await rejection(svp.load(entries('cat', '4.2.40'), { mode: 'replace' }))).code).toBe('UNSAVED_EDITS')
    await svp.exportSkeleton({ format: 'zip' })
    await svp.reset()
    expect(page.value).toBe('picker')
  })

  it('a picker load reports sets beyond the slot limit as ignored', async () => {
    setup()
    const files = Array.from({ length: 31 }, (_, i) => entries(`s${i}`, '4.2.40')).flat()
    const res = await svp.load(files) as { slots: unknown[]; ignored: number }
    expect(res.slots).toHaveLength(30)
    expect(res.ignored).toBe(1)
  })
})

describe('keyframes through the API (7.8)', () => {
  const hero = () => useFileLoaderStore().spineSlots.find(s => s.id === 'hero')!
  const heroDoc = () => JSON.parse(hero().fileSet!.skeleton.fileBody as string)

  /** Viewer whose reload parses the edited JSON with the real runtime, so animations and durations follow it. */
  async function keyViewer(spine = '4.2.40', doc?: object) {
    const v = viewer()
    if (doc || spine !== '4.2.40') {
      const fileBody = doc ? JSON.stringify(doc) : skeletonJson(spine)
      hero().fileSet = { ...FILESET, skeleton: { ...FILESET.skeleton, fileBody } }
    }
    const mod = await loadRuntime(spine.startsWith('3.') ? '3.8' : '4.2')
    v.stage.reloadSlot.mockImplementation(async () => {
      const data = parse(mod, hero().fileSet!.skeleton.fileBody as string)
      v.adapter.animations = data.animations.map((a: { name: string }) => a.name)
      v.adapter.getAnimationDuration.mockImplementation(((n: string) => data.findAnimation(n)?.duration ?? null) as never)
    })
    return v
  }

  it('"Create a key", getKeys and getSkeleton durations', async () => {
    const { stage } = await keyViewer()
    expect(await svp.createAnimation({ name: 'wave' })).toEqual({ name: 'wave', duration: 0 })
    const tl = await svp.setKey({ animation: 'wave', bone: 'arm', type: 'rotate', time: 0.5, value: { rotation: 30 }, easing: 'stepped' })
    expect(tl).toEqual({ bone: 'arm', type: 'rotate', keys: [{ time: 0.5, value: { rotation: 30 }, easing: 'stepped' }] })
    expect(await svp.getKeys({ animation: 'wave' })).toEqual([tl])
    expect((await svp.getSkeleton() as { animations: unknown[] }).animations).toContainEqual({ name: 'wave', duration: 0.5 })
    expect(await svp.setKeyEasing({ animation: 'wave', bone: 'arm', type: 'rotate', time: 0.5, easing: 'linear' }))
      .toMatchObject({ keys: [{ easing: 'linear' }] })
    expect(await svp.deleteKey({ animation: 'wave', bone: 'arm', type: 'rotate', time: 0.5 })).toEqual({ bone: 'arm', type: 'rotate', keys: [] })
    expect(stage.reloadSlot).toHaveBeenCalledTimes(4)
    expect((await rejection(svp.createAnimation({ name: 'wave' }))).code).toBe('INVALID_ARGUMENT')
    expect((await rejection(svp.getKeys({ animation: 'nope' }))).code).toBe('NOT_FOUND')
  })

  it('"Delete a missing key" and "Bad bezier" change nothing', async () => {
    const { stage } = await keyViewer()
    await svp.buildAnimation({ name: 'wave', keys: [{ bone: 'arm', type: 'rotate', time: 0, value: { rotation: 1 } }] })
    const text = hero().fileSet!.skeleton.fileBody
    expect((await rejection(svp.deleteKey({ animation: 'wave', bone: 'arm', type: 'rotate', time: 0.3 }))).code).toBe('NOT_FOUND')
    const bad = { animation: 'wave', bone: 'arm', type: 'rotate', time: 0, easing: [1.5, 0, 0.5, 1] }
    expect((await rejection(svp.setKeyEasing(bad))).code).toBe('INVALID_ARGUMENT')
    expect((await rejection(svp.setKey({ animation: 'wave', bone: 'nope', type: 'rotate', time: 0, value: { rotation: 1 } }))).code).toBe('NOT_FOUND')
    expect(hero().fileSet!.skeleton.fileBody).toBe(text)
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
  })

  it('"Separate-axis key on 3.8" is UNSUPPORTED', async () => {
    const { stage } = await keyViewer('3.8.99')
    await svp.createAnimation({ name: 'wave' })
    const err = await rejection(svp.setKey({ animation: 'wave', bone: 'arm', type: 'translatex', time: 0, value: { x: 1 } }))
    expect(err.code).toBe('UNSUPPORTED')
    expect(heroDoc().animations.wave).toEqual({})
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
  })

  it('"Build a new animation": one reload, duration 0.5, one rotate timeline', async () => {
    const { stage } = await keyViewer()
    const res = await svp.buildAnimation({ name: 'nod', keys: [
      { bone: 'head', type: 'rotate', time: 0, value: { rotation: 0 } },
      { bone: 'head', type: 'rotate', time: 0.5, value: { rotation: -15 }, easing: [0.25, 0, 0.75, 1] },
    ] })
    expect(res).toEqual({ name: 'nod', duration: 0.5, timelines: [{ bone: 'head', type: 'rotate', keys: [
      { time: 0, value: { rotation: 0 }, easing: 'linear' },
      { time: 0.5, value: { rotation: -15 }, easing: [0.25, 0, 0.75, 1] },
    ] }] })
    expect(stage.reloadSlot).toHaveBeenCalledTimes(1)
    expect(await svp.undo()).toMatchObject({ edited: false, canRedo: true })
  })

  it('"Invalid entry" names the zero-based index; the animation is unchanged', async () => {
    const { stage } = await keyViewer()
    const ok = { bone: 'head', type: 'rotate', time: 0, value: { rotation: 0 } }
    const err = await rejection(svp.buildAnimation({ name: 'nod', keys: [ok, ok, { ...ok, bone: 'nope' }, ok, ok] }))
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toContain('keys[2]')
    expect((await rejection(svp.buildAnimation({ name: 'nod', keys: [] }))).code).toBe('INVALID_ARGUMENT')
    expect((await rejection(svp.buildAnimation({ name: 'nod', keys: [ok], replace: 'yes' }))).code).toBe('INVALID_ARGUMENT')
    expect(heroDoc().animations).toEqual({})
    expect(stage.reloadSlot).not.toHaveBeenCalled()
  })

  it('"Replace bone timelines" keeps the attachment timeline', async () => {
    const doc = {
      ...JSON.parse(skeletonJson('4.2.40')),
      slots: [{ name: 'body', bone: 'root' }],
      animations: { wave: { bones: { arm: { rotate: [{ time: 0, value: 5 }] } }, slots: { body: { attachment: [{ time: 0.2, name: null }] } } } },
    }
    await keyViewer('4.2.40', doc)
    const keys = [{ bone: 'arm', type: 'translate', time: 0.1, value: { x: 1, y: 2 } }]
    const res = await svp.buildAnimation({ name: 'wave', replace: true, keys }) as { timelines: Array<{ type: string }> }
    expect(res.timelines.map(t => t.type)).toEqual(['translate'])
    expect(heroDoc().animations.wave.slots).toEqual(doc.animations.wave.slots)
  })

  it('keyCurrentPose keys the override at the playing time and releases it', async () => {
    await keyViewer()
    await svp.createAnimation({ name: 'idle' })
    await svp.setBoneOverride({ bone: 'arm', rotation: 45 })
    expect((await rejection(svp.keyCurrentPose({ animation: 'idle', time: -1 }))).code).toBe('INVALID_ARGUMENT')
    // track 0 plays "idle" at 0.25 s
    expect(await svp.keyCurrentPose({ animation: 'idle' }))
      .toEqual([{ bone: 'arm', type: 'rotate', keys: [{ time: 0.25, value: { rotation: 45 }, easing: 'linear' }] }])
    expect(await svp.getOverrides()).toEqual({})
    expect((await rejection(svp.keyCurrentPose({ animation: 'wave', bones: ['arm'] }))).code).toBe('NOT_FOUND')
  })
})

describe('QA fixes: folders, replace validation, posed records', () => {
  const page = (bytes: number[]) => `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
  const inDir = (path: string, name: string, png: number[]) => [
    { name: `${name}.json`, text: skeletonJson('4.2.40'), path },
    { name: `${name}.atlas`, text: ATLAS('page'), path },
    { name: 'page.png', base64: page(png), path },
  ]

  it('load entries with a path group per directory: same-named pages do not mix', async () => {
    setup()
    const res = await svp.load([...inDir('comp1/FortuneLuck', 'luck', [137, 80, 78, 71, 1]), ...inDir('comp1/MoneyBloom/', 'bloom', [137, 80, 78, 71, 2])]) as { slots: Array<{ valid: boolean }> }
    expect(res.slots.map(s => s.valid)).toEqual([true, true])
    const pages = useFileLoaderStore().spineSlots.map(s => s.fileSet!.images.map(i => i.fileBody))
    expect(pages).toEqual([[page([137, 80, 78, 71, 1])], [page([137, 80, 78, 71, 2])]])
  })

  it('pages in a subfolder (atlas names them with a subpath) join the set above: hero/ + hero/img/', async () => {
    setup()
    const res = await svp.load([
      { name: 'hero.json', text: skeletonJson('4.2.40'), path: 'hero' },
      { name: 'hero.atlas', text: ATLAS('img/hero'), path: 'hero' },
      { name: 'hero.png', base64: page([137, 80, 78, 71]), path: 'hero/img' },
    ]) as { slots: Array<{ valid: boolean }> }
    expect(res.slots.map(s => s.valid)).toEqual([true])
  })

  it('rejects a path that is absolute, uses backslashes or climbs out', async () => {
    setup()
    for (const path of ['/abs', 'C:/x', 'a\\b', '../up', 'a/../../b', 7]) {
      const e = await rejection(svp.load([{ name: 'a.json', text: '{}', path }]))
      expect(e.code).toBe('INVALID_ARGUMENT')
      expect(e.message).toContain('files[0].path')
    }
    const help = await svp.help() as Array<{ name: string; args: string }>
    expect(help.find(h => h.name === 'load')!.args).toContain('path?')
  })

  it('a replace that fails validation keeps the session and reports the picker message', async () => {
    const bad = entries('mkt', '4.2.40').map(e => e.name.endsWith('.atlas') ? { ...e, text: ATLAS('mkt').replace('  size: 4, 4', '  size: 8, 8') } : e)
    setup()
    const onPicker = await rejection(svp.load(bad))
    expect(onPicker.message).toMatch(/^LOAD_FAILED: mkt: .*exceed/)

    setActivePinia(createPinia())
    viewer()
    const e = await rejection(svp.load(bad, { mode: 'replace' }))
    expect(e.code).toBe('LOAD_FAILED')
    expect(e.message).toBe(onPicker.message)
    expect(useFileLoaderStore().spineSlots.map(s => s.id)).toEqual(['hero', 'broken'])
  })

  it('a replace with an unsupported version keeps the session', async () => {
    viewer()
    const e = await rejection(svp.load(entries('cat', '4.4.1'), { mode: 'replace' }))
    expect(e.code).toBe('LOAD_FAILED')
    expect(e.message).toMatch(/Spine 4\.4 is newer/)
    expect(useFileLoaderStore().spineSlots).toHaveLength(2)
  })

  it('setSetupPose and applyOverridesToSetupPose read records once the reloaded skeleton is posed', async () => {
    const { stage } = viewer()
    stage.reloadSlot.mockImplementation(async () => {
      const next = makeAdapter()
      let posed = false
      requestAnimationFrame(() => { posed = true })
      const local = next.getBoneLocalTransforms
      next.getBoneLocalTransforms = vi.fn(() => posed ? local() : local().map(b => ({ ...b, local: T({ scaleX: 0, scaleY: 0 }), applied: T({ scaleX: 0, scaleY: 0 }) })))
      useSkeletonStore().attachAdapter(next)
    })
    const res = await svp.setSetupPose({ bones: { arm: { rotation: 20 } } }) as Array<{ applied: BoneLocalTransform }>
    expect(res[0].applied).toMatchObject({ rotation: 25, scaleX: 1 })
    await svp.setBoneOverride({ bone: 'head', rotation: 45 })
    const baked = await svp.applyOverridesToSetupPose() as Array<{ applied: BoneLocalTransform }>
    expect(baked[0].applied.scaleX).toBe(1)
  })
})
