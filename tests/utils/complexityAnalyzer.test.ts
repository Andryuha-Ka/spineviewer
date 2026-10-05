import { describe, it, expect } from 'vitest'
import { analyzeComplexity } from '@/core/utils/complexityAnalyzer'
import type { FileSet } from '@/core/types/FileSet'
import { makeFakeAdapter } from '../helpers/fakeAdapter'

function jsonFileSet(body: string): FileSet {
  return {
    skeleton: { filename: 'a.json', fileBody: body, type: 'skeleton-json', mimeType: 'application/json' },
    atlas:    { filename: 'a.atlas', fileBody: '', type: 'atlas', mimeType: 'text/plain' },
    images:   [],
  }
}

function metric(body: string, name: string): number {
  const report = analyzeComplexity(makeFakeAdapter(), jsonFileSet(body), [])
  return report.metrics.find(m => m.name === name)!.value
}

describe('analyzeComplexity (JSON)', () => {
  const body = JSON.stringify({
    skins: [{
      name: 'default',
      attachments: {
        body: {
          m1: { type: 'mesh', uvs: [0, 0, 1, 0, 1, 1] },
          m2: { type: 'mesh', uvs: [0, 0, 1, 1] },
          l1: { type: 'linkedmesh', parent: 'm1' },
          l2: { type: 'linkedmesh', parent: 'm1' },
          l3: { type: 'linkedmesh', parent: 'm2' },
          r1: {},
        },
      },
    }],
  })

  it('counts linkedmesh as a mesh, not a region', () => {
    expect(metric(body, 'Meshes')).toBe(5)
    expect(metric(body, 'Regions')).toBe(1)
    expect(metric(body, 'Mesh vertices')).toBe(5)
  })

  it('measures skeleton size in UTF-8 bytes', () => {
    const utf = JSON.stringify({ skins: [], bones: [{ name: 'éééé' }] })
    const bytes = new TextEncoder().encode(utf).byteLength
    expect(bytes).toBe(utf.length + 4)
    expect(metric(utf, 'Skeleton size') * 1024 * 1024).toBeCloseTo(bytes)
  })
})
