/**
 * @file IPixiApp.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */
import type { IProgressOverlay } from './IProgressOverlay'

export interface RendererStats {
  /** Number of WebGL draw calls in the last frame; null = not available for this Pixi version */
  drawCalls: number | null
}

export interface PixiTicker {
  readonly FPS: number
  add(fn: (dt: number) => void): this
  remove(fn: (dt: number) => void): this
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
  createProgressOverlay(w: number, h: number): IProgressOverlay
  getStats(): RendererStats
  /** Extract the current rendered frame as an HTMLCanvasElement (handles preserveDrawingBuffer) */
  extractFrame(): Promise<HTMLCanvasElement>
  /** Create a PIXI.Sprite from a data URL; anchor is set to (0.5, 0.5). Returns unknown to avoid version coupling. */
  createSprite(dataUrl: string): unknown
  /** Enable/disable sortable children on the stage root */
  setSortableChildren(enabled: boolean): void
  /** Append a child object to the stage root */
  addToStage(child: unknown): void
  /** Remove a child object from the stage root (safe if not present) */
  removeFromStage(child: unknown): void
  /** Return the last direct child of the stage root, or null if empty */
  getLastStageChild(): unknown
}
