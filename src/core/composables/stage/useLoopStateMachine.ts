/**
 * @file useLoopStateMachine.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { TrackLoopState } from '@/core/overlay/overlayMath'

const DC_BUCKETS = 300

/**
 * Holds per-track loop state machine and DC sparkline raw sample buffer.
 * Returns plain mutable containers — no Vue reactivity (written every frame).
 */
export function useLoopStateMachine() {
  const loopStates = new Map<number, TrackLoopState>()
  const dcRaw = new Array<number | null>(DC_BUCKETS).fill(null)
  let _lastDcNormPos = -1

  return {
    loopStates,
    dcRaw,
    get lastDcNormPos() { return _lastDcNormPos },
    set lastDcNormPos(v: number) { _lastDcNormPos = v },
  }
}

export type LoopStateMachine =ReturnType<typeof useLoopStateMachine>
