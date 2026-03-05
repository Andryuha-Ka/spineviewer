import * as PIXI from 'pixi8'
import {
  Spine, SpineTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonBinary,
} from '@esotericsoftware/spine-pixi-v8'
import {
  TextureAtlas,
  type AnimationStateListener,
} from '@esotericsoftware/spine-core'
import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, TrackQueueEntry, BoneTransform, AttachmentInfo, SpineEvent,
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
  private _container: PIXI.Container | null = null
  private _eventUnsubscribers: Array<() => void> = []

  // ── Load ───────────────────────────────────────────────────────────────────

  async load(fileSet: FileSet): Promise<void> {
    // 1. Load PIXI 8 textures from DataURLs
    const textureMap = new Map<string, PIXI.Texture>()
    await Promise.all(fileSet.images.map(async img => {
      const tex = PIXI.Texture.from(img.fileBody as string)
      await waitForPixi8Texture(tex)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const combined = new (this._spine.skeleton.data.findSkin('default') as any).constructor('combined')
    for (const name of names) {
      const skin = this._spine.skeleton.data.findSkin(name)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (skin) (combined as any).addSkin(skin)
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
    return this._spine.skeleton.bones.map(b => ({
      name: b.data.name,
      x: b.worldX,
      y: b.worldY,
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

async function waitForPixi8Texture(tex: PIXI.Texture): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = (tex as any).source
  if (!src || src.loaded) return
  await new Promise<void>((resolve, reject) => {
    src.once('loaded', resolve)
    src.once('error', () => reject(new Error('Texture load failed')))
    // Fallback for DataURLs which may load synchronously
    setTimeout(resolve, 2000)
  })
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
