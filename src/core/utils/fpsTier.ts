/**
 * @file fpsTier.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

const FPS_GOOD = 55
export const FPS_OK   = 30

export type FpsTier = 'good' | 'ok' | 'bad'

export function fpsTier(fps: number): FpsTier {
  return fps >= FPS_GOOD ? 'good' : fps >= FPS_OK ? 'ok' : 'bad'
}
