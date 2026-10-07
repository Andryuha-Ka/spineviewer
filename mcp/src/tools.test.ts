import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, strToU8 } from 'fflate'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from './server.js'
import { FakeChromium, FakePage, fakeSvp, inputGlobals, installGlobals, testConfig } from './testFakes.js'
import type { Config } from './config.js'

const SPEC_TOOLS = [
  'svp_open', 'svp_session', 'svp_methods', 'svp_call', 'svp_load', 'svp_reset', 'svp_slots', 'svp_select_slot', 'svp_skeleton',
  'svp_set_animation', 'svp_clear_tracks', 'svp_seek', 'svp_playback', 'svp_track_options', 'svp_tracks', 'svp_set_skins', 'svp_get_skins',
  'svp_get_bones', 'svp_apply_pose', 'svp_release_pose', 'svp_overrides', 'svp_set_setup_pose', 'svp_apply_to_setup_pose',
  'svp_create_animation', 'svp_build_animation', 'svp_get_keys', 'svp_key_bone', 'svp_key_pose', 'svp_delete_key', 'svp_set_key_easing',
  'svp_revert', 'svp_undo', 'svp_redo', 'svp_edit_state', 'svp_capture', 'svp_pose', 'svp_screenshot', 'svp_export',
  'svp_keyframe_open', 'svp_keyframe_call', 'svp_keyframe_to_viewer', 'svp_viewer_to_keyframe',
]

let restore = () => {}
afterEach(() => restore())

async function connect(config: Config = testConfig()) {
  const chromium = new FakeChromium()
  const { server } = createServer(config, chromium)
  const client = new Client({ name: 'test', version: '0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  type Res = { isError?: boolean; structuredContent?: Record<string, unknown>; content: { type: string; [k: string]: unknown }[] }
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<Res>
  return { client, chromium, call, config }
}

test('registered tools equal the spec catalogue; listing launches nothing', async () => {
  const { client, chromium } = await connect()
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map(t => t.name).sort(), [...SPEC_TOOLS].sort())
  for (const t of tools) assert.equal(t.inputSchema.additionalProperties, false, t.name)
  assert.equal(chromium.launches.length, 0)
})

test('unknown property is rejected without a page call', async () => {
  const { call, chromium } = await connect()
  const res = await call('svp_get_bones', { bones: ['a'], extra: 1 })
  assert.equal(res.isError, true)
  assert.match(JSON.stringify(res.content), /validation/i)
  const bad = await call('svp_apply_pose', { bones: { arm: { rotation: 1, spin: 2 } } })
  assert.equal(bad.isError, true)
  const empty = await call('svp_apply_pose', { bones: { arm: {} } })
  assert.equal(empty.isError, true)
  assert.equal(chromium.launches.length, 0)
})

test('tools map to window.svp methods and arguments', async () => {
  const svp = fakeSvp({ getSkins: () => ({ available: ['a'], applied: [] }) })
  restore = installGlobals({ svp: svp.api })
  const { call } = await connect()
  await call('svp_set_animation', { animation: 'walk', queue: true, track: 1 })
  await call('svp_set_animation', { animation: 'run' })
  await call('svp_clear_tracks', {})
  await call('svp_clear_tracks', { track: 2 })
  await call('svp_playback', { playing: false, speed: 2 })
  await call('svp_apply_pose', { bones: { arm: { rotation: 30 } } })
  await call('svp_key_pose', { animation: 'wave', time: 0.5 })
  await call('svp_get_bones', {})
  await call('svp_select_slot', { slotId: 'hero' })
  const skins = await call('svp_call', { method: 'getSkins', args: [] })
  assert.deepEqual(skins.structuredContent, { available: ['a'], applied: [] })
  assert.deepEqual(svp.calls.map(c => [c.method, c.args]), [
    ['addAnimation', [{ animation: 'walk', track: 1 }]],
    ['setAnimation', [{ animation: 'run' }]],
    ['clearTracks', []],
    ['clearTrack', [{ track: 2 }]],
    ['setSpeed', [2]],
    ['pause', []],
    ['applyPose', [{ bones: { arm: { rotation: 30 } } }]],
    ['keyCurrentPose', [{ animation: 'wave', time: 0.5 }]],
    ['getBones', []],
    ['selectSlot', ['hero']],
    ['getSkins', []],
  ])
})

test('svp_load defaults activate to true; svp_capture returns an image', async () => {
  const svp = fakeSvp({ capturePng: () => ({ artifact: { name: 'spine-frame.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,QUJD' } }) })
  restore = installGlobals({ svp: svp.api, ...inputGlobals })
  const { call } = await connect()
  await call('svp_load', { paths: [fileURLToPath(import.meta.url)] })
  assert.deepEqual(svp.calls[0].args[1], { activate: true })
  const img = await call('svp_capture')
  assert.deepEqual(img.content[0], { type: 'image', mimeType: 'image/png', data: 'QUJD' })
  const shot = await call('svp_screenshot')
  assert.equal(shot.content[0].type, 'image')
})

test('API error through a tool', async () => {
  restore = installGlobals({ svp: fakeSvp({ getBones: () => { throw Object.assign(new Error('NOT_FOUND: Bone "x" not found'), { code: 'NOT_FOUND' }) } }).api })
  const { call } = await connect()
  const res = await call('svp_get_bones', { bones: ['x'] })
  assert.equal(res.isError, true)
  assert.deepEqual(res.structuredContent, { ok: false, code: 'NOT_FOUND', error: 'NOT_FOUND: Bone "x" not found' })
})

const heroZip = () => `data:application/zip;base64,${Buffer.from(zipSync({ 'hero.json': strToU8('{}'), 'hero.atlas': strToU8('a'), 'hero.png': strToU8('p') })).toString('base64')}`

test('keyframe.it to viewer: export, write, load with activate', async () => {
  const svp = fakeSvp({ load: () => ({ slots: [{ id: 's9', name: 'rig' }], ignored: 0 }) })
  const kfCalls: unknown[] = []
  restore = installGlobals({
    svp: svp.api,
    ...inputGlobals,
    keyframe: {
      ready: async () => ({ ok: true }),
      exportArtifact: async (o: unknown) => { kfCalls.push(o); return { ok: true, artifact: { name: 'rig-spine.zip', mimeType: 'application/zip', dataUrl: heroZip() } } },
    },
  })
  const { call, config } = await connect()
  const res = await call('svp_keyframe_to_viewer', { version: '3.8' })
  assert.equal(res.isError, undefined)
  assert.deepEqual(kfCalls, [{ format: 'spine', version: '3.8' }])
  assert.equal(res.structuredContent?.zip, join(config.exportDir, 'rig-spine.zip'))
  assert.deepEqual(res.structuredContent?.slots, [{ id: 's9', name: 'rig' }])
  const [entries, opts] = svp.calls[0].args as [{ name: string }[], unknown]
  assert.equal(entries[0].name, 'rig-spine.zip')
  assert.deepEqual(opts, { mode: 'add', activate: true })
})

function keyframeWithImport(page: FakePage) {
  let revision = 1
  page.onFilesChosen = () => { revision++ }
  return { ready: async () => ({ ok: true }), sessionInfo: async () => ({ projectId: 'p', revision }) }
}

async function viewerToKeyframe(behaviour: FakePage['importBehaviour']) {
  const kfPage = new FakePage()
  kfPage.importBehaviour = behaviour
  restore = installGlobals({
    svp: fakeSvp({ exportSkeleton: () => ({ artifact: { name: 'hero.zip', mimeType: 'application/zip', dataUrl: heroZip() }, warnings: [] }) }).api,
    keyframe: keyframeWithImport(kfPage),
  })
  const ctx = await connect()
  await ctx.call('svp_session')
  ctx.chromium.contexts[0].nextPage = kfPage
  return { ...ctx, kfPage, res: await ctx.call('svp_viewer_to_keyframe') }
}

test('viewer to keyframe.it: import through the file chooser', async () => {
  const { res, kfPage, config } = await viewerToKeyframe('chooser')
  assert.equal(res.structuredContent?.imported, true)
  assert.equal(res.structuredContent?.via, 'filechooser')
  assert.deepEqual(kfPage.chosenFiles?.map(p => p.slice(config.exportDir.length + 1)).sort(), [join('hero', 'hero.atlas'), join('hero', 'hero.json'), join('hero', 'hero.png')])
})

test('viewer to keyframe.it: hidden input fallback', async () => {
  const { res } = await viewerToKeyframe('input')
  assert.equal(res.structuredContent?.imported, true)
  assert.equal(res.structuredContent?.via, 'input')
})

test('viewer to keyframe.it: picker missing keeps the export', async () => {
  const { res, config } = await viewerToKeyframe('none')
  assert.equal(res.isError, undefined)
  assert.equal(res.structuredContent?.imported, false)
  assert.match(String(res.structuredContent?.reason), /picker could not be found/)
  assert.match(String(res.structuredContent?.manualStep), /Import Spine/)
  assert.ok(existsSync(join(config.exportDir, 'hero', 'hero.json')))
})

test('keyframe.it unreachable: keyframe tools fail, viewer tools keep working', async () => {
  restore = installGlobals({ svp: fakeSvp({ info: () => ({ apiVersion: '1.0.0' }) }).api })
  const { call, chromium } = await connect()
  await call('svp_session')
  const kf = new FakePage()
  kf.gotoError = new Error('net::ERR_CONNECTION_REFUSED')
  chromium.contexts[0].nextPage = kf
  const res = await call('svp_keyframe_open')
  assert.equal(res.isError, true)
  assert.equal(res.structuredContent?.error, 'keyframe.it is not available: net::ERR_CONNECTION_REFUSED')
  const viewer = await call('svp_session')
  assert.deepEqual(viewer.structuredContent, { apiVersion: '1.0.0' })
})

test('keyframe pass-through call and its error', async () => {
  restore = installGlobals({ keyframe: { ready: async () => ({ ok: true }), getBone: async (n: string) => ({ name: n }), boom: async () => { throw new Error('bad') } } })
  const { call } = await connect()
  assert.deepEqual((await call('svp_keyframe_call', { method: 'getBone', args: ['head'] })).structuredContent, { name: 'head' })
  const err = await call('svp_keyframe_call', { method: 'boom' })
  assert.equal(err.isError, true)
  assert.equal(err.structuredContent?.error, 'bad')
})
