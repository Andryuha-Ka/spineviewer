/**
 * @file stageCommands.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { BoneTransform, TrackMixOptions } from '@/core/types/ISpineAdapter'
import type { FileSet } from '@/core/types/FileSet'

export type CaptureLimit = 'gpu' | 'memory' | null

/** Commands of the mounted PreviewStage: its `defineExpose` object, reachable without a component ref. */
export interface StageCommands {
  loadSpine(fileSet: FileSet, slotId?: string, resetViewport?: boolean): Promise<void>
  setAnimation(track: number, name: string, loop: boolean): void
  addAnimation(track: number, name: string, loop: boolean): void
  setTrackLoop(track: number, loop: boolean): void
  setTrackMixOptions(track: number, patch: Partial<TrackMixOptions>): void
  removeQueueEntry(track: number, index: number): void
  clearTrack(track: number): void
  clearTracks(): void
  seekDelta(track: number, delta: number): void
  seekTo(track: number, time: number): void
  setSkins(names: string[]): void
  captureCurrentFrame(opts?: { scale?: number }): Promise<{ canvas: HTMLCanvasElement; scale: number } | null>
  captureAnimFrames(
    track: number,
    frameCount: number,
    onFrame: (canvas: HTMLCanvasElement, index: number, total: number) => void,
    signal?: AbortSignal,
    opts?: { scale?: number },
  ): Promise<{ scale: number; limit: CaptureLimit } | null>
  getBoneTransformsSnapshot(): BoneTransform[]
  /** Rebuilds a slot from its edited FileSet, keeping its playback and state; rejects when the data cannot be loaded */
  reloadSlot(slotId: string): Promise<void>
  /** True while a skeleton is loading or a slot switch restores one */
  isBusy(): boolean
  /** Last load error shown on the stage, null when the skeleton loaded */
  lastError(): string | null
}

let current: StageCommands | null = null

export function registerStageCommands(cmds: StageCommands): void {
  current = cmds
}

export function getStageCommands(): StageCommands | null {
  return current
}

/** Clears the registry only when `cmds` is still the registered object, so a newer stage is never dropped. */
export function unregisterStageCommands(cmds: StageCommands): void {
  if (current === cmds) current = null
}
