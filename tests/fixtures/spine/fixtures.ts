import { readFileSync } from 'fs'
import path from 'path'
import type { FileSet } from '@/core/types/FileSet'

/** Minimal hand-written Spine JSON per dialect; same skeleton and pose in every version. */
export const FIXTURE_VERSIONS = ['3.8', '4.0', '4.1', '4.2', '4.3'] as const
export type FixtureVersion = typeof FIXTURE_VERSIONS[number]

export const FIXTURE_SPINE_STRINGS: Record<FixtureVersion, string> = {
  '3.8': '3.8.99', '4.0': '4.0.64', '4.1': '4.1.24', '4.2': '4.2.40', '4.3': '4.3.13',
}

// one runtime module per dialect, imported lazily so no file statically pulls in two Spine runtimes
const RUNTIMES: Record<FixtureVersion, () => Promise<unknown>> = {
  '3.8': () => import('@pixi-spine/runtime-3.8'),
  '4.0': () => import('@pixi-spine/runtime-4.0'),
  '4.1': () => import('@pixi-spine/runtime-4.1'),
  '4.2': () => import('@esotericsoftware/spine-core'),
  '4.3': () => import('spine-pixi-v8-43'),
}

// TODO: remove the any when the runtimes ship one typed module shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadRuntime = (ver: FixtureVersion) => RUNTIMES[ver]() as Promise<Record<string, any>>

export const FIXTURE_DIR = __dirname
export const FIXTURE_ATLAS = path.join(__dirname, 'fixture.atlas')
export const FIXTURE_PNG = path.join(__dirname, 'fixture.png')
export const fixtureJsonPath = (ver: FixtureVersion) => path.join(__dirname, ver, 'fixture.json')

export const readFixtureJson = (ver: FixtureVersion): string => readFileSync(fixtureJsonPath(ver), 'utf-8')

/** FileSet of a fixture; images are left out unless asked (no image decoding under happy-dom). */
export function fixtureFileSet(ver: FixtureVersion, withImage = false): FileSet {
  return {
    skeleton: { filename: 'fixture.json', fileBody: readFixtureJson(ver), type: 'skeleton-json', mimeType: 'application/json' },
    atlas: { filename: 'fixture.atlas', fileBody: readFileSync(FIXTURE_ATLAS, 'utf-8'), type: 'atlas', mimeType: 'text/plain' },
    images: withImage
      ? [{ filename: 'fixture.png', fileBody: `data:image/png;base64,${readFileSync(FIXTURE_PNG).toString('base64')}`, type: 'image', mimeType: 'image/png' }]
      : [],
  }
}

const STUB_REGION = {
  u: 0, v: 0, u2: 1, v2: 1, width: 4, height: 4, degrees: 0, rotate: false,
  offsetX: 0, offsetY: 0, originalWidth: 4, originalHeight: 4,
}

/** Attachment loader that builds attachments without textures, for parsing with any runtime's SkeletonJson. */
// TODO: remove the any when the runtimes share typed attachment classes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stubAttachmentLoader(mod: Record<string, any>) {
  // 4.3 passes (skin, placeholder, name, path, sequence) and every region attachment owns a sequence
  const is43 = 'SliderData' in mod
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textured = (Ctor: any, args: any[]) => {
    if (is43) {
      const [, , name, , sequence] = args
      for (let i = 0; i < sequence.regions.length; i++) sequence.regions[i] = { ...STUB_REGION }
      return new Ctor(name, sequence)
    }
    const [, name, path, sequence] = args
    const att = new Ctor(name, path)
    if (sequence) for (let i = 0; i < sequence.regions.length; i++) sequence.regions[i] = { ...STUB_REGION }
    else att.region = { ...STUB_REGION }
    return att
  }
  const name = (args: unknown[]) => args[is43 ? 2 : 1] as string
  return {
    newRegionAttachment: (...args: unknown[]) => textured(mod.RegionAttachment, args),
    newMeshAttachment: (...args: unknown[]) => textured(mod.MeshAttachment, args),
    newBoundingBoxAttachment: (...args: unknown[]) => new mod.BoundingBoxAttachment(name(args)),
    newPathAttachment: (...args: unknown[]) => new mod.PathAttachment(name(args)),
    newPointAttachment: (...args: unknown[]) => new mod.PointAttachment(name(args)),
    newClippingAttachment: (...args: unknown[]) => new mod.ClippingAttachment(name(args)),
  }
}
