/**
 * @file versionDetector.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { FileSet } from '@/core/types/FileSet'
import { spineOptionsMap, type PixiVersion, type SpineVersion } from '@/core/stores/useVersionStore'

/** Supported Spine major.minor versions */
const KNOWN_VERSIONS = ['3.8', '4.0', '4.1', '4.2'] as const

/** "Spine X.Y is newer/older than the supported runtimes (...)" for an unsupported version, else null. */
export function unsupportedVersionHint(detected: string): string | null {
  const match = detected.match(/^(\d+)\.(\d+) \(unsupported\)$/)
  if (!match) return null
  const [major, minor] = [Number(match[1]), Number(match[2])]
  const relation = major > 4 || (major === 4 && minor > 2) ? 'newer' : 'older'
  return `Spine ${match[1]}.${match[2]} is ${relation} than the supported runtimes (${KNOWN_VERSIONS.join(', ')})`
}

/**
 * Reads the `skeleton.spine` field from a Spine JSON string and returns the
 * matching supported version, or "unknown" if missing/unsupported.
 */
export function detectSpineVersion(jsonText: string): string {
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>
    const skeleton = data?.skeleton as Record<string, unknown> | undefined
    const raw = typeof skeleton?.spine === 'string' ? skeleton.spine : ''

    const match = raw.match(/^(\d+\.\d+)/)
    if (!match) return 'unknown'

    const majorMinor = match[1]
    return KNOWN_VERSIONS.includes(majorMinor as never) ? majorMinor : `${majorMinor} (unsupported)`
  } catch {
    return 'unknown'
  }
}

/** Spine binary string: varint (length + 1, 0 = null) followed by the bytes; null when out of range. */
function readString(bytes: Uint8Array, offset: number): { text: string; next: number } | null {
  let value = 0
  let pos = offset
  for (let shift = 0; shift < 35; shift += 7) {
    if (pos >= bytes.length) return null
    const b = bytes[pos++]
    value |= (b & 0x7f) << shift
    if (!(b & 0x80)) break
    if (shift === 28) return null
  }
  if (value === 0) return { text: '', next: pos }
  const end = pos + value - 1
  if (value < 0 || end > bytes.length) return null
  return { text: new TextDecoder('latin1').decode(bytes.subarray(pos, end)), next: end }
}

/**
 * Reads the header version string of a binary .skel file — after the 8-byte hash (4.x)
 * or after the length-prefixed hash string (3.8) — and returns its major.minor, or "unknown".
 */
export function detectSpineVersionFromSkel(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer)
    const hash38 = readString(bytes, 0)
    const candidates = [readString(bytes, 8), hash38 && readString(bytes, hash38.next)]
    for (const candidate of candidates) {
      const match = candidate?.text.match(/^(\d+\.\d+)\.\d+/)
      if (!match) continue
      const majorMinor = match[1]
      return KNOWN_VERSIONS.includes(majorMinor as never) ? majorMinor : `${majorMinor} (unsupported)`
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Returns true if the detected version runs on the same Pixi major as the user's selection.
 * Unknown version is always considered compatible (give it a chance to load).
 */
export function isCompatible(detected: string, selected: string): boolean {
  if (detected === 'unknown') return true
  return Object.values(spineOptionsMap).some(list =>
    list.includes(detected as SpineVersion) && list.includes(selected as SpineVersion))
}

export function detectFileSetVersion(fileSet: FileSet): string {
  const { type, fileBody } = fileSet.skeleton
  return type === 'skeleton-json'
    ? detectSpineVersion(fileBody as string)
    : detectSpineVersionFromSkel(fileBody as ArrayBuffer)
}

/** The set's own Spine version when the Pixi version has a runtime for it, else the selected one. */
export function runtimeSpineVersion(fileSet: FileSet, pixi: PixiVersion, selected: SpineVersion): SpineVersion {
  const own = detectFileSetVersion(fileSet) as SpineVersion
  return spineOptionsMap[pixi].includes(own) ? own : selected
}

/** Mismatch message when the file set's skeleton cannot be loaded by the session's Pixi version, else null. */
export function spineVersionProblem(fileSet: FileSet, sessionVersion: string): string | null {
  const detected = detectFileSetVersion(fileSet)
  if (isCompatible(detected, sessionVersion)) return null
  return `Spine version mismatch: ${fileSet.skeleton.filename} is ${detected}, viewer is set to ${sessionVersion}`
}
