/**
 * @file Spine41Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, BoneTransform, AttachmentInfo, SpineEvent, AnimationEventMarker, SlotBounds,
} from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

/** Stub — implemented in Step 4 */
export default class StubAdapter implements ISpineAdapter {
  readonly animations: string[] = []
  readonly skins: string[] = []
  readonly bones: BoneInfo[] = []
  readonly slots: SlotInfo[] = []
  readonly events: EventInfo[] = []
  readonly detectedVersion = 'stub'

  load(_files: FileSet): Promise<void> { throw new Error('Not yet implemented') }
  mount(_container: unknown): void { throw new Error('Not yet implemented') }
  destroy(): void { /* no-op */ }
  setAnimation(_t: number, _n: string, _l: boolean): void { throw new Error('Not implemented') }
  addAnimation(_t: number, _n: string, _l: boolean, _d?: number): void { throw new Error('Not implemented') }
  clearTrack(_t: number): void { throw new Error('Not implemented') }
  clearTracks(): void { throw new Error('Not implemented') }
  setTimeScale(_s: number): void { throw new Error('Not implemented') }
  setTrackTimeScale(_t: number, _s: number): void { throw new Error('Not implemented') }
  setTrackLoop(_t: number, _l: boolean): void { throw new Error('Not implemented') }
  removeQueueEntry(_t: number, _i: number): void { throw new Error('Not implemented') }
  seekTo(_t: number, _time: number): void { throw new Error('Not implemented') }
  setSkin(_n: string): void { throw new Error('Not implemented') }
  setSkins(_n: string[]): void { throw new Error('Not implemented') }
  setToSetupPose(): void { throw new Error('Not implemented') }
  setBonesToSetupPose(): void { throw new Error('Not implemented') }
  setSlotsToSetupPose(): void { throw new Error('Not implemented') }
  getTrackStates(): TrackState[] { return [] }
  getBoneTransforms(): BoneTransform[] { return [] }
  getActiveAttachments(): AttachmentInfo[] { return [] }
  getAllAttachments(): AttachmentInfo[] { return [] }
  onEvent(_cb: (e: SpineEvent) => void): () => void { return () => {} }
  getAnimationDuration(_animationName: string): number | null { return null }
  getAnimationEvents(_animationName: string): AnimationEventMarker[] { return [] }
  getSlotBounds(_slotName: string): SlotBounds | null { return null }
  setPlaceholderLabels(_items: Array<{ name: string; kind: 'bone' | 'slot' | 'attachment' }>): void { /* no-op */ }
  clearPlaceholderLabels(): void { /* no-op */ }
  tickPlaceholderLabels(): void { /* no-op */ }
  getFreeBones(): string[] { return [] }
  setBoneLocalTransform(_boneName: string, _transform: Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }>): void { /* no-op */ }
  getBoneSetupTransform(_boneName: string): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } | null { return null }
  addImageToPlaceholder(_placeholderName: string, _dataURL: string, _imageId: string): void { /* no-op */ }
  removeImageFromPlaceholder(_placeholderName: string, _imageId: string): void { /* no-op */ }
  setImageTransform(_imageId: string, _posX: number, _posY: number, _scale: number): void { /* no-op */ }
  getImageContainerWorldTransform(_imageId: string): null { return null }
  getImageAtCanvasPoint(_x: number, _y: number): null { return null }
  setImageZIndex(_imageId: string, _zIndex: number): void { /* no-op */ }
}
