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

export interface AttachmentInfo {
  slotName: string
  attachmentName: string
  type: 'region' | 'mesh' | 'clipping' | 'point' | 'boundingbox' | 'path' | 'other'
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

  // Event subscription — returns unsubscribe function
  onEvent(cb: (e: SpineEvent) => void): () => void
}
