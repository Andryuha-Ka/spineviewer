/**
 * @file IProgressOverlay.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

export interface TrackDisplayState {
  trackIndex: number
  animationName: string
  normPos: number       // 0..1, loop-corrected
  displayTime: number   // time in seconds for display
  duration: number
}

export interface MarkerDisplay {
  name: string
  normPos: number       // 0..1 (time / duration)
}

export interface ProgressOverlayParams {
  tracks: TrackDisplayState[]
  markersPerTrack: Map<number, MarkerDisplay[]>
  dcBuckets: readonly (number | null)[]  // DC_BUCKETS = 300
  stageW: number
  stageH: number
  hoveredTrackIndex?: number
}

export interface IProgressOverlay {
  /** Call every frame from ticker. Redraws Graphics and updates texts. */
  update(params: ProgressOverlayParams): void

  /** Call on canvas resize */
  resize(w: number, h: number): void

  /**
   * Check if a click hit the overlay zone.
   * localX, localY — coordinates relative to canvas top-left.
   * Returns { trackIndex, pct } for seek, or null.
   */
  handleSeekClick(localX: number, localY: number): { trackIndex: number; pct: number } | null

  /**
   * Update seek during drag (same coordinates).
   * Returns same result as handleSeekClick.
   */
  handleSeekDrag(localX: number, localY: number): { trackIndex: number; pct: number } | null

  /** Remove container from stage and destroy PIXI objects */
  destroy(): void
}
