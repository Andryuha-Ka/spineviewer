export interface RendererStats {
  /** Number of WebGL draw calls in the last frame; null = not available for this Pixi version */
  drawCalls: number | null
}

export interface PixiTicker {
  readonly FPS: number
  add(fn: (dt: number) => void): this
  remove(fn: (dt: number) => void): this
}

export interface ITrackOverlay {
  updateText(text: string): void
  resize(width: number, height: number): void
  destroy(): void
}

/**
 * Version-agnostic abstraction over PIXI.Application (v7 or v8).
 * stage and renderer are typed as unknown to avoid coupling to a specific version.
 */
export interface IPixiApp {
  /** PIXI.Container — cast in implementation */
  readonly stage: unknown
  readonly ticker: PixiTicker
  resize(w: number, h: number): void
  destroy(): void
  setBackground(color: number): void
  createTrackOverlay(): ITrackOverlay
  getStats(): RendererStats
}
