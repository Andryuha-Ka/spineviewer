/**
 * @file ISpineAdapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { FileSet } from './FileSet'

// ── Sub-types ────────────────────────────────────────────────────────────────

export interface BoneInfo {
  name: string
  parent: string | null
}

export interface SlotInfo {
  name: string
  bone: string
  blendMode: number
}

export interface EventInfo {
  name: string
  intValue: number
  floatValue: number
  stringValue: string
}

export interface TrackQueueEntry {
  animationName: string
  loop: boolean
}

export interface TrackState {
  trackIndex: number
  animationName: string
  time: number
  duration: number
  loop: boolean
  timeScale: number
  queue: TrackQueueEntry[]
}

export interface BoneTransform {
  name: string
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
}

/** Local-space transform without the bone name — used for get/set operations */
export interface BoneLocalTransform {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
}

export interface AttachmentInfo {
  slotName: string
  attachmentName: string
  type: 'region' | 'mesh' | 'clipping' | 'point' | 'boundingbox' | 'path' | 'other'
  /** Mesh vertex count — set by getAllAttachments(); not set by getActiveAttachments() */
  vertexCount?: number
}

export interface AnimationEventMarker {
  name: string
  time: number
}

export interface SlotBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface SpineEvent {
  trackIndex: number
  time: number
  name: string
  intValue: number
  floatValue: number
  stringValue: string
}

// ── Main contract ─────────────────────────────────────────────────────────────

/**
 * Version-agnostic contract for all Spine adapters (pixi7/spine38, pixi8/spine42, etc.)
 * Components interact with Spine exclusively through this interface.
 */
export interface ISpineAdapter {
  readonly animations: string[]
  readonly skins: string[]
  readonly bones: BoneInfo[]
  readonly slots: SlotInfo[]
  readonly events: EventInfo[]
  readonly detectedVersion: string

  load(files: FileSet): Promise<void>
  /** container is PIXI.Container — typed as unknown to avoid version coupling */
  mount(container: unknown): void
  destroy(): void

  // Animation
  setAnimation(track: number, name: string, loop: boolean): void
  addAnimation(track: number, name: string, loop: boolean, delay?: number): void
  clearTrack(track: number): void
  clearTracks(): void
  setTimeScale(scale: number): void
  setTrackTimeScale(track: number, scale: number): void
  setTrackLoop(track: number, loop: boolean): void
  removeQueueEntry(track: number, index: number): void
  seekTo(track: number, time: number): void

  // Skeleton
  setSkin(name: string): void
  setSkins(names: string[]): void
  setToSetupPose(): void
  setBonesToSetupPose(): void
  setSlotsToSetupPose(): void

  // Live data (called each frame by ticker)
  getTrackStates(): TrackState[]
  getBoneTransforms(): BoneTransform[]
  getActiveAttachments(): AttachmentInfo[]
  // Returns all attachments across all skins from loaded skeleton data (works for binary .skel too)
  getAllAttachments(): AttachmentInfo[]

  // Event subscription — returns unsubscribe function
  onEvent(cb: (e: SpineEvent) => void): () => void

  // Returns event markers (name + time) for a given animation
  getAnimationEvents(animationName: string): AnimationEventMarker[]
  // Returns total duration in seconds for a given animation, or null if unavailable
  getAnimationDuration(animationName: string): number | null

  // Returns AABB of the slot's attachment in Spine world space (Y-up), or null if unavailable
  getSlotBounds(slotName: string): SlotBounds | null

  // Returns names of bones that have no keyframes in any animation (candidates for programmatic control)
  getFreeBones(): string[]
  // Set local-space transform on a live bone (does not require updateWorldTransform — runtime handles it)
  setBoneLocalTransform(boneName: string, transform: Partial<BoneLocalTransform>): void
  // Returns the setup pose local transform for a bone (use for reset)
  getBoneSetupTransform(boneName: string): BoneLocalTransform | null

  // Placeholder labels (pixi7: PIXI.Text; pixi8: PIXI.Sprite with canvas-generated texture)
  setPlaceholderLabels(items: Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>): void
  clearPlaceholderLabels(): void
  /** Called each ticker frame to update marker positions with animated bones */
  tickPlaceholderLabels(): void

  // Placeholder images — add/remove PIXI.Sprite children on slot containers
  addImageToPlaceholder(placeholderName: string, dataURL: string, imageId: string): void
  removeImageFromPlaceholder(placeholderName: string, imageId: string): void
  // Apply posX/posY/scale to the PIXI.Sprite managed by this adapter for the given imageId
  setImageTransform(imageId: string, posX: number, posY: number, scale: number): void
  // Returns the 2D affine matrix of the sprite's parent container in Pixi world (canvas) space. Null if imageId not found.
  getImageContainerWorldTransform(imageId: string): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null
}
