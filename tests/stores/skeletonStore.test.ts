import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSkeletonStore } from '@/core/stores/useSkeletonStore'

describe('skeleton store composerMode', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to false, can be set, and clear() resets it', () => {
    const store = useSkeletonStore()
    expect(store.composerMode).toBe(false)
    store.composerMode = true
    expect(store.composerMode).toBe(true)
    store.clear()
    expect(store.composerMode).toBe(false)
  })
})
