import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, truncateSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { ApiError, Session } from './session.js'
import { Runner, collectFiles, errorContent, freeName, toContent } from './runner.js'
import { FakeChromium, FakePage, fakeSvp, inputGlobals, installGlobals, pageInput, testConfig } from './testFakes.js'

let restore = () => {}
afterEach(() => restore())
const tmp = () => mkdtempSync(join(tmpdir(), 'svp-mcp-t-'))
const zipUrl = (files: Record<string, string>) => `data:application/zip;base64,${Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))).toString('base64')}`

test('calls run one at a time in arrival order', async () => {
  const runner = new Runner(new Session(new FakeChromium(), testConfig()))
  const log: string[] = []
  const slow = runner.run(async () => { await new Promise(r => setTimeout(r, 30)); log.push('apply'); return toContent(1) })
  const fast = runner.run(async () => { log.push('get'); return toContent(2) })
  const failing = runner.run(async () => { throw new Error('boom') })
  const after = runner.run(async () => { log.push('after'); return toContent(3) })
  await Promise.all([slow, fast, failing, after])
  assert.deepEqual(log, ['apply', 'get', 'after'])
  assert.equal((await failing).isError, true)
})

test('API rejection becomes { ok:false, code, error } with isError', async () => {
  restore = installGlobals({ svp: fakeSvp({ getBones: () => { throw Object.assign(new Error('NOT_FOUND: Bone "nope" not found'), { code: 'NOT_FOUND' }) } }).api })
  const runner = new Runner(new Session(new FakeChromium(), testConfig()))
  const res = await runner.run(() => runner.svp('getBones', ['nope']))
  assert.equal(res.isError, true)
  assert.deepEqual(res.structuredContent, { ok: false, code: 'NOT_FOUND', error: 'NOT_FOUND: Bone "nope" not found' })
  assert.deepEqual(JSON.parse((res.content[0] as { text: string }).text), res.structuredContent)
  assert.deepEqual(errorContent(new Error('x')).structuredContent, { ok: false, error: 'x' })
  assert.deepEqual(errorContent(new ApiError('E: m', 'E')).structuredContent, { ok: false, code: 'E', error: 'E: m' })
})

test('unknown svp method is a NOT_FOUND tool error', async () => {
  restore = installGlobals({ svp: fakeSvp().api })
  const runner = new Runner(new Session(new FakeChromium(), testConfig()))
  const res = await runner.run(() => runner.svp('toString'))
  assert.equal((res.structuredContent as { code: string }).code, 'NOT_FOUND')
})

test('result shapes: object, array, undefined, image artifact, restart note', async () => {
  assert.deepEqual(toContent({ a: 1 }).structuredContent, { a: 1 })
  assert.deepEqual(toContent([1, 2]).structuredContent, { result: [1, 2] })
  assert.equal((toContent([1, 2]).content[0] as { text: string }).text, '[1,2]')
  assert.deepEqual(toContent(undefined).structuredContent, { ok: true })
  const img = toContent({ artifact: { name: 'spine-frame.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,QUJD' } })
  assert.deepEqual(img.content[0], { type: 'image', mimeType: 'image/png', data: 'QUJD' })
  const noted = toContent({ a: 1 }, ['restarted'])
  assert.deepEqual(noted.structuredContent, { a: 1, notes: ['restarted'] })
  assert.deepEqual(noted.content[1], { type: 'text', text: 'restarted' })
})

test('files from disk: recursive folders, zips as is, cwd-relative, missing, too large', async () => {
  const dir = tmp()
  mkdirSync(join(dir, 'hero', 'img'), { recursive: true })
  writeFileSync(join(dir, 'hero', 'hero.json'), '{}')
  writeFileSync(join(dir, 'hero', 'hero.atlas'), 'a')
  writeFileSync(join(dir, 'hero', 'img', 'hero.png'), 'p')
  writeFileSync(join(dir, 'pack.zip'), 'z')
  const files = await collectFiles(['hero', join(dir, 'pack.zip')], dir)
  assert.deepEqual(files.map(f => [f.name, f.dir]).sort(), [['hero.atlas', 'hero'], ['hero.json', 'hero'], ['hero.png', 'hero/img'], ['pack.zip', undefined]])
  await assert.rejects(collectFiles(['hero', 'missing.json'], dir), { message: 'File not found: missing.json' })
  const big = join(dir, 'big.png')
  writeFileSync(big, '')
  truncateSync(big, 201 * 1024 * 1024)
  await assert.rejects(collectFiles([big], dir), { message: 'Load too large (201.0 MB, limit 200 MB)' })
})

const b64 = (s: string) => `data:;base64,${Buffer.from(s).toString('base64')}`

test('same-named files in sibling folders keep their directory as path', async () => {
  const dir = tmp()
  for (const game of ['FortuneLuck', 'MoneyBloom']) {
    mkdirSync(join(dir, 'comp1', game), { recursive: true })
    writeFileSync(join(dir, 'comp1', game, 'anim.json'), game)
  }
  writeFileSync(join(dir, 'solo.json'), 'solo')
  const svp = fakeSvp({ load: () => ({ slots: [{ id: 's1', name: 'anim' }], ignored: 0 }) })
  restore = installGlobals({ svp: svp.api, ...inputGlobals })
  const runner = new Runner(new Session(new FakeChromium(), testConfig()))
  const res = await runner.run(() => runner.load([join(dir, 'comp1'), join(dir, 'solo.json')], { activate: true }))
  assert.deepEqual(res.structuredContent, { slots: [{ id: 's1', name: 'anim' }], ignored: 0 })
  assert.deepEqual(svp.calls[0].args, [[
    { name: 'anim.json', base64: b64('FortuneLuck'), path: 'comp1/FortuneLuck' },
    { name: 'anim.json', base64: b64('MoneyBloom'), path: 'comp1/MoneyBloom' },
    { name: 'solo.json', base64: b64('solo') },
  ], { activate: true }])
})

test('missing file fails before the viewer is touched', async () => {
  const chromium = new FakeChromium()
  const runner = new Runner(new Session(chromium, testConfig()))
  const res = await runner.run(() => runner.load(['C:/definitely/missing/hero.json'], {}))
  assert.equal(res.isError, true)
  assert.match((res.structuredContent as { error: string }).error, /^File not found: /)
  assert.equal(chromium.launches.length, 0)
})

test('load: setInputFiles with disk paths, read in the page, input cleared', async () => {
  const dir = tmp()
  writeFileSync(join(dir, 'hero.json'), '{}')
  const svp = fakeSvp({ load: () => ({ slots: [], ignored: 0 }) })
  restore = installGlobals({ svp: svp.api, ...inputGlobals })
  const chromium = new FakeChromium()
  const runner = new Runner(new Session(chromium, testConfig()))
  await runner.run(() => runner.load([dir], { mode: 'add' }))
  const page = chromium.contexts[0].pagesList[0] as FakePage
  assert.deepEqual(page.inputFiles, [join(dir, 'hero.json')])
  assert.deepEqual(svp.calls[0].args, [[{ name: 'hero.json', base64: b64('{}'), path: basename(dir) }], { mode: 'add' }])
  assert.equal(pageInput.value, '')
})

test('names get a numeric suffix instead of overwriting', async () => {
  const dir = tmp()
  assert.equal(await freeName(dir, 'hero.zip'), 'hero.zip')
  writeFileSync(join(dir, 'hero.zip'), '')
  assert.equal(await freeName(dir, 'hero.zip'), 'hero-1.zip')
  mkdirSync(join(dir, 'hero-1'))
  assert.equal(await freeName(dir, 'hero.zip'), 'hero-1.zip')
  assert.equal(await freeName(dir, 'hero.zip', true), 'hero-2.zip')
})

test('export writes zip + unpacked folder, links resources, reads them back', async () => {
  const dataUrl = zipUrl({ 'hero.json': '{}', 'hero.atlas': 'atlas', 'hero.png': 'png' })
  restore = installGlobals({ svp: fakeSvp({ exportSkeleton: () => ({ artifact: { name: 'hero.zip', mimeType: 'application/zip', dataUrl }, warnings: [] }) }).api })
  const config = testConfig()
  const seen: string[] = []
  const runner = new Runner(new Session(new FakeChromium(), config), w => seen.push(w.name))
  const first = await runner.run(() => runner.exportSkeleton('zip', true))
  const paths = (first.structuredContent as { paths: string[] }).paths
  assert.equal(paths[0], join(config.exportDir, 'hero.zip'))
  assert.ok(existsSync(join(config.exportDir, 'hero', 'hero.json')))
  assert.equal(readFileSync(join(config.exportDir, 'hero', 'hero.atlas'), 'utf8'), 'atlas')
  assert.equal(first.content.filter(c => c.type === 'resource_link').length, 4)
  assert.deepEqual(seen.sort(), ['hero.atlas', 'hero.json', 'hero.png', 'hero.zip'])
  const second = await runner.run(() => runner.exportSkeleton('zip', false))
  assert.equal((second.structuredContent as { paths: string[] }).paths[0], join(config.exportDir, 'hero-1.zip'))
  const link = first.content.find(c => c.type === 'resource_link') as { uri: string }
  const read = await runner.readResource(link.uri)
  assert.equal(read.contents[0].mimeType, 'application/zip')
  await assert.rejects(runner.readResource('file:///elsewhere'))
})
