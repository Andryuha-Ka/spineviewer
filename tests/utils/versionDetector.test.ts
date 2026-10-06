import { describe, it, expect } from 'vitest'
import { detectFileSetVersion, detectSpineVersion, detectSpineVersionFromSkel, isCompatible, runtimeSpineVersion, spineVersionProblem, unsupportedVersionHint } from '@/core/utils/versionDetector'
import type { FileSet } from '@/core/types/FileSet'

const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))
const hash = [0x9a, 0x01, 0xff, 0x3c, 0x00, 0x7e, 0x80, 0x12]
const header41 = new Uint8Array([...hash, 0x07, ...ascii('4.1.21'), 0x00]).buffer
const header42 = new Uint8Array([...hash, 0x07, ...ascii('4.2.40'), 0x00]).buffer
const header43 = new Uint8Array([...hash, 0x0c, ...ascii('4.3.75-beta')]).buffer
const header44 = new Uint8Array([...hash, 0x07, ...ascii('4.4.01')]).buffer
const header38 = new Uint8Array([0x1c, ...ascii('A'.repeat(27)), 0x07, ...ascii('3.8.99')]).buffer
const header38Dots = new Uint8Array([0x1c, ...ascii('abcdefghijklmn9.9.9opqrstuv'), 0x07, ...ascii('3.8.99')]).buffer
const header4DotsHash = new Uint8Array([...ascii('1.2.3.4.'), 0x07, ...ascii('4.1.24')]).buffer

const set = (skeleton: Partial<FileSet['skeleton']>) => ({ skeleton }) as unknown as FileSet
const json = (v: string) => set({ type: 'skeleton-json', filename: 'a.json', fileBody: JSON.stringify({ skeleton: { spine: v } }) })

describe('versionDetector', () => {
  it('reads major.minor from JSON', () => {
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.1.24' } }))).toBe('4.1')
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '3.8.99' } }))).toBe('3.8')
  })

  it('flags unsupported and unknown versions', () => {
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.4.1' } }))).toBe('4.4 (unsupported)')
    expect(detectSpineVersion(JSON.stringify({ skeleton: {} }))).toBe('unknown')
    expect(detectSpineVersion('not json')).toBe('unknown')
  })

  it('reads the version string at its binary header position (B27)', () => {
    expect(detectSpineVersionFromSkel(header41)).toBe('4.1')
    expect(detectSpineVersionFromSkel(header42)).toBe('4.2')
    expect(detectSpineVersionFromSkel(header38)).toBe('3.8')
    expect(detectSpineVersionFromSkel(header4DotsHash)).toBe('4.1')
    expect(detectSpineVersionFromSkel(header38Dots)).toBe('3.8')
    expect(detectSpineVersionFromSkel(header43)).toBe('4.3')
    expect(detectSpineVersionFromSkel(header44)).toBe('4.4 (unsupported)')
    expect(detectSpineVersionFromSkel(new Uint8Array(ascii('garbage without any version')).buffer)).toBe('unknown')
    expect(detectSpineVersionFromSkel(new Uint8Array([0x01, 0x02, 0x03]).buffer)).toBe('unknown')
  })

  it('describes an unsupported version (B22)', () => {
    expect(unsupportedVersionHint('4.4 (unsupported)')).toBe('Spine 4.4 is newer than the supported runtimes (3.8, 4.0, 4.1, 4.2, 4.3)')
    expect(unsupportedVersionHint('5.0 (unsupported)')).toBe('Spine 5.0 is newer than the supported runtimes (3.8, 4.0, 4.1, 4.2, 4.3)')
    expect(unsupportedVersionHint('3.7 (unsupported)')).toBe('Spine 3.7 is older than the supported runtimes (3.8, 4.0, 4.1, 4.2, 4.3)')
    expect(unsupportedVersionHint('4.1')).toBeNull()
    expect(unsupportedVersionHint('unknown')).toBeNull()
  })

  it('treats unknown and same-Pixi versions as compatible', () => {
    expect(isCompatible('unknown', '4.2')).toBe(true)
    expect(isCompatible('4.1', '4.1')).toBe(true)
    expect(isCompatible('3.8', '4.1')).toBe(true)
    expect(isCompatible('4.0', '4.1')).toBe(true)
    expect(isCompatible('4.1', '4.2')).toBe(false)
    expect(isCompatible('4.4 (unsupported)', '4.1')).toBe(false)
    expect(isCompatible('4.3', '4.2')).toBe(true)
  })

  it('reads Spine 4.3 versions, including a pre-release suffix', () => {
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.3.75-beta' } }))).toBe('4.3')
    expect(detectSpineVersion(JSON.stringify({ skeleton: { spine: '4.3.13' } }))).toBe('4.3')
  })

  it('reports 4.3 sets against the session version', () => {
    const hero = (v: string) => set({ type: 'skeleton-json', filename: 'hero.json', fileBody: JSON.stringify({ skeleton: { spine: v } }) })
    expect(spineVersionProblem(hero('4.3.13'), '4.2')).toBeNull()
    expect(spineVersionProblem(hero('4.3.13'), '4.1')).toBe('Spine version mismatch: hero.json is 4.3, viewer is set to 4.1')
    expect(runtimeSpineVersion(hero('4.3.13'), 8, '4.2')).toBe('4.3')
  })

  it('reports an unsupported set in every session (C47/B30)', () => {
    const unsupported = 'Spine version mismatch: hero.json is 4.4 (unsupported), supported versions are 3.8, 4.0, 4.1, 4.2, 4.3'
    const hero = set({ type: 'skeleton-json', filename: 'hero.json', fileBody: JSON.stringify({ skeleton: { spine: '4.4.1' } }) })
    for (const session of ['3.8', '4.1', '4.2', '4.3', 'unknown', '4.4 (unsupported)']) {
      expect(spineVersionProblem(hero, session)).toBe(unsupported)
    }
    expect(spineVersionProblem(set({ type: 'skeleton-json', filename: 'old.json', fileBody: JSON.stringify({ skeleton: { spine: '3.7.94' } }) }), '4.2'))
      .toBe('Spine version mismatch: old.json is 3.7 (unsupported), supported versions are 3.8, 4.0, 4.1, 4.2, 4.3')
  })

  it('never marks an unknown set, nor a supported set against an unknown session', () => {
    expect(spineVersionProblem(json(''), '4.1')).toBeNull()
    expect(spineVersionProblem(json('4.2.40'), 'unknown')).toBeNull()
  })

  it('reports a skeleton that needs the other Pixi version', () => {
    expect(spineVersionProblem(json('4.1.24'), '4.1')).toBeNull()
    expect(spineVersionProblem(json('3.8.99'), '4.1')).toBeNull()
    expect(spineVersionProblem(json('4.2.40'), '4.1')).toBe('Spine version mismatch: a.json is 4.2, viewer is set to 4.1')
    expect(spineVersionProblem(json('3.8.99'), '4.2')).toBe('Spine version mismatch: a.json is 3.8, viewer is set to 4.2')
    expect(spineVersionProblem(set({ type: 'skeleton-skel', filename: 'b.skel', fileBody: header42 }), '4.1'))
      .toBe('Spine version mismatch: b.skel is 4.2, viewer is set to 4.1')
  })

  it('detects the version of a JSON or binary set', () => {
    expect(detectFileSetVersion(json('4.0.64'))).toBe('4.0')
    expect(detectFileSetVersion(set({ type: 'skeleton-skel', filename: 'b.skel', fileBody: header38 }))).toBe('3.8')
  })

  it('picks the own runtime of a set within the Pixi version', () => {
    expect(runtimeSpineVersion(json('3.8.99'), 7, '4.1')).toBe('3.8')
    expect(runtimeSpineVersion(json(''), 7, '4.1')).toBe('4.1')
    expect(runtimeSpineVersion(json('4.2.40'), 7, '4.1')).toBe('4.1')
  })
})
