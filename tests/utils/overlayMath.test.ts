import { describe, it, expect } from 'vitest'
import {
  makeLoopState, computeNorm, resetLoopState, buildDCSparkline,
  overlayTotalHeight, hitTestOverlay,
  OVERLAY_PAD_TOP, OVERLAY_PAD_BOTTOM, TRACK_ROW_H, DC_SECTION_H, OVERLAY_MARGIN_X,
} from '@/core/overlay/overlayMath'

describe('computeNorm', () => {
  it('clamps a non-looping track at its end', () => {
    const s = makeLoopState()
    expect(computeNorm(0.5, 2, false, s)).toBe(0.25)
    expect(computeNorm(5, 2, false, s)).toBe(1)
  })

  it('returns 0 for a zero-length animation', () => {
    expect(computeNorm(1, 0, true, makeLoopState())).toBe(0)
  })

  it('shows 100% for one extra frame on a loop wrap, then 0%', () => {
    const s = makeLoopState()
    expect(computeNorm(0.95, 1, true, s)).toBeCloseTo(0.95)
    expect(computeNorm(1.02, 1, true, s)).toBe(1)
    expect(s.phase).toBe('final-100')
    expect(computeNorm(1.04, 1, true, s)).toBe(1)
    expect(computeNorm(1.06, 1, true, s)).toBe(0)
    expect(s.phase).toBe('normal')
    expect(computeNorm(1.08, 1, true, s)).toBeCloseTo(0.08)
  })

  it('does not detect a wrap after a seek reset', () => {
    const s = makeLoopState()
    computeNorm(0.95, 1, true, s)
    resetLoopState(s, 0.05)
    expect(computeNorm(0.06, 1, true, s)).toBeCloseTo(0.06)
  })
})

describe('buildDCSparkline', () => {
  it('needs at least two samples', () => {
    expect(buildDCSparkline([null, 3, null], 100, 36).hasData).toBe(false)
  })

  it('maps samples to the graph box and skips gaps', () => {
    const r = buildDCSparkline([2, null, 6], 100, 36)
    expect(r).toMatchObject({ hasData: true, min: 2, max: 6, cur: 6 })
    expect(r.linePoints).toEqual([[0, 33], [100, 3]])
  })
})

describe('overlay hit-test', () => {
  it('computes the overlay height', () => {
    expect(overlayTotalHeight(0, true)).toBe(0)
    expect(overlayTotalHeight(2, true)).toBe(OVERLAY_PAD_TOP + 2 * TRACK_ROW_H + DC_SECTION_H + OVERLAY_PAD_BOTTOM)
  })

  it('resolves the track row and bar percentage', () => {
    const stageH = 500
    const top = stageH - overlayTotalHeight(2, false)
    expect(hitTestOverlay(10, top - 1, 400, stageH, 2, false).inOverlay).toBe(false)
    const row1 = hitTestOverlay(200, top + OVERLAY_PAD_TOP + TRACK_ROW_H + 1, 400, stageH, 2, false)
    expect(row1.trackRowIndex).toBe(1)
    expect(row1.barPct).toBeCloseTo((200 - OVERLAY_MARGIN_X) / (400 - OVERLAY_MARGIN_X * 2))
    expect(hitTestOverlay(0, top + OVERLAY_PAD_TOP + 1, 400, stageH, 2, false).barPct).toBe(0)
  })
})
