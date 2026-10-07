/**
 * @file Spine42Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import {
  Spine, SpineTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonBinary,
} from '@esotericsoftware/spine-pixi-v8'
import { TextureAtlas, Skin, Physics } from '@esotericsoftware/spine-core'
import * as spineCore from '@esotericsoftware/spine-core'
import type {
  BoneTransform, BoneLocalTransform, BoneLocalState, AttachmentInfo, SlotBounds,
} from '@/core/types/ISpineAdapter'
import { readApplied, readLocal, setupOf, worldShear, type BoneLike } from '@/core/utils/boneTransform'
import type { FileSet } from '@/core/types/FileSet'
import { dialectOf, serializeSkeletonData } from '@/core/spineJson/serializeSkeletonData'
import {
  BasePixi8Adapter, classifyAttachment, meshVertexCount,
  type Pixi8LabelPose, type Pixi8TrackEntry,
} from '../BasePixi8Adapter'

export default class Spine42Adapter extends BasePixi8Adapter<Spine> {
  readonly detectedVersion = '4.2'
  protected readonly _physicsPose = Physics.pose

  // ── Load ───────────────────────────────────────────────────────────────────

  async load(fileSet: FileSet): Promise<void> {
    // 1. Load images as Pixi 8 textures
    const textureMap = await this._loadTextures(fileSet)

    // 2. Build spine-core TextureAtlas; assign SpineTexture to each page
    const atlas = new TextureAtlas(fileSet.atlas.fileBody as string)
    for (const page of atlas.pages) {
      const name = page.name.split('/').pop() ?? page.name
      const key = [...textureMap.keys()].find(k => k === name || k.endsWith('/' + name))
      if (key) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        page.setTexture(SpineTexture.from(textureMap.get(key)!.source as any))
      }
    }

    // 3. Parse skeleton
    const loader = new AtlasAttachmentLoader(atlas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let skeletonData: any

    if (fileSet.skeleton.type === 'skeleton-json') {
      const reader = new SkeletonJson(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(
        JSON.parse(fileSet.skeleton.fileBody as string),
      )
    } else {
      const reader = new SkeletonBinary(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(
        new Uint8Array(fileSet.skeleton.fileBody as ArrayBuffer),
      )
    }

    // 4. Create Spine display object
    this._skeletonData = skeletonData
    this._spine = new Spine({ skeletonData })
    this._spine.beforeUpdateWorldTransforms = () => this._beforeWorld()

    // 5. Fill metadata
    this.animations = skeletonData.animations.map((a: { name: string }) => a.name)
    this.skins      = skeletonData.skins.map((s: { name: string }) => s.name)
    this.bones      = skeletonData.bones.map((b: { name: string; parent?: { name: string } }) => ({
      name: b.name,
      parent: b.parent?.name ?? null,
    }))
    this.slots      = skeletonData.slots.map((s: { name: string; boneData: { name: string }; blendMode: number }) => ({
      name: s.name,
      bone: s.boneData.name,
      blendMode: s.blendMode,
    }))
    this.events     = (skeletonData.events ?? []).map((e: { name: string; intValue: number; floatValue: number; stringValue: string }) => ({
      name: e.name,
      intValue: e.intValue ?? 0,
      floatValue: e.floatValue ?? 0,
      stringValue: e.stringValue ?? '',
    }))
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  setSkin(name: string): void {
    if (!this._spine) return
    this._spine.skeleton.setSkinByName(name)
    this._spine.skeleton.setSlotsToSetupPose()
  }

  setSkins(names: string[]): void {
    if (!this._spine || names.length === 0) return
    if (names.length === 1) { this.setSkin(names[0]); return }
    const combined = new Skin('combined')
    for (const name of names) {
      const skin = this._spine.skeleton.data.findSkin(name)
      if (skin) combined.addSkin(skin)
    }
    this._spine.skeleton.setSkin(combined)
    this._spine.skeleton.setSlotsToSetupPose()
  }

  setToSetupPose(): void {
    this._spine?.skeleton.setToSetupPose()
    this._poseNow()
  }

  setBonesToSetupPose(): void {
    this._spine?.skeleton.setBonesToSetupPose()
    this._poseNow()
  }

  setSlotsToSetupPose(): void { this._spine?.skeleton.setSlotsToSetupPose() }

  // ── Live data ──────────────────────────────────────────────────────────────

  getBoneTransforms(): BoneTransform[] {
    if (!this._spine) return []
    // spine-pixi-v8 sets Skeleton.yDown = true: bone.worldY is in Pixi Y-down space.
    // Negate Y to return Spine Y-up coordinates, consistent with the coordinate convention
    // expected by PreviewStage (which uses `baseY - y * zoom` for canvas positioning).
    return this._spine.skeleton.bones.map(b => ({
      name: b.data.name,
      x: b.worldX,
      y: -b.worldY,
      rotation: -b.getWorldRotationX(),
      scaleX: b.getWorldScaleX(),
      scaleY: b.getWorldScaleY(),
      shearY: worldShear(b.a, b.b, -b.c, -b.d),
    }))
  }

  getBoneLocalTransforms(): BoneLocalState[] {
    if (!this._spine) return []
    return this._spine.skeleton.bones.map(b => ({ name: b.data.name, local: readLocal(b), applied: readApplied(b) }))
  }

  getActiveAttachments(): AttachmentInfo[] {
    if (!this._spine) return []
    return this._spine.skeleton.slots
      .filter(s => s.attachment !== null)
      .map(s => ({
        slotName: s.data.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachmentName: (s.attachment as any)?.name ?? '',
        type: classifyAttachment(s.attachment),
      }))
  }

  getAllAttachments(): AttachmentInfo[] {
    if (!this._skeletonData) return []
    const result: AttachmentInfo[] = []
    const seen = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slots: any[] = this._skeletonData.slots ?? []
    for (const skin of this._skeletonData.skins ?? []) {
      // spine-core 4.x: skin.attachments is Array<Map<string, Attachment>>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const atts: any = skin.attachments
      if (Array.isArray(atts)) {
        for (let slotIdx = 0; slotIdx < atts.length; slotIdx++) {
          const map = atts[slotIdx]
          if (!map) continue
          const slotName: string = slots[slotIdx]?.name ?? `slot_${slotIdx}`
          const entries: Iterable<[string, unknown]> =
            map instanceof Map ? map.entries() : Object.entries(map as object)
          for (const [attName, att] of entries) {
            const key = `${slotName}::${attName}`
            if (seen.has(key)) continue
            seen.add(key)
            result.push({
              slotName,
              attachmentName: attName,
              type: classifyAttachment(att),
              vertexCount: meshVertexCount(att),
            })
          }
        }
      }
    }
    return result
  }

  getSlotBounds(slotName: string): SlotBounds | null {
    if (!this._spine) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = this._spine.skeleton.findSlot(slotName) as any
    if (!slot?.attachment) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att = slot.attachment as any
    if (typeof att.computeWorldVertices !== 'function') return null

    const count: number = att.worldVerticesLength ?? 8
    if (count < 2) return null
    const verts = new Float32Array(count)

    const typeName: string = att.constructor?.name ?? ''
    const isMesh = /mesh/i.test(typeName) || att.triangles != null

    try {
      if (isMesh) {
        // MeshAttachment: (slot, start, count, out, offset, stride)
        att.computeWorldVertices(slot, 0, count, verts, 0, 2)
      } else {
        // RegionAttachment: (slot, out, offset, stride)
        att.computeWorldVertices(slot, verts, 0, 2)
      }
    } catch {
      return null
    }

    // spine-pixi-v8 sets Skeleton.yDown = true: vertices are in Pixi Y-down space.
    // Negate Y to normalise to Spine Y-up so the caller uses the same formula for all adapters.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < count; i += 2) {
      const x = verts[i], y = -verts[i + 1]
      if (!isFinite(x) || !isFinite(y)) return null
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null
  }

  // ── Free bones ─────────────────────────────────────────────────────────────

  getFreeBones(): string[] {
    if (!this._skeletonData) return []
    const animated = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const anim of (this._skeletonData.animations ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const tl of (anim.timelines ?? []) as any[]) {
        // spine-core 4.2: BoneTimeline has boneIndex (number)
        if (typeof tl.boneIndex === 'number') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bd = (this._skeletonData.bones as any[])[tl.boneIndex]
          if (bd?.name) animated.add(bd.name)
        }
        // fallback: direct bone reference
        if (tl.bone?.name) animated.add(tl.bone.name)
      }
    }
    return this.bones.filter(b => !animated.has(b.name)).map(b => b.name)
  }

  getBoneSetupTransform(boneName: string): BoneLocalTransform | null {
    const bd = this._skeletonData?.findBone(boneName)
    return bd ? setupOf(bd, false) : null
  }

  toSpineJson(): { json: object; warnings: string[] } {
    const data = this._skeletonData
    if (!data) throw new Error('No skeleton loaded')
    return serializeSkeletonData(data, spineCore, dialectOf(data.version, '4.2'))
  }

  // ── Base hooks ─────────────────────────────────────────────────────────────

  protected _trackEntry(track: number): Pixi8TrackEntry | null {
    return this._spine?.state.getCurrent(track) ?? null
  }

  protected _labelPose(boneName: string): Pixi8LabelPose | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bone = (this._spine?.skeleton as any)?.findBone(boneName)
    if (!bone) return null
    // bone.arotation = CCW-positive degrees (Spine Y-up math).
    // Pixi rotation = CW-positive radians → negate and convert.
    return { x: bone.worldX, y: bone.worldY, rotation: -bone.arotation * (Math.PI / 180) }
  }

  protected _poseOf(boneName: string): BoneLike | null {
    return this._spine?.skeleton.findBone(boneName) ?? null
  }

  protected _slotAlpha(slotName: string): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = (this._spine?.skeleton as any)?.findSlot(slotName)
    return slot ? slot.color.a : 1
  }
}

