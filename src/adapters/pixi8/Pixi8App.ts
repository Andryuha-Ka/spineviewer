import * as PIXI from 'pixi8'
import type { IPixiApp, ITrackOverlay, PixiTicker, RendererStats } from '@/core/types/IPixiApp'

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

  createTrackOverlay(): ITrackOverlay {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = new (PIXI as any).Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff, lineHeight: 16 },
    })
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
    // Pixi 8 does not expose a public draw-call counter — return null
    return { drawCalls: null }
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
