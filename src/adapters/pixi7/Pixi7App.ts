import * as PIXI from 'pixi7'
import type { IPixiApp, ITrackOverlay, PixiTicker, RendererStats } from '@/core/types/IPixiApp'

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

  createTrackOverlay(): ITrackOverlay {
    const text = new PIXI.Text('', new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: 11,
      fill: 0xffffff,
      lineHeight: 16,
    }))
    text.alpha = 0.75
    text.anchor.set(0, 1)
    text.x = 8
    text.y = this._app.renderer.height - 8
    this._app.stage.addChild(text)
    return {
      updateText: (s: string) => { text.text = s },
      resize: (_w: number, h: number) => { text.y = h - 8 },
      destroy: () => { this._app.stage.removeChild(text); text.destroy() },
    }
  }

  getStats(): RendererStats {
    // Pixi 7 does not expose a public draw-call counter — return null
    return { drawCalls: null }
  }

  async extractFrame(): Promise<HTMLCanvasElement> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this._app.renderer as any).plugins.extract.canvas(this._app.stage) as HTMLCanvasElement
  }

  destroy(): void {
    // false = do not remove canvas — Vue controls the DOM element
    this._app.destroy(false, { children: true })
  }
}
