import { describe, it, expect } from 'vitest'
import { fpsTier } from '@/core/utils/fpsTier'

describe('fpsTier', () => {
  it.each([
    [0, 'bad'], [29, 'bad'], [30, 'ok'], [54, 'ok'], [55, 'good'], [60, 'good'],
  ] as const)('%i fps → %s', (fps, tier) => {
    expect(fpsTier(fps)).toBe(tier)
  })
})
