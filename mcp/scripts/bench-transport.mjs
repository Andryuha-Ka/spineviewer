// D11 measurement: time svp_load variant A (base64 through page.evaluate) vs B (setInputFiles) on the same files.
// Usage: node scripts/bench-transport.mjs <url> <path>... [--runs 3] [--headed]
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { parseConfig } from '../dist/config.js'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { Session, callApi } from '../dist/session.js'
import { Runner, collectFiles, MB } from '../dist/runner.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { runs: { type: 'string', default: '3' }, headed: { type: 'boolean' } } })
const [url, ...paths] = positionals
if (!url || paths.length === 0) { console.error('usage: bench-transport.mjs <url> <path>... [--runs N] [--headed]'); process.exit(1) }
const files = await collectFiles(paths)
const TEXT_EXT = new Set(['.json', '.atlas', '.txt'])
// Variant A lives only here, for comparison; the server always uses B (runner.loadFiles).
const loadA = async (page, opts) => callApi(page, 'svp', 'load', [await Promise.all(files.map(async f => {
  const bytes = await readFile(f.path)
  const body = TEXT_EXT.has(extname(f.name).toLowerCase()) ? { text: bytes.toString('utf8') } : { base64: bytes.toString('base64') }
  return { name: f.name, ...body, ...(f.dir ? { path: f.dir } : {}) }
})), opts])
console.log(`${files.length} files, ${(files.reduce((n, f) => n + f.size, 0) / MB).toFixed(1)} MB`)

for (const transport of ['A', 'B']) {
  const config = parseConfig(['--url', url, ...(values.headed ? ['--headed'] : [])])
  const session = new Session(chromium, config)
  const runner = new Runner(session)
  const times = []
  try {
    for (let i = 0; i < Number(values.runs); i++) {
      const { page } = await runner.viewer()
      const t0 = performance.now()
      const opts = { mode: 'replace', discardEdits: true }
      await (transport === 'A' ? loadA(page, opts) : runner.loadFiles(page, files, opts))
      times.push(performance.now() - t0)
    }
    console.log(`${transport}: ${times.map(t => `${(t / 1000).toFixed(2)} s`).join(', ')}  median ${(times.sort((a, b) => a - b)[times.length >> 1] / 1000).toFixed(2)} s`)
  } catch (e) {
    console.log(`${transport}: failed: ${e.message}`)
  } finally {
    await session.close()
  }
}
