import { describe, it, expect } from 'vitest'
import { buildCascaderOptions } from '@/core/utils/buildCascaderOptions'

describe('buildCascaderOptions', () => {
  it('nests by "/" with leaves first, sorted, full names as values', () => {
    const tree = buildCascaderOptions(['walk/forward', 'idle', 'combat/attack/heavy', 'walk/back', 'appear'])
    expect(tree.map(o => o.label)).toEqual(['appear', 'idle', 'combat', 'walk'])
    const walk = tree.find(o => o.label === 'walk')!
    expect(walk.value).toBe('__group__walk')
    expect(walk.children!.map(o => o.value)).toEqual(['walk/back', 'walk/forward'])
    const heavy = tree.find(o => o.label === 'combat')!.children![0].children![0]
    expect(heavy).toEqual({ label: 'heavy', value: 'combat/attack/heavy' })
  })

  it('returns an empty list for no animations', () => {
    expect(buildCascaderOptions([])).toEqual([])
  })
})
