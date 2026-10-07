import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_KEYFRAME_URL, DEFAULT_URL, allowedUrl, parseConfig } from './config.js'

test('defaults', () => {
  const c = parseConfig([], {})
  assert.equal(c.url, DEFAULT_URL)
  assert.equal(c.headed, false)
  assert.equal(c.profile, join(homedir(), '.svp-mcp', 'profile'))
  assert.equal(c.exportDir, join(homedir(), '.svp-mcp', 'exports'))
  assert.equal(c.keyframeUrl, DEFAULT_KEYFRAME_URL)
})

test('environment variables', () => {
  const c = parseConfig([], {
    SVP_URL: 'http://localhost:5173/spineviewer/', SVP_HEADED: '1', SVP_PROFILE_DIR: 'p', SVP_EXPORT_DIR: 'e',
    SVP_KEYFRAME_URL: 'http://127.0.0.1:8080/',
  })
  assert.equal(c.url, 'http://localhost:5173/spineviewer/')
  assert.equal(c.headed, true)
  assert.equal(c.profile, resolve('p'))
  assert.equal(c.exportDir, resolve('e'))
  assert.equal(c.keyframeUrl, 'http://127.0.0.1:8080/')
})

test('command-line options win over the environment', () => {
  const c = parseConfig(
    ['--url', 'https://example.org/v/', '--headed', '--profile', 'cli-p', '--export-dir', 'cli-e', '--keyframe-url', 'https://k.example/'],
    { SVP_URL: 'http://localhost:1/', SVP_PROFILE_DIR: 'env-p', SVP_EXPORT_DIR: 'env-e', SVP_KEYFRAME_URL: 'http://localhost:2/' },
  )
  assert.equal(c.url, 'https://example.org/v/')
  assert.equal(c.headed, true)
  assert.equal(c.profile, resolve('cli-p'))
  assert.equal(c.exportDir, resolve('cli-e'))
  assert.equal(c.keyframeUrl, 'https://k.example/')
})

test('rejected URLs name the option', () => {
  assert.throws(() => parseConfig(['--url', 'http://example.com/'], {}), /--url/)
  assert.throws(() => parseConfig(['--keyframe-url', 'ftp://x/'], {}), /--keyframe-url/)
  assert.throws(() => parseConfig([], { SVP_URL: 'http://192.168.0.2/' }), /SVP_URL \(--url\)/)
  assert.throws(() => allowedUrl('not a url', '--url'), /--url/)
  assert.throws(() => allowedUrl('https://u:p@host/', '--url'), /--url/)
  assert.equal(allowedUrl('http://127.0.0.1:5173/x', '--url'), 'http://127.0.0.1:5173/x')
})

test('unknown option is rejected', () => {
  assert.throws(() => parseConfig(['--nope'], {}))
})
