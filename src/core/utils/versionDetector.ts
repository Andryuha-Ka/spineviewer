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

/**
 * Scans the first 100 bytes of a binary .skel file for an embedded version
 * string of the form "X.Y.Z" and returns the matching major.minor, or "unknown".
 */
export function detectSpineVersionFromSkel(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 100))
    const text  = new TextDecoder('latin1').decode(bytes)
    const match = text.match(/(\d+\.\d+)\.\d+/)
    if (!match) return 'unknown'

    const majorMinor = match[1]
    return KNOWN_VERSIONS.includes(majorMinor as never) ? majorMinor : `${majorMinor} (unsupported)`
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
