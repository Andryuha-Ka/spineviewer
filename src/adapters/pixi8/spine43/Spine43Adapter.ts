/**
 * @file Spine43Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import {
  Spine, SpineTexture,
  AtlasAttachmentLoader, SkeletonJson, SkeletonBinary, TextureAtlas, Skin,
  Slider, SliderData, Interpolation, RegionAttachment, VertexAttachment,
  FromRotate, FromX, FromY, FromScaleX, FromScaleY, FromShearY,
  type Bone, type SkeletonData, type TrackEntry, type FromProperty,
} from 'spine-pixi-v8-43'
import type {
  BoneTransform, BoneLocalTransform, AttachmentInfo, SlotBounds,
  SliderInfo, SliderProperty, TrackMixOptions, TrackState,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'
import {
  BasePixi8Adapter, classifyAttachment, meshVertexCount,
  type Pixi8LabelPose, type Pixi8TrackEntry,
} from '../BasePixi8Adapter'

type InterpolationName = 'linear' | 'smooth' | 'slowFast' | 'fastSlow' | 'circle'

// Static Interpolation instances in declaration order (linear, smooth, slowFast, fastSlow, circle).
const MIX_INTERPOLATIONS: readonly string[] = Object.keys(Interpolation)
  .filter(k => (Interpolation as unknown as Record<string, unknown>)[k] instanceof Interpolation)

function interpolationOf(name: string): Interpolation | null {
  if (!MIX_INTERPOLATIONS.includes(name)) return null
  return Interpolation[name as InterpolationName]
}

function interpolationName(value: Interpolation): string {
  return MIX_INTERPOLATIONS.find(k => Interpolation[k as InterpolationName] === value) ?? 'linear'
}

function sliderProperty(p: FromProperty): SliderProperty | null {
  if (p instanceof FromRotate) return 'rotate'
  if (p instanceof FromX) return 'x'
  if (p instanceof FromY) return 'y'
  if (p instanceof FromScaleX) return 'scaleX'
  if (p instanceof FromScaleY) return 'scaleY'
  if (p instanceof FromShearY) return 'shearY'
  return null
}

type TrackCurveOptions = Required<Omit<TrackMixOptions, 'mixDuration'>>

const DEFAULT_TRACK_MIX: TrackCurveOptions = { additive: false, mixInterpolation: 'linear' }

export default class Spine43Adapter extends BasePixi8Adapter<Spine> {
  readonly detectedVersion = '4.3'
  readonly mixInterpolations = MIX_INTERPOLATIONS

  private _trackMix = new Map<number, TrackCurveOptions>()
  private _sliderOverrides = new Map<string, { time?: number; mix?: number }>()
  /** Driver bones detached while a slider time override is active. */
  private _detachedSliderBones = new Map<string, Bone>()

  // ── Load ───────────────────────────────────────────────────────────────────

  async load(fileSet: FileSet): Promise<void> {
    const textureMap = await this._loadTextures(fileSet)

    const atlas = new TextureAtlas(fileSet.atlas.fileBody as string)
    for (const page of atlas.pages) {
      const name = page.name.split('/').pop() ?? page.name
      const key = [...textureMap.keys()].find(k => k === name || k.endsWith('/' + name))
      if (key) {
        // TODO: remove when spine-pixi-v8-43 typings resolve 'pixi.js' to Pixi 8
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        page.setTexture(SpineTexture.from(textureMap.get(key)!.source as any))
      }
    }

    const loader = new AtlasAttachmentLoader(atlas)
    let skeletonData: SkeletonData
    if (fileSet.skeleton.type === 'skeleton-json') {
      const reader = new SkeletonJson(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(JSON.parse(fileSet.skeleton.fileBody as string))
    } else {
      const reader = new SkeletonBinary(loader)
      reader.scale = 1
      skeletonData = reader.readSkeletonData(new Uint8Array(fileSet.skeleton.fileBody as ArrayBuffer))
    }

    this._skeletonData = skeletonData
    const spine = new Spine({ skeletonData })
    // 4.2 owns the 'spine' pipe; the 4.3 pipe is registered as 'spine43' (registerSpine43Pipe)
    // TODO: remove when the 4.3 typings stop declaring renderPipeId as a readonly literal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(spine as any).renderPipeId = 'spine43'
    // container drag/zoom must not swing physics bones
    spine.skeletonPhysics.setPositionInheritance(0, 0)
    spine.skeletonPhysics.rotationInheritance = 0
    spine.beforeUpdateWorldTransforms = () => this._applySliderOverrides()
    this._spine = spine

    this.animations = skeletonData.animations.map(a => a.name)
    this.skins      = skeletonData.skins.map(s => s.name)
    this.bones      = skeletonData.bones.map(b => ({ name: b.name, parent: b.parent?.name ?? null }))
    this.slots      = skeletonData.slots.map(s => ({ name: s.name, bone: s.boneData.name, blendMode: s.blendMode }))
    this.events     = skeletonData.events.map(e => ({
      name: e.name,
      intValue: e.setupPose.intValue ?? 0,
      floatValue: e.setupPose.floatValue ?? 0,
      stringValue: e.setupPose.stringValue ?? '',
    }))
  }

  destroy(): void {
    this._trackMix.clear()
    this._sliderOverrides.clear()
    this._detachedSliderBones.clear()
    super.destroy()
  }

  // ── Animation (track mix options) ──────────────────────────────────────────

  setTrackMixOptions(track: number, opts: Partial<TrackMixOptions>): void {
    super.setTrackMixOptions(track, opts)
    if (opts.additive === undefined && opts.mixInterpolation === undefined) return
    const prev = this._trackMix.get(track) ?? DEFAULT_TRACK_MIX
    this._trackMix.set(track, {
      additive: opts.additive ?? prev.additive,
      mixInterpolation: opts.mixInterpolation ?? prev.mixInterpolation,
    })
    if (!this._spine) return
    for (let e = this._spine.state.getTrack(track); e; e = e.next) this._applyTrackMix(track, e)
    // hold modes read `additive` only when the animation set changes
    this._spine.state.animationsChanged = true
  }

  getTrackStates(): TrackState[] {
    const states = super.getTrackStates()
    for (const s of states) {
      const e = this._spine?.state.getTrack(s.trackIndex)
      if (!e) continue
      s.additive = e.additive
      s.mixInterpolation = interpolationName(e.mixInterpolation)
    }
    return states
  }

  protected _onEntry(track: number, entry: Pixi8TrackEntry): void {
    this._applyTrackMix(track, entry as TrackEntry)
  }

  private _applyTrackMix(track: number, entry: TrackEntry): void {
    const opts = this._trackMix.get(track)
    if (!opts) return
    entry.additive = opts.additive
    const interp = interpolationOf(opts.mixInterpolation)
    if (interp) entry.setMixInterpolation(interp)
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  setSkin(name: string): void {
    if (!this._spine) return
    this._spine.skeleton.setSkin(name)
    this._spine.skeleton.setupPoseSlots()
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
    this._spine.skeleton.setupPoseSlots()
  }

  setToSetupPose(): void { this._spine?.skeleton.setupPose() }
  setBonesToSetupPose(): void { this._spine?.skeleton.setupPoseBones() }
  setSlotsToSetupPose(): void { this._spine?.skeleton.setupPoseSlots() }

  // ── Live data ──────────────────────────────────────────────────────────────

  getBoneTransforms(): BoneTransform[] {
    if (!this._spine) return []
    // Skeleton.yDown = true: negate Y and rotation back to Spine Y-up, as Spine42Adapter does.
    return this._spine.skeleton.bones.map(b => {
      const p = b.appliedPose
      return {
        name: b.data.name,
        x: p.worldX,
        y: -p.worldY,
        rotation: -p.getWorldRotationX(),
        scaleX: p.getWorldScaleX(),
        scaleY: p.getWorldScaleY(),
      }
    })
  }

  getActiveAttachments(): AttachmentInfo[] {
    if (!this._spine) return []
    const result: AttachmentInfo[] = []
    for (const s of this._spine.skeleton.slots) {
      const att = s.appliedPose.attachment
      if (!att) continue
      result.push({ slotName: s.data.name, attachmentName: att.name, type: classifyAttachment(att) })
    }
    return result
  }

  getAllAttachments(): AttachmentInfo[] {
    const data = this._skeletonData as SkeletonData | null
    if (!data) return []
    const result: AttachmentInfo[] = []
    const seen = new Set<string>()
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const slotName = data.slots[entry.slotIndex]?.name ?? `slot_${entry.slotIndex}`
        const key = `${slotName}::${entry.placeholder}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({
          slotName,
          attachmentName: entry.placeholder,
          type: classifyAttachment(entry.attachment),
          vertexCount: meshVertexCount(entry.attachment),
        })
      }
    }
    return result
  }

  getSlotBounds(slotName: string): SlotBounds | null {
    if (!this._spine) return null
    const skeleton = this._spine.skeleton
    const slot = skeleton.findSlot(slotName)
    const att = slot?.appliedPose.attachment
    if (!slot || !att) return null

    let verts: Float32Array
    try {
      if (att instanceof RegionAttachment) {
        verts = new Float32Array(8)
        att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), verts, 0, 2)
      } else if (att instanceof VertexAttachment) {
        const count = att.worldVerticesLength
        if (count < 2) return null
        verts = new Float32Array(count)
        att.computeWorldVertices(skeleton, slot, 0, count, verts, 0, 2)
      } else {
        return null
      }
    } catch {
      return null
    }

    // Skeleton.yDown = true: negate Y to Spine Y-up, same formula for all adapters.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < verts.length; i += 2) {
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
    const data = this._skeletonData as SkeletonData | null
    if (!data) return []
    const keyed = new Set<number>()
    for (const anim of data.animations) for (const i of anim.bones) keyed.add(i)
    for (const c of data.constraints) {
      if (c instanceof SliderData) for (const i of c.animation.bones) keyed.add(i)
    }
    return data.bones.filter(b => !keyed.has(b.index)).map(b => b.name)
  }

  setBoneLocalTransform(boneName: string, transform: Partial<BoneLocalTransform>): void {
    const pose = this._spine?.skeleton.findBone(boneName)?.pose
    if (!pose) return
    if (transform.x        !== undefined) pose.x        = transform.x
    if (transform.y        !== undefined) pose.y        = transform.y
    if (transform.rotation !== undefined) pose.rotation = transform.rotation
    if (transform.scaleX   !== undefined) pose.scaleX   = transform.scaleX
    if (transform.scaleY   !== undefined) pose.scaleY   = transform.scaleY
  }

  getBoneSetupTransform(boneName: string): BoneLocalTransform | null {
    const sp = (this._skeletonData as SkeletonData | null)?.findBone(boneName)?.setupPose
    if (!sp) return null
    return { x: sp.x, y: sp.y, rotation: sp.rotation, scaleX: sp.scaleX, scaleY: sp.scaleY }
  }

  // ── Sliders ────────────────────────────────────────────────────────────────

  getSliders(): SliderInfo[] {
    if (!this._spine) return []
    const result: SliderInfo[] = []
    for (const c of this._spine.skeleton.constraints) {
      if (!(c instanceof Slider)) continue
      const d = c.data
      result.push({
        name: d.name,
        animation: d.animation.name,
        bone: d.bone?.name ?? null,
        property: d.bone ? sliderProperty(d.property) : null,
        time: c.appliedPose.time,
        mix: c.appliedPose.mix,
        setupTime: d.setupPose.time,
        setupMix: d.setupPose.mix,
        loop: d.loop,
        additive: d.additive,
      })
    }
    return result
  }

  setSliderPose(name: string, pose: Partial<Pick<SliderInfo, 'time' | 'mix'>>): void {
    const slider = this._findSlider(name)
    if (!slider) return
    const override = { ...this._sliderOverrides.get(name), ...pose }
    this._sliderOverrides.set(name, override)
    // a bone-driven slider recomputes time from its bone every frame, so detach the driver
    if (override.time !== undefined && slider.bone && !this._detachedSliderBones.has(name)) {
      this._detachedSliderBones.set(name, slider.bone)
      slider.bone = null
    }
    this._applySliderOverrides()
  }

  resetSlider(name: string): void {
    const slider = this._findSlider(name)
    this._sliderOverrides.delete(name)
    if (!slider) return
    const bone = this._detachedSliderBones.get(name)
    if (bone) {
      slider.bone = bone
      this._detachedSliderBones.delete(name)
      this._spine?.skeleton.updateCache()
    }
    slider.setupPose()
  }

  private _findSlider(name: string): Slider | null {
    return this._spine?.skeleton.findConstraint(name, Slider) ?? null
  }

  private _applySliderOverrides(): void {
    for (const [name, o] of this._sliderOverrides) {
      const slider = this._findSlider(name)
      if (!slider) continue
      if (o.time !== undefined) slider.pose.time = o.time
      if (o.mix !== undefined) slider.pose.mix = o.mix
    }
  }

  // ── Base hooks ─────────────────────────────────────────────────────────────

  protected _trackEntry(track: number): Pixi8TrackEntry | null {
    return this._spine?.state.getTrack(track) ?? null
  }

  protected _labelPose(boneName: string): Pixi8LabelPose | null {
    const p = this._spine?.skeleton.findBone(boneName)?.appliedPose
    if (!p) return null
    // appliedPose.rotation is CCW degrees (Spine Y-up); Pixi wants CW radians.
    return { x: p.worldX, y: p.worldY, rotation: -p.rotation * (Math.PI / 180) }
  }

  protected _slotAlpha(slotName: string): number {
    return this._spine?.skeleton.findSlot(slotName)?.appliedPose.color.a ?? 1
  }
}
