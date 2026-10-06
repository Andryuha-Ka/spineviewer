import { describe, it, expect } from 'vitest'
import { diffSeverity } from '@/core/utils/compare/diffSeverity'
import type { ConstraintRow, SpineDiff } from '@/core/utils/spineCompare'

const cstr = (status: ConstraintRow['status'], bones = false, target = false, params = false): ConstraintRow =>
  ({ name: 'c', kind: 'ik', status, bonesChanged: bones, targetChanged: target, paramsChanged: params })

const diff: SpineDiff = {
  source: 'json-full',
  summary: { added: 0, removed: 0, changed: 0, equal: 0 },
  animTable: [
    { name: 'a', durA: 1, durB: null, status: 'only-a' },
    { name: 'b', durA: null, durB: 1, status: 'only-b' },
    { name: 'c', durA: 1, durB: 2, status: 'delta' },
    { name: 'd', durA: 1, durB: 1, status: 'ok' },
  ],
  skinTable: [
    { name: 'default', status: 'ok' },
    { name: 'red', status: 'only-a' },
    { name: 'blue', status: 'only-b' },
    { name: 'green', status: 'only-b' },
  ],
  globalEvents: [{ name: 'hit', status: 'only-a' }, { name: 'x', status: 'ok' }],
  animEvents: [
    {
      animName: 'win', animStatus: 'ok', hasChanges: true,
      events: [
        { eventName: 'hit', idx: 0, timeA: 0.5, timeB: 0.7, status: 'delta' },
        { eventName: 'hit', idx: 1, timeA: 1, timeB: null, status: 'only-a' },
      ],
    },
    {
      animName: 'run', animStatus: 'ok', hasChanges: true,
      events: [
        { eventName: 'step', idx: 0, timeA: null, timeB: 0.1, status: 'only-b' },
        { eventName: 'step', idx: 1, timeA: 0.2, timeB: 0.3, status: 'delta' },
        { eventName: 'tap', idx: 0, timeA: 0.4, timeB: 0.5, status: 'delta' },
        { eventName: 'ok', idx: 0, timeA: 0.6, timeB: 0.6, status: 'ok' },
      ],
    },
  ],
  constraintTable: [
    cstr('only-a'),
    cstr('only-b'),
    cstr('changed', true),
    cstr('changed', false, true, true),
    cstr('changed', false, false, true),
    cstr('ok'),
  ],
  sliderTable: [],
  freeBoneTable: [{ name: 'r', status: 'ok' }, { name: 's', status: 'only-b' }],
  placeholders: [
    { name: 'p1', kind: 'bone', status: 'added' },
    { name: 'p2', kind: 'slot', status: 'removed' },
    { name: 'p3', kind: 'slot', status: 'removed' },
    { name: 'p4', kind: 'slot', status: 'equal' },
  ],
  sections: [],
}

describe('diffSeverity', () => {
  it('returns zeros for no diff', () => {
    expect(diffSeverity(null)).toEqual({
      animName: 0, animDur: 0, skin: 0, globalEvent: 0, animEventName: 0, animEventTiming: 0,
      placeholder: 0, constraintCritical: 0, constraintParam: 0, sliderCritical: 0, sliderParam: 0, freeBone: 0,
      critical: 0, warn: 0,
    })
  })

  it('counts every field', () => {
    expect(diffSeverity(diff)).toMatchObject({
      animName: 2, animDur: 1, skin: 3, globalEvent: 1, animEventName: 2, animEventTiming: 3,
      placeholder: 3, constraintCritical: 4, constraintParam: 1, freeBone: 1,
    })
  })

  it('grades a one-sided slider critical and a slider parameter change as a warning', () => {
    const s = diffSeverity({
      ...diff,
      animTable: [], skinTable: [], globalEvents: [], animEvents: [], constraintTable: [], freeBoneTable: [], placeholders: [],
      sliderTable: [
        { name: 'blink', status: 'only-a', changes: [] },
        { name: 'smile', status: 'changed', changes: [{ key: 'mix', a: '1', b: '0.5' }] },
        { name: 'wink', status: 'ok', changes: [] },
      ],
    })
    expect(s).toMatchObject({ sliderCritical: 1, sliderParam: 1, critical: 1, warn: 1 })
  })

  it('sums critical and warn', () => {
    const s = diffSeverity(diff)
    expect(s.critical).toBe(2 + 3 + 1 + 2 + 3 + 4)
    expect(s.warn).toBe(1 + 3 + 1 + 1)
  })
})
