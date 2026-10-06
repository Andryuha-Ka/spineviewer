/**
 * @file BasePixi8Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as PIXI from 'pixi8'
import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, TrackQueueEntry, BoneTransform, BoneLocalTransform, AttachmentInfo, SpineEvent,
  AnimationEventMarker, SlotBounds, TrackMixOptions,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import { applyEntryMixDuration } from '@/core/utils/slotState'

/** Track entry fields the base reads and writes; identical on the 4.2 and 4.3 runtimes. */
export interface Pixi8TrackEntry {
  animation: { name: string; duration: number } | null
  trackTime: number
  loop: boolean
  timeScale: number
  mixDuration: number
  delay: number
  next: Pixi8TrackEntry | null
}

interface Pixi8StateListener {
  event?: (
    entry: { trackIndex: number },
    event: { time: number; data: { name: string }; intValue: number; floatValue: number; stringValue: string | null },
  ) => void
}

/** Shape of a spine-pixi-v8 `Spine` object that the base touches without casts. */
export interface Pixi8SpineLike {
  state: {
    timeScale: number
    setAnimation(track: number, name: string, loop: boolean): Pixi8TrackEntry
    addAnimation(track: number, name: string, loop: boolean, delay: number): Pixi8TrackEntry
    clearTrack(track: number): void
    clearTracks(): void
    addListener(listener: Pixi8StateListener): void
    removeListener(listener: Pixi8StateListener): void
  }
  skeleton: { slots: ReadonlyArray<{ data: { name: string }; attachment?: { name: string } | null }> }
  destroy(): void
}

/** Label sprite pose in Pixi space (Y-down, CW radians), relative to the Spine container. */
export interface Pixi8LabelPose { x: number; y: number; rotation: number }

/**
 * Shared Pixi 8 implementation for spine-pixi-v8 adapters.
 * Subclasses own the runtime: `load`, skins, setup pose, bone/attachment queries and the hooks.
 */
export abstract class BasePixi8Adapter<TSpine extends Pixi8SpineLike> implements ISpineAdapter {
  abstract readonly detectedVersion: string

  animations: string[] = []
  skins: string[] = []
  bones: BoneInfo[] = []
  slots: SlotInfo[] = []
  events: EventInfo[] = []

  protected _spine: TSpine | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _skeletonData: any = null
  private _container: PIXI.Container | null = null
  private _eventUnsubscribers: Array<() => void> = []

  // ── Placeholder markers (PIXI.Sprite, textures generated via native Canvas 2D) ─
  private _phMarkers: Array<{
    sprite: PIXI.Sprite
    boneName: string
    isSlot: boolean
    slotName?: string
  }> = []
  /** Per-label-name texture cache — reused across setPlaceholderLabels calls. */
  private _phTextures = new Map<string, PIXI.Texture>()
  private _phImageSprites: Map<string, PIXI.Sprite> = new Map() // imageId → Sprite
  private _phSlotContainers: Map<string, PIXI.Container> = new Map() // phName → slot-following container
  // Dedicated sub-containers inside slot containers — images and child spines mount here, not directly into the slot object.
  // Keeps child Spine objects separate from the addSlotObject mechanism to avoid render pipeline conflicts.
  private _phChildContainers: Map<string, PIXI.Container> = new Map() // phName → images + child spines
  private _mixDurations = new Map<number, number>() // track → crossfade seconds

  // ── Runtime hooks ──────────────────────────────────────────────────────────

  abstract load(fileSet: FileSet): Promise<void>
  abstract setSkin(name: string): void
  abstract setSkins(names: string[]): void
  abstract setToSetupPose(): void
  abstract setBonesToSetupPose(): void
  abstract setSlotsToSetupPose(): void
  abstract getBoneTransforms(): BoneTransform[]
  abstract getActiveAttachments(): AttachmentInfo[]
  abstract getAllAttachments(): AttachmentInfo[]
  abstract getSlotBounds(slotName: string): SlotBounds | null
  abstract getFreeBones(): string[]
  abstract setBoneLocalTransform(boneName: string, transform: Partial<BoneLocalTransform>): void
  abstract getBoneSetupTransform(boneName: string): BoneLocalTransform | null

  /** Current entry of `track`, or null when the track is empty or nothing is loaded. */
  protected abstract _trackEntry(track: number): Pixi8TrackEntry | null
  /** Pose of the label sprite for `boneName`, or null when the bone does not exist. */
  protected abstract _labelPose(boneName: string): Pixi8LabelPose | null
  /** Alpha of the slot label for `slotName` (1 when the slot does not exist). */
  protected abstract _slotAlpha(slotName: string): number

  // ── Load ───────────────────────────────────────────────────────────────────

  protected async _loadTextures(fileSet: FileSet): Promise<Map<string, PIXI.Texture>> {
    // Load images via HTMLImageElement first, then create Pixi 8 textures.
    // Texture.from(dataUrl) in Pixi v8 starts loading asynchronously and the
    // 'loaded' event is named 'update' — skipping that entirely by pre-loading
    // the image guarantees tex.source.resource is set before SpineTexture.from().
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
    return textureMap
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  mount(container: unknown): void {
    if (!this._spine) throw new Error('Call load() before mount()')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = container as any
    this._container = stage
    stage.addChild(this._spine)
    this._nameSlotContainers()
  }

  private _nameSlotContainers(): void {
    if (!this._spine) return
    const slots = this._spine.skeleton.slots
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containers = (this._spine as any).slotContainers as any[] | undefined
    if (!Array.isArray(containers)) return
    for (let i = 0; i < slots.length; i++) {
      if (!containers[i]) continue
      const att = slots[i].attachment
      containers[i].name = att?.name ?? ''
    }
  }

  // ── Destroy ────────────────────────────────────────────────────────────────

  destroy(): void {
    this._eventUnsubscribers.forEach(fn => fn())
    this._eventUnsubscribers = []
    for (const sprite of this._phImageSprites.values()) {
      sprite.destroy({ texture: true })
    }
    this._phImageSprites.clear()
    this._phSlotContainers.clear()
    this._phChildContainers.clear()
    this._mixDurations.clear()
    this.clearPlaceholderLabels()
    for (const tex of this._phTextures.values()) tex.destroy(true)
    this._phTextures.clear()
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
    const entry = this._spine?.state.setAnimation(track, name, loop)
    if (!entry) return
    applyEntryMixDuration(entry, this._mixDuration(track), false)
    this._onEntry(track, entry)
  }

  addAnimation(track: number, name: string, loop: boolean, delay = 0): void {
    if (!this._spine) return
    const queued = this._trackEntry(track) != null
    const entry = this._spine.state.addAnimation(track, name, loop, delay)
    applyEntryMixDuration(entry, this._mixDuration(track), queued && delay <= 0)
    this._onEntry(track, entry)
  }

  setTrackMixOptions(track: number, opts: Partial<TrackMixOptions>): void {
    if (opts.mixDuration === undefined) return
    const mix = Math.max(0, opts.mixDuration)
    this._mixDurations.set(track, mix)
    for (let e = this._trackEntry(track)?.next; e; e = e.next) {
      applyEntryMixDuration(e, mix, true)
      this._onEntry(track, e)
    }
  }

  /** Called for every entry the base sets, queues or re-times on `track`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected _onEntry(_track: number, _entry: Pixi8TrackEntry): void {}

  private _mixDuration(track: number): number {
    return this._mixDurations.get(track) ?? 0
  }

  clearTrack(track: number): void { this._spine?.state.clearTrack(track) }
  clearTracks(): void { this._spine?.state.clearTracks() }

  setTimeScale(scale: number): void {
    if (this._spine) this._spine.state.timeScale = scale
  }

  setTrackTimeScale(track: number, scale: number): void {
    const entry = this._trackEntry(track)
    if (entry) entry.timeScale = scale
  }

  setTrackLoop(track: number, loop: boolean): void {
    const entry = this._trackEntry(track)
    if (entry) entry.loop = loop
  }

  removeQueueEntry(track: number, index: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prev: any = this._trackEntry(track)
    if (!prev) return
    for (let i = 0; i < index; i++) {
      if (!prev.next) return
      prev = prev.next
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (prev.next) prev.next = (prev.next as any).next ?? null
  }

  seekTo(track: number, time: number): void {
    const entry = this._trackEntry(track)
    if (entry) entry.trackTime = time
  }

  // ── Live data ──────────────────────────────────────────────────────────────

  getTrackStates(): TrackState[] {
    if (!this._spine) return []
    const result: TrackState[] = []
    for (let i = 0; i < 12; i++) {
      const e = this._trackEntry(i)
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
        mixDuration: this._mixDuration(i),
      })
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

  // ── Placeholder labels ─────────────────────────────────────────────────────
  // Pixi8: PIXI.Sprite markers generated from a native-canvas texture (bypasses
  // Pixi8's CanvasTextGenerator / getCanvasFillStyle pipeline → no createPattern crash).
  // Markers are added as children of the Spine container so the scene graph handles
  // coordinate transforms automatically (no manual world→screen conversion needed here).

  setPlaceholderLabels(items: Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>): void {
    if (!this._spine) return
    this.clearPlaceholderLabels()

    for (const item of items) {
      if (item.kind === 'attachment') continue
      let boneName: string
      let slotName: string | undefined
      if (item.kind === 'bone') {
        boneName = item.name
      } else {
        const slotDef = this.slots.find(s => s.name === item.name)
        if (!slotDef) continue
        boneName = slotDef.bone
        slotName = item.name
      }
      const texture = this._getOrCreateLabelTexture(item.name)
      const sprite = new PIXI.Sprite(texture)
      sprite.anchor.set(0.5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this._spine as any).addChild(sprite)
      this._phMarkers.push({ sprite, boneName, isSlot: item.kind === 'slot', slotName })
    }
  }

  clearPlaceholderLabels(): void {
    for (const m of this._phMarkers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this._spine as any)?.removeChild(m.sprite)
      m.sprite.destroy({ texture: false }) // textures are cached in _phTextures — don't destroy here
    }
    this._phMarkers = []
  }

  tickPlaceholderLabels(): void {
    if (!this._spine || !this._phMarkers.length) return

    for (const m of this._phMarkers) {
      const pose = this._labelPose(m.boneName)
      if (!pose) { m.sprite.visible = false; continue }

      m.sprite.visible = true
      m.sprite.x = pose.x
      m.sprite.y = pose.y
      m.sprite.rotation = pose.rotation
      // No manual scale — sprite inherits the Spine container's zoom automatically.

      if (m.isSlot && m.slotName) {
        m.sprite.alpha = this._slotAlpha(m.slotName)
      } else {
        m.sprite.alpha = 1
      }
    }
  }

  /**
   * Generates (or returns cached) a label texture for the given name.
   * Uses native Canvas 2D — bypasses Pixi8's TextStyle / getCanvasFillStyle pipeline entirely.
   * Transparent background, text centered, amber color.
   */
  private _getOrCreateLabelTexture(name: string): PIXI.Texture {
    const cached = this._phTextures.get(name)
    if (cached) return cached

    const font = 'bold 11px monospace'
    // Measure text width before setting canvas size (canvas context resets on resize)
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = font
    const textW = probe.measureText(name).width

    const stroke = 3
    const canvas = document.createElement('canvas')
    canvas.width  = Math.ceil(textW) + 10 + stroke * 2
    canvas.height = 18 + stroke * 2
    const ctx = canvas.getContext('2d')!
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    // Draw stroke first so fill renders on top
    ctx.lineWidth = stroke * 2  // strokeText strokes outward + inward, so double for clean outline
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    ctx.strokeText(name, cx, cy)
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(name, cx, cy)

    const tex = PIXI.Texture.from(canvas)
    this._phTextures.set(name, tex)
    return tex
  }

  addImageToPlaceholder(placeholderName: string, dataURL: string, imageId: string): void {
    if (!this._spine) return
    if (this._phImageSprites.has(imageId)) return
    const phContainer = this.getPlaceholderContainer(placeholderName) as PIXI.Container | null
    if (!phContainer) return

    // Register sprite immediately so removeImageFromPlaceholder can find it.
    // Texture.from(dataURL) in Pixi8 loads asynchronously — assign texture via
    // HTMLImageElement.onload to guarantee it is visible on the first render frame.
    const sprite = new PIXI.Sprite()
    sprite.anchor.set(0.5, 0.5)
    sprite.x = 0
    sprite.y = 0
    sprite.zIndex = phContainer.children.length
    phContainer.addChild(sprite)
    this._phImageSprites.set(imageId, sprite)

    const img = new Image()
    img.onload = () => {
      if (this._phImageSprites.has(imageId)) {
        sprite.texture = PIXI.Texture.from(img)
      }
    }
    img.src = dataURL
  }

  removeImageFromPlaceholder(_placeholderName: string, imageId: string): void {
    const sprite = this._phImageSprites.get(imageId)
    if (!sprite) return
    sprite.parent?.removeChild(sprite)
    sprite.destroy({ texture: true })
    this._phImageSprites.delete(imageId)
  }

  setImageTransform(imageId: string, posX: number, posY: number, scale: number): void {
    const sprite = this._phImageSprites.get(imageId)
    if (!sprite) return
    sprite.x = posX
    sprite.y = posY
    sprite.scale.set(scale)
  }

  getImageContainerWorldTransform(imageId: string): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null {
    const sprite = this._phImageSprites.get(imageId)
    if (!sprite?.parent) return null
    const m = sprite.parent.worldTransform
    return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty }
  }

  setImageZIndex(imageId: string, zIndex: number): void {
    const sprite = this._phImageSprites.get(imageId)
    if (sprite) sprite.zIndex = zIndex
  }

  getImageAtCanvasPoint(x: number, y: number): string | null {
    // Pixi 8 containsPoint is unreliable without eventMode — use getBounds() AABB instead,
    // matching the same approach used for child-spine hit detection in Priority 2b.
    let topId: string | null = null
    let topZ = -Infinity
    for (const [imageId, sprite] of this._phImageSprites) {
      if (sprite.zIndex <= topZ) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: Record<string, number> = sprite.getBounds() as any
        const bx = b['x'] !== undefined ? b['x'] : (b['minX'] ?? 0)
        const by = b['y'] !== undefined ? b['y'] : (b['minY'] ?? 0)
        const bw = b['width'] !== undefined ? b['width'] : ((b['maxX'] ?? bx) - bx)
        const bh = b['height'] !== undefined ? b['height'] : ((b['maxY'] ?? by) - by)
        if (bw > 0 && bh > 0 && x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
          topId = imageId
          topZ = sprite.zIndex
        }
      } catch { /* skip sprites with invalid/unloaded bounds */ }
    }
    return topId
  }

  onEvent(cb: (e: SpineEvent) => void): () => void {
    if (!this._spine) return () => {}
    const listener: Pixi8StateListener = {
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

  getSpineObject(): unknown | null { return this._spine }

  getPlaceholderContainer(phName: string): unknown | null {
    if (!this._spine) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slotExists = (this._spine.skeleton.slots as any[]).some((s: any) => s.data.name === phName)
    if (!slotExists) return null

    // Ensure the parent slot-following container exists (shared with images).
    let slotContainer = this._phSlotContainers.get(phName)
    if (!slotContainer) {
      slotContainer = new PIXI.Container()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this._spine as any).addSlotObject(phName, slotContainer)
      this._phSlotContainers.set(phName, slotContainer)
    }

    // Dedicated sub-container shared by images and child spines, so the addSlotObject
    // mechanism never processes a child Spine's internal hierarchy.
    let childContainer = this._phChildContainers.get(phName)
    if (!childContainer) {
      childContainer = new PIXI.Container()
      childContainer.sortableChildren = true
      slotContainer.addChild(childContainer)
      this._phChildContainers.set(phName, childContainer)
    }
    return childContainer
  }

  getPlaceholderContainerWorldTransform(phName: string): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null {
    const container = this.getPlaceholderContainer(phName) as PIXI.Container | null
    if (!container) return null
    const m = container.worldTransform
    return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function meshVertexCount(att: any): number | undefined {
  const typeName: string = att?.constructor?.name ?? ''
  const isMesh = /mesh/i.test(typeName) || att?.triangles != null
  if (!isMesh) return undefined
  return att.worldVerticesLength != null ? att.worldVerticesLength / 2 : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyAttachment(att: any): AttachmentInfo['type'] {
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
