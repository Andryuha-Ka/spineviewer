import * as PIXI from 'pixi8'
import type { IPixiApp, PixiTicker } from '@/core/types/IPixiApp'

export class Pixi8App implements IPixiApp {
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
    return new Pixi8App(app)
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

  destroy(): void {
    // false = do not remove canvas — Vue controls the DOM element
    this._app.destroy(false)
  }
}
