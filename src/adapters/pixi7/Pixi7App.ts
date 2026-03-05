import * as PIXI from 'pixi7'
import type { IPixiApp, PixiTicker } from '@/core/types/IPixiApp'

export class Pixi7App implements IPixiApp {
  private readonly _app: PIXI.Application

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this._app = new PIXI.Application({
      view: canvas,
      width: w,
      height: h,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
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
    // PIXI 7.3+ uses renderer.background.color
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this._app.renderer as any).background.color = color
  }

  destroy(): void {
    // false = do not remove canvas — Vue controls the DOM element
    this._app.destroy(false, { children: true })
  }
}
