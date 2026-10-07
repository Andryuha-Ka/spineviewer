import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { CHROME_MISSING, Session } from './session.js'
import { FakeChromium, FakePage, fakeSvp, installGlobals, testConfig } from './testFakes.js'

let restore = () => {}
afterEach(() => restore())

test('lazy launch with channel chrome, headless and 1440×900', async () => {
  const chromium = new FakeChromium()
  const config = testConfig()
  const session = new Session(chromium, config)
  assert.equal(chromium.launches.length, 0)
  restore = installGlobals({ svp: fakeSvp().api })
  const { page, restarted } = await session.viewerPage()
  assert.equal(restarted, false)
  assert.equal(page.url(), config.url)
  assert.deepEqual(chromium.launches[0], { profile: config.profile, opts: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } } })
  await session.viewerPage()
  assert.equal(chromium.launches.length, 1)
})

test('headed and a Chrome path', async () => {
  const chromium = new FakeChromium()
  restore = installGlobals({ svp: fakeSvp().api })
  await new Session(chromium, testConfig({ headed: true, chromePath: 'C:/c/chrome.exe' })).viewerPage()
  assert.deepEqual(chromium.launches[0].opts, { executablePath: 'C:/c/chrome.exe', headless: false, viewport: { width: 1440, height: 900 } })
})

test('viewer API missing times out with the URL', async () => {
  const config = testConfig()
  const session = new Session(new FakeChromium(), config)
  await assert.rejects(session.viewerPage(), { message: `Viewer API not available at ${config.url}` })
})

test('API major mismatch fails every call', async () => {
  restore = installGlobals({ svp: fakeSvp({}, '2.0.0').api })
  const session = new Session(new FakeChromium(), testConfig())
  const msg = 'Unsupported viewer API version 2.0.0; this server supports 1.x'
  await assert.rejects(session.viewerPage(), { message: msg })
  await assert.rejects(session.viewerPage(), { message: msg })
})

test('closed page is reopened and reported as restarted', async () => {
  restore = installGlobals({ svp: fakeSvp().api })
  const session = new Session(new FakeChromium(), testConfig())
  const first = (await session.viewerPage()).page as unknown as FakePage
  first.closed = true
  const again = await session.viewerPage()
  assert.equal(again.restarted, true)
  assert.notEqual(again.page, first)
  assert.equal((await session.viewerPage()).restarted, false)
})

test('crashed page and closed browser are reopened', async () => {
  restore = installGlobals({ svp: fakeSvp().api })
  const chromium = new FakeChromium()
  const session = new Session(chromium, testConfig())
  const first = (await session.viewerPage()).page as unknown as FakePage
  first.emit('crash')
  assert.equal((await session.viewerPage()).restarted, true)
  await chromium.contexts[0].close()
  assert.equal((await session.viewerPage()).restarted, true)
  assert.equal(chromium.launches.length, 2)
})

test('Chrome not installed', async () => {
  const chromium = new FakeChromium()
  chromium.error = new Error('Chromium distribution \'chrome\' is not found at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  const session = new Session(chromium, testConfig())
  await assert.rejects(session.viewerPage(), { message: CHROME_MISSING })
})

test('svp_open URL is validated', async () => {
  const session = new Session(new FakeChromium(), testConfig())
  await assert.rejects(session.viewerPage('http://example.com/'), /url/)
})

test('keyframe.it unreachable', async () => {
  restore = installGlobals({ svp: fakeSvp().api })
  const chromium = new FakeChromium()
  const session = new Session(chromium, testConfig())
  await session.viewerPage()
  const kf = new FakePage()
  kf.gotoError = new Error('net::ERR_NAME_NOT_RESOLVED at https://www.keyframe.it.com/?editor=1\nCall log: ...')
  chromium.contexts[0].nextPage = kf
  await assert.rejects(session.keyframePage(), { message: 'keyframe.it is not available: net::ERR_NAME_NOT_RESOLVED at https://www.keyframe.it.com/?editor=1' })
  assert.equal((await session.viewerPage()).restarted, false)
})

test('keyframe.it page waits for the API and calls ready()', async () => {
  let ready = 0
  restore = installGlobals({ keyframe: { ready: async () => { ready++; return { ok: true } } } })
  const chromium = new FakeChromium()
  const session = new Session(chromium, testConfig())
  const page = await session.keyframePage()
  assert.equal(page.url(), 'https://www.keyframe.it.com/?editor=1')
  await session.keyframePage()
  assert.equal(ready, 2)
  await session.close()
  assert.equal(chromium.contexts[0].closed, true)
})
