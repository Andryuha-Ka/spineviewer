/**
 * @file Pixi8App.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as PIXI from 'pixi8'
import type { IPixiApp, PixiTicker, RendererStats } from '@/core/types/IPixiApp'
import type { IProgressOverlay } from '@/core/types/IProgressOverlay'
import { Pixi8ProgressOverlay } from './Pixi8ProgressOverlay'

export class Pixi8App implements IPixiApp {
  private _frameDrawCalls = 0
  private _lastDrawCalls: number | null = null

  private constructor(private readonly _app: PIXI.Application) {}

  static async create(canvas: HTMLCanvasElement, w: number, h: number): Promise<Pixi8App> {
    const app = new PIXI.Application()
    await app.init({
      canvas,
      width: w,
      height: h,
      background: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    const instance = new Pixi8App(app)

    // Expose app to Pixi DevTools browser extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__PIXI_APP__ = app

    // Count WebGL draw calls by wrapping the GL context.
    // Ticker at priority -100 runs after Pixi renders (priority -50), capturing per-frame count.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gl = (app.renderer as any).gl as WebGL2RenderingContext
      if (gl) {
        const inc = () => { instance._frameDrawCalls++ }
        const origDE = gl.drawElements.bind(gl)
        const origDA = gl.drawArrays.bind(gl)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(gl as any).drawElements = (...args: any[]) => { inc(); return (origDE as any)(...args) }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(gl as any).drawArrays = (...args: any[]) => { inc(); return (origDA as any)(...args) }
        app.ticker.add(() => {
          instance._lastDrawCalls = instance._frameDrawCalls
          instance._frameDrawCalls = 0
        }, null, -100 as any)
      }
    } catch { /* GL wrapping not available */ }

    return instance
  }

  get stage(): PIXI.Container {
    return this._app.stage
  }

  get ticker(): PixiTicker {
    return this._app.ticker as unknown as PixiTicker
  }

  resize(w: number, h: number): void {
    this._app.renderer.resize(w, h)
  }

  setBackground(color: number): void {
    this._app.renderer.background.color = color
  }

  createProgressOverlay(w: number, h: number): IProgressOverlay {
    return new Pixi8ProgressOverlay(this._app.stage, w, h)
  }

  getStats(): RendererStats {
    return { drawCalls: this._lastDrawCalls }
  }

  async extractFrame(): Promise<HTMLCanvasElement> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (this._app.renderer as any).extract.canvas(this._app.stage)) as HTMLCanvasElement
  }

  destroy(): void {
    // false = do not remove canvas — Vue controls the DOM element
    this._app.destroy(false)
  }
}
