import * as PIXI from 'pixi7'
import { buildImageResolver, waitForPixi7Textures } from '@/core/utils/buildImageResolver'
import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, TrackQueueEntry, BoneTransform, AttachmentInfo, SpineEvent,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  private _container: any = null
  private _eventUnsubscribers: Array<() => void> = []

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

    // Start first animation
    if (this.animations.length > 0) {
      this._spine.state.setAnimation(0, this.animations[0], true)
    }
  }

  // ── Destroy ─────────────────────────────────────────────────────────────────

  destroy(): void {
    this._eventUnsubscribers.forEach(fn => fn())
    this._eventUnsubscribers = []
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._spine.skeleton.bones.map((b: any) => ({
      name: b.data.name,
      x: b.worldX ?? 0,
      y: b.worldY ?? 0,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyAttachment(att: any): AttachmentInfo['type'] {
  const name = att?.constructor?.name ?? ''
  if (/Region/i.test(name)) return 'region'
  if (/Mesh/i.test(name)) return 'mesh'
  if (/Clipping/i.test(name)) return 'clipping'
  if (/Point/i.test(name)) return 'point'
  if (/BoundingBox/i.test(name)) return 'boundingbox'
  if (/Path/i.test(name)) return 'path'
  return 'other'
}
