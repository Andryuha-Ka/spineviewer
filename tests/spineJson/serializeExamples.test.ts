import { describe, it, expect } from 'vitest'
import { serializeSkeletonData } from '@/core/spineJson/serializeSkeletonData'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { detectSpineVersion, detectSpineVersionFromSkel } from '@/core/utils/versionDetector'
import { FIXTURE_VERSIONS, loadRuntime, type FixtureVersion } from '../fixtures/spine/fixtures'
import { expectRoundTrip, jsonDiff, parse, roundTrip } from '../fixtures/spine/roundTrip'

// local sweep over the owner's real exports; example/ is not in the repository, so CI skips it
const ROOT = path.resolve(__dirname, '../../example')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(json|skel)$/i.test(name) ? [p] : []
  })
}

function load(file: string): { ver: FixtureVersion; input: string | Uint8Array } | null {
  const buf = readFileSync(file)
  const isJson = file.toLowerCase().endsWith('.json')
  const text = isJson ? buf.toString('utf-8') : ''
  const ver = (isJson ? detectSpineVersion(text) : detectSpineVersionFromSkel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
  if (!(FIXTURE_VERSIONS as readonly string[]).includes(ver)) return null
  return { ver: ver as FixtureVersion, input: isJson ? text : new Uint8Array(buf) }
}

describe.skipIf(!existsSync(ROOT))('serialize every example skeleton', () => {
  const files = existsSync(ROOT) ? walk(ROOT) : []

  it.each(files.map(f => [path.relative(ROOT, f), f]))('%s round-trips', async (name, file) => {
    const src = load(file)
    if (!src) return console.warn(`${name}: no runtime for its version, skipped`)
    const mod = await loadRuntime(src.ver)
    let data
    try { data = parse(mod, src.input) } catch (e) {
      return console.warn(`${name}: its own runtime cannot read it (${(e as Error).message}), skipped`)
    }
    const rt = roundTrip(mod, data, src.ver)
    if (rt.warnings.length) console.warn(`${name}:`, rt.warnings)
    expectRoundTrip(mod, rt)
    expect(jsonDiff(serializeSkeletonData(rt.data2, mod, src.ver).json, rt.json).slice(0, 10)).toEqual([])
  }, 120_000)
})
