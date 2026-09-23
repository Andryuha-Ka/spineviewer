/**
 * @file check-index.mjs
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 *
 * Compares src/**\/*.{ts,vue} files against kb/module-index.md.
 * Reports missing, extra, and auto-generated files, and `Key exports` names
 * of .ts entries that the file no longer exports.
 * Run: node scripts/check-index.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SRC  = join(ROOT, 'src')
const INDEX_FILE = join(ROOT, 'kb', 'module-index.md')

// Files that are auto-generated and should not be indexed
const AUTO_GENERATED = new Set([
  'src/auto-imports.d.ts',
  'src/components.d.ts',
])

// Collect all .ts/.vue files under src/
function walkSrc(dir, result = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkSrc(full, result)
    } else if (/\.(ts|vue)$/.test(entry)) {
      result.push(full)
    }
  }
  return result
}

// Normalise path to forward-slash relative from ROOT
function norm(absPath) {
  return relative(ROOT, absPath).split(sep).join('/')
}

// Extract all paths mentioned in module-index.md (lines like `### `src/...`)
function extractIndexedPaths(indexContent) {
  const re = /###\s+`(src\/[^`]+)`/g
  const paths = new Set()
  let m
  while ((m = re.exec(indexContent)) !== null) {
    paths.add(m[1])
  }
  return paths
}

// Map of indexed path → names listed in its `**Key exports:**` line (.ts entries only)
function extractKeyExports(indexContent) {
  const result = new Map()
  const re = /###\s+`(src\/[^`]+\.ts)`[^#]*?\*\*Key exports:\*\*([^\n]*)/g
  let m
  while ((m = re.exec(indexContent)) !== null) {
    const names = [...m[2].matchAll(/`([^`]+)`/g)]
      .map(x => x[1].match(/^[A-Za-z_$][\w$]*/)?.[0])
      .filter(Boolean)
    result.set(m[1], names)
  }
  return result
}

// Names a TS module exports (declarations, export lists, default class/function names)
function collectExports(source) {
  const names = new Set()
  const decl = /export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
  for (const m of source.matchAll(decl)) names.add(m[1])
  for (const m of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, '')
      if (name) names.add(name)
    }
  }
  return names
}

// ── main ────────────────────────────────────────────────────────────────────

const indexContent = readFileSync(INDEX_FILE, 'utf8')
const indexed = extractIndexedPaths(indexContent)

const srcFiles = walkSrc(SRC).map(norm)

const missing = []   // in src/, not in index, not auto-generated
const extra   = []   // in index but not in src/ (deleted / renamed)
const autoGen = []   // auto-generated, skipped

for (const f of srcFiles) {
  if (AUTO_GENERATED.has(f))    { autoGen.push(f); continue }
  if (!indexed.has(f))           { missing.push(f) }
}
for (const f of indexed) {
  if (!srcFiles.includes(f))     { extra.push(f) }
}

const staleExports = []   // { file, names } listed in the index but not exported
for (const [file, names] of extractKeyExports(indexContent)) {
  if (!srcFiles.includes(file)) continue
  const exported = collectExports(readFileSync(join(ROOT, file), 'utf8'))
  const stale = names.filter(n => !exported.has(n))
  if (stale.length > 0) staleExports.push({ file, names: stale })
}

// ── report ───────────────────────────────────────────────────────────────────

const ok = missing.length === 0 && extra.length === 0 && staleExports.length === 0

console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║         Spine Viewer Pro — Codebase Index Check      ║')
console.log('╚══════════════════════════════════════════════════════╝\n')
console.log(`  Indexed entries : ${indexed.size}`)
console.log(`  Source files    : ${srcFiles.length}`)
console.log(`  Auto-generated  : ${autoGen.length} (skipped)\n`)

if (ok) {
  console.log('✅  Index is up to date. No action needed.\n')
  process.exit(0)
}

if (missing.length > 0) {
  console.log(`❌  MISSING FROM INDEX (${missing.length} files)`)
  console.log('   Add these entries to kb/module-index.md:\n')
  for (const f of missing) {
    console.log(`   ### \`${f}\``)
    console.log(`   **Purpose:** TODO`)
    console.log(`   **Key exports:** TODO\n`)
  }
}

if (extra.length > 0) {
  console.log(`⚠️   IN INDEX BUT NOT IN SRC (${extra.length} entries)`)
  console.log('   These files may have been renamed or deleted:\n')
  for (const f of extra) {
    console.log(`   - ${f}`)
  }
  console.log()
}

if (staleExports.length > 0) {
  console.log(`⚠️   STALE KEY EXPORTS (${staleExports.length} entries)`)
  console.log('   Listed in kb/module-index.md but not exported by the file:\n')
  for (const { file, names } of staleExports) console.log(`   - ${file}: ${names.join(', ')}`)
  console.log()
}

console.log('📋  Recommendations:')
if (missing.length > 0)
  console.log('   1. Copy the stub entries above into kb/module-index.md and fill in Purpose + Key exports.')
if (extra.length > 0)
  console.log('   2. Remove or update stale entries in kb/module-index.md.')
if (staleExports.length > 0)
  console.log('   3. Fix the Key exports lines listed above.')
console.log('   4. Re-run `npm run check-index` to verify.\n')

process.exit(1)
