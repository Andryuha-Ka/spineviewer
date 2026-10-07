/**
 * @file svpErrors.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

export const SVP_ERROR_CODES = [
  'NOT_IN_VIEWER', 'NO_SKELETON', 'NOT_FOUND', 'INVALID_ARGUMENT', 'INVALID_STATE',
  'UNSAVED_EDITS', 'LOAD_FAILED', 'EXPORT_FAILED', 'UNSUPPORTED',
] as const

export type SvpErrorCode = typeof SVP_ERROR_CODES[number]

/** Rejection of every window.svp call; the message starts with "<code>: " so the code survives serialization. */
export class SvpError extends Error {
  readonly code: SvpErrorCode
  readonly details?: unknown

  constructor(code: SvpErrorCode, message: string, details?: unknown) {
    super(`${code}: ${message}`)
    this.name = 'SvpError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}
