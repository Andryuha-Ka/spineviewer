import { describe, it, expect } from 'vitest'
import { detectFileSetVersion, detectSpineVersion, detectSpineVersionFromSkel, isCompatible, runtimeSpineVersion, spineVersionProblem } from '@/core/utils/versionDetector'
import type { FileSet } from '@/core/types/FileSet'

const skel = (text: string) => new TextEncoder().encode(`\u0000\u0001hash${text}\u0000rest`).buffer
const set = (skeleton: Partial<FileSet['skeleton']>) => ({ skeleton }) as unknown as FileSet
const json = (v: string) => set({ type: 'skeleton-json', filename: 'a.json', fileBody: JSON.stringify({ skeleton: { spine: v } }) })

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

  it('treats unknown and same-Pixi versions as compatible', () => {
    expect(isCompatible('unknown', '4.2')).toBe(true)
    expect(isCompatible('4.1', '4.1')).toBe(true)
    expect(isCompatible('3.8', '4.1')).toBe(true)
    expect(isCompatible('4.0', '4.1')).toBe(true)
    expect(isCompatible('4.1', '4.2')).toBe(false)
    expect(isCompatible('4.3 (unsupported)', '4.1')).toBe(false)
  })

  it('reports a skeleton that needs the other Pixi version', () => {
    expect(spineVersionProblem(json('4.1.24'), '4.1')).toBeNull()
    expect(spineVersionProblem(json('3.8.99'), '4.1')).toBeNull()
    expect(spineVersionProblem(json('4.2.40'), '4.1')).toBe('Spine version mismatch: a.json is 4.2, viewer is set to 4.1')
    expect(spineVersionProblem(json('3.8.99'), '4.2')).toBe('Spine version mismatch: a.json is 3.8, viewer is set to 4.2')
    expect(spineVersionProblem(set({ type: 'skeleton-skel', filename: 'b.skel', fileBody: skel('4.2.40') }), '4.1'))
      .toBe('Spine version mismatch: b.skel is 4.2, viewer is set to 4.1')
  })

  it('detects the version of a JSON or binary set', () => {
    expect(detectFileSetVersion(json('4.0.64'))).toBe('4.0')
    expect(detectFileSetVersion(set({ type: 'skeleton-skel', filename: 'b.skel', fileBody: skel('3.8.99') }))).toBe('3.8')
  })

  it('picks the own runtime of a set within the Pixi version', () => {
    expect(runtimeSpineVersion(json('3.8.99'), 7, '4.1')).toBe('3.8')
    expect(runtimeSpineVersion(json(''), 7, '4.1')).toBe('4.1')
    expect(runtimeSpineVersion(json('4.2.40'), 7, '4.1')).toBe('4.1')
  })
})
