import { describe, it, expect } from 'vitest'
import { detectSpineVersion, detectSpineVersionFromSkel, isCompatible, spineVersionProblem } from '@/core/utils/versionDetector'
import type { FileSet } from '@/core/types/FileSet'

const skel = (text: string) => new TextEncoder().encode(`\u0000\u0001hash${text}\u0000rest`).buffer

describe('versionDetector', () => {
  it('reads major.minor from JSON', () => {
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.1.24' } }))).toBe('4.1')
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '3.8.99' } }))).toBe('3.8')
  })

  it('flags unsupported and unknown versions', () => {
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.3.1' } }))).toBe('4.3 (unsupported)')
    expect(detectSpineVersion(JSON.stringify({ skeleton: {} }))).toBe('unknown')
    expect(detectSpineVersion('not json')).toBe('unknown')
  })

  it('scans the binary header', () => {
    expect(detectSpineVersionFromSkel(skel('4.2.40'))).toBe('4.2')
    expect(detectSpineVersionFromSkel(skel('no version'))).toBe('unknown')
  })

  it('treats unknown as compatible', () => {
    expect(isCompatible('unknown', '4.2')).toBe(true)
    expect(isCompatible('4.1', '4.1')).toBe(true)
    expect(isCompatible('4.1', '4.2')).toBe(false)
  })

  it('reports a skeleton the session runtime cannot load', () => {
    const set = (skeleton: Partial<FileSet['skeleton']>) => ({ skeleton }) as unknown as FileSet
    const json = (v: string) => set({ type: 'skeleton-json', filename: 'a.json', fileBody: JSON.stringify({ skeleton: { spine: v } }) })
    expect(spineVersionProblem(json('4.1.24'), '4.1')).toBeNull()
    expect(spineVersionProblem(json('3.8.99'), '4.1')).toBe('Spine version mismatch: a.json is 3.8, viewer is set to 4.1')
    expect(spineVersionProblem(set({ type: 'skeleton-skel', filename: 'b.skel', fileBody: skel('3.8.99') }), '4.1'))
      .toBe('Spine version mismatch: b.skel is 3.8, viewer is set to 4.1')
  })
})
