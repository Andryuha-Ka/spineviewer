/**
 * @file BasePixi7Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as PIXI from 'pixi.js'
import { buildImageResolver, waitForPixi7Textures } from '@/core/utils/buildImageResolver'
import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, TrackQueueEntry, BoneTransform, BoneLocalTransform, AttachmentInfo, SpineEvent,
  AnimationEventMarker, SlotBounds,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// TODO: replace with @pixi-spine typed module when available
type AnySpineModule = Record<string, any>

/**
 * Shared implementation for @pixi-spine/all-3.8 / 4.0 / 4.1 adapters.
 * Subclasses inject the appropriate module via `spineModule`.
 */
export abstract class BasePixi7Adapter implements ISpineAdapter {
  abstract readonly detectedVersion: string
  protected abstract get spineModule(): AnySpineModule

  // Mutable — assigned in load(); satisfy ISpineAdapter readonly via structural typing
  animations: string[] = []
  skins: string[] = []
  bones: BoneInfo[] = []
  slots: SlotInfo[] = []
  events: EventInfo[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _spine: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _skeletonData: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _container: any = null
  private _eventUnsubscribers: Array<() => void> = []
  private _phLabels: Array<{
    text: PIXI.Text
    kind: 'bone' | 'slot'
    name: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parent: any          // current direct parent of text (changes when re-parented in tick)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slotRoot: any | null // slotContainers[idx] — root of the slot hierarchy for re-parenting
    needsTick: boolean
  }> = []
  private _phImages: Map<string, PIXI.Sprite> = new Map() // imageId → Sprite

  // ── Load ────────────────────────────────────────────────────────────────────

  async load(fileSet: FileSet): Promise<void> {
    const mod = this.spineModule

    // 1. Create PIXI 7 textures from DataURLs; wait for them to be ready
    const { textureMap, resolver } = buildImageResolver(
      fileSet.images,
      (dataUrl) => PIXI.Texture.from(dataUrl),
    )
    await waitForPixi7Textures(textureMap.values())

    // 2. Build TextureAtlas with our resolver
    const atlas = new mod.TextureAtlas(fileSet.atlas.fileBody as string, resolver)

    // 3. Parse skeleton
    const loader = new mod.AtlasAttachmentLoader(atlas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let skeletonData: any

    if (fileSet.skeleton.type === 'skeleton-json') {
      const reader = new mod.SkeletonJson(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(
        JSON.parse(fileSet.skeleton.fileBody as string),
      )
    } else {
      const reader = new mod.SkeletonBinary(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(
        new Uint8Array(fileSet.skeleton.fileBody as ArrayBuffer),
      )
    }

    // 4. Create Spine display object
    this._skeletonData = skeletonData
    this._spine = new mod.Spine(skeletonData)

    // 5. Fill public metadata
    this.animations = skeletonData.animations.map((a: AnySpineModule) => a.name)
    this.skins      = skeletonData.skins.map((s: AnySpineModule) => s.name)
    this.bones      = skeletonData.bones.map((b: AnySpineModule) => ({
      name: b.name,
      parent: b.parent?.name ?? null,
    }))
    this.slots      = skeletonData.slots.map((s: AnySpineModule) => ({
      name: s.name,
      bone: s.boneData.name,
      blendMode: s.blendMode,
    }))
    this.events     = (skeletonData.events ?? []).map((e: AnySpineModule) => ({
      name: e.name,
      intValue: e.intValue ?? 0,
      floatValue: e.floatValue ?? 0,
      stringValue: e.stringValue ?? '',
    }))
  }

  // ── Mount ───────────────────────────────────────────────────────────────────

  mount(container: unknown): void {
    if (!this._spine) throw new Error('Call load() before mount()')
    const stage = container as PIXI.Container
    this._container = stage
    stage.addChild(this._spine)
    this._nameSlotContainers()
  }

  private _nameSlotContainers(): void {
    if (!this._spine) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slots = this._spine.skeleton.slots as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containers = (this._spine as any).slotContainers as any[] | undefined
    if (!Array.isArray(containers)) return
    for (let i = 0; i < slots.length; i++) {
      if (!containers[i]) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const att = (slots[i] as any).attachment
      containers[i].name = att?.name ?? ''
    }
  }

  // ── Destroy ─────────────────────────────────────────────────────────────────

  destroy(): void {
    this._eventUnsubscribers.forEach(fn => fn())
    this._eventUnsubscribers = []
    for (const sprite of this._phImages.values()) {
      sprite.destroy({ texture: true, baseTexture: true })
    }
    this._phImages.clear()
    this.clearPlaceholderLabels()
    if (this._container && this._spine) {
      this._container.removeChild(this._spine)
    }
    this._spine?.destroy()
    this._spine = null
    this._container = null
  }

  // ── Animation ───────────────────────────────────────────────────────────────

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

  // ── Skeleton ─────────────────────────────────────────────────────────────────

  setSkin(name: string): void {
    if (!this._spine) return
    this._spine.skeleton.setSkinByName(name)
    this._spine.skeleton.setSlotsToSetupPose()
  }

  setSkins(names: string[]): void {
    if (!this._spine || names.length === 0) return
    if (names.length === 1) { this.setSkin(names[0]); return }

    // Spine 4.x only: compose multiple skins via Skin.addSkin
    try {
      const combined = new this.spineModule.Skin('combined')
      for (const name of names) {
        const skin = this._spine.skeleton.data.findSkin(name)
        if (skin) combined.addSkin(skin)
      }
      this._spine.skeleton.setSkin(combined)
      this._spine.skeleton.setSlotsToSetupPose()
    } catch {
      // Fallback for 3.8 (no addSkin) — apply first skin
      this.setSkin(names[0])
    }
  }

  setToSetupPose(): void { this._spine?.skeleton.setToSetupPose() }
  setBonesToSetupPose(): void { this._spine?.skeleton.setBonesToSetupPose() }
  setSlotsToSetupPose(): void { this._spine?.skeleton.setSlotsToSetupPose() }

  // ── Live data ───────────────────────────────────────────────────────────────

  getTrackStates(): TrackState[] {
    if (!this._spine) return []
    const result: TrackState[] = []
    for (let i = 0; i < 12; i++) {
      const e = this._spine.state.getCurrent(i)
      if (!e) continue
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
    // pixi-spine uses yDown=true: bone.matrix.ty is negated (Pixi Y-down space).
    // Negate Y to return Spine Y-up coordinates, consistent with Spine42Adapter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._spine.skeleton.bones.map((b: any) => ({
      name: b.data.name,
      x: b.worldX ?? 0,
      y: -(b.worldY ?? 0),
      rotation: b.worldRotation ?? 0,
      scaleX: b.scaleX ?? b.worldScaleX ?? 1,
      scaleY: b.scaleY ?? b.worldScaleY ?? 1,
    }))
  }

  getActiveAttachments(): AttachmentInfo[] {
    if (!this._spine) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._spine.skeleton.slots
      .filter((s: any) => s.attachment !== null)
      .map((s: any) => ({
        slotName: s.data.name,
        attachmentName: s.attachment?.name ?? '',
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const atts: any = skin.attachments
      if (Array.isArray(atts)) {
        // spine 4.x: Array<Map<string, att>> indexed by slot index
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
      } else if (typeof atts === 'object' && atts) {
        // spine 3.8: { [slotIdx]: { [attName]: att } }
        for (const [slotIdxStr, slotAtts] of Object.entries(atts)) {
          const slotIdx = parseInt(slotIdxStr, 10)
          const slotName: string = slots[slotIdx]?.name ?? `slot_${slotIdx}`
          for (const [attName, att] of Object.entries(slotAtts as object)) {
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

  getAnimationDuration(animationName: string): number | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anim = this._skeletonData?.animations?.find((a: any) => a.name === animationName)
    return anim?.duration ?? null
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
    // spine 4.x MeshAttachment.computeWorldVertices has 6 declared params,
    // spine 3.8 MeshAttachment has 4 — use Function.length to distinguish
    const fnLen: number = att.computeWorldVertices.length

    // pixi-spine never calls updateOffset()/updateRegion() during normal sprite rendering
    // (it uses PIXI.Sprite/Mesh directly). We must call it ourselves so the offset[] corners
    // are filled before invoking computeWorldVertices.
    //  • spine 3.8 / 4.0 → uses updateOffset()
    //  • spine 4.1       → uses updateRegion() (updateOffset does not exist on _RegionAttachment)
    if (!isMesh) {
      try {
        if (typeof att.updateOffset === 'function') att.updateOffset()
        else if (typeof att.updateRegion === 'function') att.updateRegion()
      } catch { /* region may be null for sequence attachments; computeWorldVertices will also fail */ }
    }

    try {
      if (isMesh) {
        if (fnLen >= 6) {
          // spine 4.x: (slot, start, count, out, offset, stride)
          att.computeWorldVertices(slot, 0, count, verts, 0, 2)
        } else {
          // spine 3.8: (slot, out, offset, stride)
          att.computeWorldVertices(slot, verts, 0, 2)
        }
      } else {
        // RegionAttachment — both versions have 4 params:
        //   spine 4.x: (slot, out, offset, stride)
        //   spine 3.8: (bone, out, offset, stride)
        // Try slot first; if result is NaN, spine 3.8 needs bone instead
        att.computeWorldVertices(slot, verts, 0, 2)
        if (!isFinite(verts[0])) {
          verts.fill(0)
          att.computeWorldVertices(slot.bone, verts, 0, 2)
        }
      }
    } catch {
      return null
    }

    // pixi-spine yDown=true: vertices are in Pixi Y-down space. Negate Y to normalise
    // to Spine Y-up so the caller can use the same formula as for Spine42Adapter.
    for (let i = 1; i < count; i += 2) verts[i] = -verts[i]
    return vertsToAABB(verts, count)
  }

  // ── Free bones ──────────────────────────────────────────────────────────────

  getFreeBones(): string[] {
    if (!this._skeletonData) return []
    const animated = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const anim of this._skeletonData.animations ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const tl of anim.timelines ?? []) {
        // spine 4.x: BoneTimeline has boneIndex (number) → look up name in skeletonData.bones
        if (typeof tl.boneIndex === 'number') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bd = (this._skeletonData.bones as any[])[tl.boneIndex]
          if (bd?.name) animated.add(bd.name)
        }
        // spine 3.8: BoneTimeline has bone.name directly (BoneData reference)
        if (tl.bone?.name) animated.add(tl.bone.name)
      }
    }
    return this.bones.filter(b => !animated.has(b.name)).map(b => b.name)
  }

  setBoneLocalTransform(boneName: string, transform: Partial<BoneLocalTransform>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bone: any = this._spine?.skeleton.findBone(boneName)
    if (!bone) return
    if (transform.x        !== undefined) bone.x        = transform.x
    if (transform.y        !== undefined) bone.y        = transform.y
    if (transform.rotation !== undefined) bone.rotation = transform.rotation
    if (transform.scaleX   !== undefined) bone.scaleX   = transform.scaleX
    if (transform.scaleY   !== undefined) bone.scaleY   = transform.scaleY
  }

  getBoneSetupTransform(boneName: string): BoneLocalTransform | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bd = (this._skeletonData?.bones as any[])?.find((b: any) => b.name === boneName)
    if (!bd) return null
    return { x: bd.x ?? 0, y: bd.y ?? 0, rotation: bd.rotation ?? 0, scaleX: bd.scaleX ?? 1, scaleY: bd.scaleY ?? 1 }
  }

  // ── Placeholder labels ───────────────────────────────────────────────────────

  setPlaceholderLabels(items: Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>): void {
    this.clearPlaceholderLabels()
    if (!this._spine) return
    const style = new PIXI.TextStyle({
      fontSize: 11,
      fill: 0xfbbf24,
      stroke: '#000000',
      strokeThickness: 3,
      fontFamily: 'monospace',
    })
    // If a slot and a bone share the same name, prefer slot (it has its own container)
    const slotNames = new Set(items.filter(i => i.kind === 'slot').map(i => i.name))
    for (const item of items) {
      if (item.kind === 'attachment') continue
      if (item.kind === 'bone' && slotNames.has(item.name)) continue
      const text = new PIXI.Text(item.name, style)
      text.anchor.set(0.5, 0.5)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parent: any = this._spine
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let slotRoot: any | null = null
      let needsTick = true

      if (item.kind === 'slot') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slotIdx = (this._spine.skeleton.slots as any[]).findIndex((s: any) => s.data.name === item.name)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slotCont = (this._spine.slotContainers as any[])?.[slotIdx]
        if (slotCont) {
          slotRoot = slotCont
          // Best-effort initial target; tick will re-parent once @pixi-spine populates children
          parent = findDeepestTarget(slotCont)
          needsTick = false
          text.position.set(0, 0)
        }
      }

      parent.addChild(text)
      this._phLabels.push({ text, kind: item.kind, name: item.name, parent, slotRoot, needsTick })
    }
    this.tickPlaceholderLabels()
  }

  clearPlaceholderLabels(): void {
    for (const entry of this._phLabels) {
      // Use text.parent for removal — handles the case where we re-parented in tick
      entry.text.parent?.removeChild(entry.text)
      entry.text.destroy()
    }
    this._phLabels = []
  }

  tickPlaceholderLabels(): void {
    if (!this._spine || !this._phLabels.length) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skeleton = this._spine.skeleton as any
    for (const entry of this._phLabels) {
      if (entry.needsTick) {
        // Bone-based: manually update position each frame
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bone: any = entry.kind === 'bone'
          ? skeleton.findBone(entry.name)
          : skeleton.findSlot(entry.name)?.bone
        if (bone) {
          entry.text.x = bone.worldX ?? 0
          entry.text.y = bone.worldY ?? 0
        }
      } else if (entry.slotRoot) {
        // Slot-based: re-parent to deepest visible child if hierarchy changed.
        // @pixi-spine populates slotContainers AFTER we call setPlaceholderLabels,
        // so the initial parent may be the slot root itself. Re-parent each tick
        // until we reach the true deepest node.
        const deepest = findDeepestTarget(entry.slotRoot)
        if (deepest !== entry.parent) {
          entry.parent.removeChild(entry.text)
          entry.parent = deepest
          entry.text.position.set(0, 0)
          deepest.addChild(entry.text)
        }
      }
    }
  }

  addImageToPlaceholder(placeholderName: string, dataURL: string, imageId: string): void {
    if (!this._spine) return
    if (this._phImages.has(imageId)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slotIdx = (this._spine.skeleton.slots as any[]).findIndex((s: any) => s.data.name === placeholderName)
    if (slotIdx === -1) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const container = (this._spine as any).slotContainers?.[slotIdx]
    if (!container) return
    // Create a non-cached texture so destroying one sprite's texture
    // cannot affect sprites in other (e.g. pinned) adapters that use the same dataURL.
    const img = new Image()
    img.src = dataURL
    const baseTexture = new PIXI.BaseTexture(img)
    const texture = new PIXI.Texture(baseTexture)
    const sprite = new PIXI.Sprite(texture)
    sprite.anchor.set(0.5, 0.5)
    sprite.x = 0
    sprite.y = 0
    // Mark as a user-added image so findDeepestTarget skips traversal into it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(sprite as any).__phImage = true
    findDeepestTarget(container).addChild(sprite)
    this._phImages.set(imageId, sprite)
  }

  removeImageFromPlaceholder(_placeholderName: string, imageId: string): void {
    const sprite = this._phImages.get(imageId)
    if (!sprite) return
    sprite.parent?.removeChild(sprite)
    sprite.destroy({ texture: true, baseTexture: true })
    this._phImages.delete(imageId)
  }

  setImageTransform(imageId: string, posX: number, posY: number, scale: number): void {
    const sprite = this._phImages.get(imageId)
    if (!sprite) return
    sprite.x = posX
    sprite.y = posY
    sprite.scale.set(scale)
  }

  getImageContainerWorldTransform(imageId: string): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null {
    const sprite = this._phImages.get(imageId)
    if (!sprite?.parent) return null
    const m = sprite.parent.worldTransform
    return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty }
  }

  onEvent(cb: (e: SpineEvent) => void): () => void {
    if (!this._spine) return () => {}
    const listener = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: (entry: any, event: any) => {
        cb({
          trackIndex: entry.trackIndex,
          time: event.time,
          name: event.data.name,
          intValue: event.intValue ?? 0,
          floatValue: event.floatValue ?? 0,
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

/**
 * Traverse the display tree from `node` and return the deepest child
 * that has no further eligible Container children (leaf node).
 * Skips PIXI.Text and nodes marked __phImage (user-added image sprites)
 * so labels and subsequent images are not traversed into already-added sprites.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDeepestTarget(node: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible: any[] = (node.children ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => Array.isArray(c.children) && !(c instanceof PIXI.Text) && !c.__phImage && c.visible !== false,
  )
  if (eligible.length === 0) return node
  return findDeepestTarget(eligible[0])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meshVertexCount(att: any): number | undefined {
  const typeName: string = att?.constructor?.name ?? ''
  const isMesh = /mesh/i.test(typeName) || att?.triangles != null
  if (!isMesh) return undefined
  return att.worldVerticesLength != null ? att.worldVerticesLength / 2 : undefined
}

function vertsToAABB(verts: Float32Array, count: number): SlotBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < count; i += 2) {
    const x = verts[i], y = verts[i + 1]
    if (!isFinite(x) || !isFinite(y)) return null
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null
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
