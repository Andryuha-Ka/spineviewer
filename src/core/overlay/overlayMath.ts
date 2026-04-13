/**
 * @file overlayMath.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

// ── Loop State Machine ─────────────────────────────────────────────────────────

export type LoopPhase = 'normal' | 'final-100' | 'zero'

export interface TrackLoopState {
  phase: LoopPhase
  lastNorm: number
}

export function makeLoopState(): TrackLoopState {
  return { phase: 'normal', lastNorm: 0 }
}

/**
 * Computes normalized position (0..1) with wrap-around handling.
 * Mutates state — call once per frame.
 *
 * Loop=true logic:
 *   phase=normal,   detected wrap → display 1.0, phase=final-100
 *   phase=final-100                 display 1.0, phase=zero
 *   phase=zero                      display 0.0, phase=normal
 */
export function computeNorm(
  rawTime: number,
  duration: number,
  loop: boolean,
  state: TrackLoopState,
): number {
  if (duration <= 0) return 0

  const rawNorm = loop
    ? (rawTime % duration) / duration
    : Math.min(rawTime, duration) / duration

  if (!loop) {
    state.phase = 'normal'
    state.lastNorm = rawNorm
    return rawNorm
  }

  // loop = true: state machine
  if (state.phase === 'final-100') {
    state.phase = 'zero'
    state.lastNorm = rawNorm
    return 1.0
  }
  if (state.phase === 'zero') {
    state.phase = 'normal'
    state.lastNorm = rawNorm
    return 0.0
  }
  // normal
  if (state.lastNorm > 0.9 && rawNorm < 0.1) {
    // wrap detected: first frame after looparound → show 100%
    state.phase = 'final-100'
    state.lastNorm = rawNorm
    return 1.0
  }
  state.lastNorm = rawNorm
  return rawNorm
}

/** Reset state after seek (to avoid false wrap-detection) */
export function resetLoopState(state: TrackLoopState, newNorm: number): void {
  state.phase = 'normal'
  state.lastNorm = newNorm
}

// ── DC Sparkline geometry ──────────────────────────────────────────────────────

export interface DCSparklineResult {
  /** Points: [x, y][] in space (0..graphW) × (0..graphH) */
  linePoints: Array<[number, number]>
  min: number
  max: number
  cur: number
  hasData: boolean
}

export function buildDCSparkline(
  buckets: readonly (number | null)[],
  graphW: number,
  graphH: number,
): DCSparklineResult {
  const vals = buckets.filter((v): v is number => v !== null)
  if (vals.length < 2) {
    return { linePoints: [], min: 0, max: 0, cur: 0, hasData: false }
  }
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const range = max - min || 1
  const PAD = 3
  const linePoints: Array<[number, number]> = []

  buckets.forEach((v, i) => {
    if (v === null) return
    const x = (i / (buckets.length - 1)) * graphW
    const y = graphH - ((v - min) / range) * (graphH - PAD * 2) - PAD
    linePoints.push([x, y])
  })

  return { linePoints, min, max, cur: vals[vals.length - 1], hasData: true }
}

// ── Layout constants and hit-test ──────────────────────────────────────────────

export const OVERLAY_MARGIN_X   = 12   // px from edges
export const TRACK_INFO_H       = 14   // height of time info row
export const TRACK_BAR_H        = 4    // bar height
export const TRACK_BAR_H_HOVER  = 6   // bar height on hover
export const TRACK_GAP          = 5    // between info row and bar
export const TRACK_ROW_H        = TRACK_INFO_H + TRACK_GAP + TRACK_BAR_H + 6  // ~29px
export const DC_HEADER_H        = 16
export const DC_GRAPH_H         = 36
export const DC_SECTION_H       = DC_HEADER_H + DC_GRAPH_H + 4  // ~56px
export const OVERLAY_PAD_BOTTOM = 10
export const OVERLAY_PAD_TOP    = 4

/**
 * Calculates total height of the overlay zone (hit zone at canvas bottom).
 */
export function overlayTotalHeight(trackCount: number, hasDC: boolean): number {
  if (trackCount === 0) return 0
  return (
    OVERLAY_PAD_TOP +
    trackCount * TRACK_ROW_H +
    (hasDC ? DC_SECTION_H : 0) +
    OVERLAY_PAD_BOTTOM
  )
}

/**
 * Tests if localY hits the overlay zone.
 * Returns track row index (0-based from top) or -1 if DC zone or miss.
 */
export function hitTestOverlay(
  localX: number,
  localY: number,
  stageW: number,
  stageH: number,
  trackCount: number,
  hasDC: boolean,
): { inOverlay: boolean; trackRowIndex: number; barPct: number } {
  const totalH = overlayTotalHeight(trackCount, hasDC)
  if (localY < stageH - totalH) return { inOverlay: false, trackRowIndex: -1, barPct: 0 }

  const relY = localY - (stageH - totalH) - OVERLAY_PAD_TOP
  const trackRowIndex = Math.floor(relY / TRACK_ROW_H)

  if (trackRowIndex < 0 || trackRowIndex >= trackCount) {
    return { inOverlay: true, trackRowIndex: -1, barPct: 0 }
  }

  const barX0 = OVERLAY_MARGIN_X
  const barW  = stageW - OVERLAY_MARGIN_X * 2
  const barPct = Math.max(0, Math.min(1, (localX - barX0) / barW))

  return { inOverlay: true, trackRowIndex, barPct }
}
