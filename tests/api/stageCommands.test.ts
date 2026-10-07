import { describe, it, expect, afterEach } from 'vitest'
import { getStageCommands, registerStageCommands, unregisterStageCommands, type StageCommands } from '@/core/api/stageCommands'

const cmds = () => ({ isBusy: () => false }) as unknown as StageCommands

describe('stageCommands registry', () => {
  afterEach(() => { const c = getStageCommands(); if (c) unregisterStageCommands(c) })

  it('is empty until a stage registers', () => expect(getStageCommands()).toBeNull())

  it('returns the registered object', () => {
    const a = cmds()
    registerStageCommands(a)
    expect(getStageCommands()).toBe(a)
  })

  it('a newer registration replaces the older one', () => {
    const a = cmds(), b = cmds()
    registerStageCommands(a)
    registerStageCommands(b)
    expect(getStageCommands()).toBe(b)
  })

  it('unregisters only the object that is still registered', () => {
    const a = cmds(), b = cmds()
    registerStageCommands(a)
    registerStageCommands(b)
    unregisterStageCommands(a)
    expect(getStageCommands()).toBe(b)
    unregisterStageCommands(b)
    expect(getStageCommands()).toBeNull()
  })
})
