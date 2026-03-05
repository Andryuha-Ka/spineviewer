import type {
  ISpineAdapter, BoneInfo, SlotInfo, EventInfo,
  TrackState, BoneTransform, AttachmentInfo, SpineEvent,
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
  seekTo(_t: number, _time: number): void { throw new Error('Not implemented') }
  setSkin(_n: string): void { throw new Error('Not implemented') }
  setSkins(_n: string[]): void { throw new Error('Not implemented') }
  setToSetupPose(): void { throw new Error('Not implemented') }
  setBonesToSetupPose(): void { throw new Error('Not implemented') }
  setSlotsToSetupPose(): void { throw new Error('Not implemented') }
  getTrackStates(): TrackState[] { return [] }
  getBoneTransforms(): BoneTransform[] { return [] }
  getActiveAttachments(): AttachmentInfo[] { return [] }
  onEvent(_cb: (e: SpineEvent) => void): () => void { return () => {} }
}
