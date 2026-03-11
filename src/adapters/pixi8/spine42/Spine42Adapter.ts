/**
 * @file Spine42Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as PIXI from 'pixi8'
import {
  Spine, SpineTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonBinary,
} from '@esotericsoftware/spine-pixi-v8'
import {
  TextureAtlas,
  Skin,
  type AnimationStateListener,
} from '@esotericsoftware/spine-core'
import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, TrackQueueEntry, BoneTransform, AttachmentInfo, SpineEvent,
  AnimationEventMarker, SlotBounds,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

export default class Spine42Adapter implements ISpineAdapter {
  readonly detectedVersion = '4.2'

  animations: string[] = []
  skins: string[] = []
  bones: BoneInfo[] = []
  slots: SlotInfo[] = []
  events: EventInfo[] = []

  private _spine: Spine | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _skeletonData: any = null
  private _container: PIXI.Container | null = null
  private _eventUnsubscribers: Array<() => void> = []

  // ── Load ───────────────────────────────────────────────────────────────────

  async load(fileSet: FileSet): Promise<void> {
    // 1. Load images via HTMLImageElement first, then create Pixi 8 textures.
    //    Texture.from(dataUrl) in Pixi v8 starts loading asynchronously and the
    //    'loaded' event is named 'update' — skipping that entirely by pre-loading
    //    the image guarantees tex.source.resource is set before SpineTexture.from().
    const textureMap = new Map<string, PIXI.Texture>()
    await Promise.all(fileSet.images.map(async img => {
      const htmlImg = new Image()
      await new Promise<void>((resolve, reject) => {
        htmlImg.onload = () => resolve()
        htmlImg.onerror = () => reject(new Error(`Failed to load image: ${img.filename}`))
        htmlImg.src = img.fileBody as string
      })
      const tex = PIXI.Texture.from(htmlImg)
      textureMap.set(img.filename, tex)
    }))

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

  // ── Mount ──────────────────────────────────────────────────────────────────

  mount(container: unknown): void {
    if (!this._spine) throw new Error('Call load() before mount()')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = container as any
    this._container = stage
    stage.addChild(this._spine)

    if (this.animations.length > 0) {
      this._spine.state.setAnimation(0, this.animations[0], true)
    }
  }

  // ── Destroy ────────────────────────────────────────────────────────────────

  destroy(): void {
    this._eventUnsubscribers.forEach(fn => fn())
    this._eventUnsubscribers = []
    if (this._container && this._spine) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._container.removeChild(this._spine as any)
    }
    this._spine?.destroy()
    this._spine = null
    this._container = null
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  setAnimation(track: number, name: string, loop: boolean): void {
    this._spine?.state.setAnimation(track, name, loop)
  }

  addAnimation(track: number, name: string, loop: boolean, delay = 0): void {
    this._spine?.state.addAnimation(track, name, loop, delay)
  }

  clearTrack(track: number): void { this._spine?.state.clearTrack(track) }
  clearTracks(): void { this._spine?.state.clearTracks() }

  setTimeScale(scale: number): void {
    if (this._spine) this._spine.state.timeScale = scale
  }

  setTrackTimeScale(track: number, scale: number): void {
    const entry = this._spine?.state.getCurrent(track)
    if (entry) entry.timeScale = scale
  }

  setTrackLoop(track: number, loop: boolean): void {
    const entry = this._spine?.state.getCurrent(track)
    if (entry) entry.loop = loop
  }

  removeQueueEntry(track: number, index: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prev: any = this._spine?.state.getCurrent(track)
    if (!prev) return
    for (let i = 0; i < index; i++) {
      if (!prev.next) return
      prev = prev.next
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (prev.next) prev.next = (prev.next as any).next ?? null
  }

  seekTo(track: number, time: number): void {
    const entry = this._spine?.state.getCurrent(track)
    if (entry) entry.trackTime = time
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

  setToSetupPose(): void { this._spine?.skeleton.setToSetupPose() }
  setBonesToSetupPose(): void { this._spine?.skeleton.setBonesToSetupPose() }
  setSlotsToSetupPose(): void { this._spine?.skeleton.setSlotsToSetupPose() }

  // ── Live data ──────────────────────────────────────────────────────────────

  getTrackStates(): TrackState[] {
    if (!this._spine) return []
    const result: TrackState[] = []
    for (let i = 0; i < 12; i++) {
      const e = this._spine.state.getCurrent(i)
      if (!e || !e.animation) continue
      const queue: TrackQueueEntry[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let next: any = e.next
      while (next?.animation) {
        queue.push({ animationName: next.animation.name, loop: next.loop })
        next = next.next
      }
      result.push({
        trackIndex: i,
        animationName: e.animation.name,
        time: e.trackTime,
        duration: e.animation.duration,
        loop: e.loop,
        timeScale: e.timeScale,
        queue,
      })
    }
    return result
  }

  getBoneTransforms(): BoneTransform[] {
    if (!this._spine) return []
    // spine-pixi-v8 sets Skeleton.yDown = true: bone.worldY is in Pixi Y-down space.
    // Negate Y to return Spine Y-up coordinates, consistent with the coordinate convention
    // expected by PreviewStage (which uses `baseY - y * zoom` for canvas positioning).
    return this._spine.skeleton.bones.map(b => ({
      name: b.data.name,
      x: b.worldX,
      y: -b.worldY,
      rotation: b.arotation,
      scaleX: b.ascaleX,
      scaleY: b.ascaleY,
    }))
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              vertexCount: spine42MeshVertexCount(att),
            })
          }
        }
      }
    }
    return result
  }

  getAnimationEvents(animationName: string): AnimationEventMarker[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anim = this._skeletonData?.animations?.find((a: any) => a.name === animationName)
    if (!anim) return []
    const markers: AnimationEventMarker[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tl of anim.timelines ?? []) {
      // frames may be Float32Array (spine 4.x) or Array (spine 3.8) — avoid Array.isArray
      if (!Array.isArray(tl.events) || tl.frames == null) continue
      for (let i = 0; i < tl.events.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evt: any = tl.events[i]
        if (evt?.data?.name) markers.push({ name: evt.data.name, time: tl.frames[i] as number })
      }
    }
    return markers
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

  onEvent(cb: (e: SpineEvent) => void): () => void {
    if (!this._spine) return () => {}
    const listener: AnimationStateListener = {
      event: (entry, event) => {
        cb({
          trackIndex: entry.trackIndex,
          time: event.time,
          name: event.data.name ?? '',
          intValue: event.intValue,
          floatValue: event.floatValue,
          stringValue: event.stringValue ?? '',
        })
      },
    }
    this._spine.state.addListener(listener)
    const unsub = () => this._spine?.state.removeListener(listener)
    this._eventUnsubscribers.push(unsub)
    return unsub
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spine42MeshVertexCount(att: any): number | undefined {
  const typeName: string = att?.constructor?.name ?? ''
  const isMesh = /mesh/i.test(typeName) || att?.triangles != null
  if (!isMesh) return undefined
  return att.worldVerticesLength != null ? att.worldVerticesLength / 2 : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyAttachment(att: any): AttachmentInfo['type'] {
  if (!att) return 'other'
  // Primary: constructor name (works in dev; mangled to 1-2 chars by minifier in prod)
  const name = att.constructor?.name ?? ''
  if (/Region/i.test(name))      return 'region'
  if (/Mesh/i.test(name))        return 'mesh'
  if (/Clipping/i.test(name))    return 'clipping'
  if (/Point/i.test(name))       return 'point'
  if (/BoundingBox/i.test(name)) return 'boundingbox'
  if (/Path/i.test(name))        return 'path'
  // Fallback: duck-type by property shape (production minified builds)
  if (att.endSlot  !== undefined)             return 'clipping'  // ClippingAttachment.endSlot
  if (att.triangles != null)                  return 'mesh'      // MeshAttachment.triangles
  if (att.lengths   != null)                  return 'path'      // PathAttachment.lengths
  if (att.width     != null)                  return 'region'    // RegionAttachment.width/height
  if (att.x         != null && att.y != null) return 'point'     // PointAttachment.x/y
  return 'other'
}
