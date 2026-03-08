declare module 'gif.js' {
  interface GIFOptions {
    workers?:      number
    quality?:      number
    width?:        number
    height?:       number
    workerScript?: string
    transparent?:  number | null
    background?:   string
    repeat?:       number   // -1 = no repeat, 0 = forever
    dither?:       boolean | string
  }

  interface FrameOptions {
    delay?:       number
    copy?:        boolean
    dispose?:     number
  }

  class GIF {
    constructor(options: GIFOptions)
    addFrame(image: HTMLCanvasElement | CanvasRenderingContext2D | ImageData, opts?: FrameOptions): void
    on(event: 'start' | 'abort', cb: () => void): void
    on(event: 'progress', cb: (p: number) => void): void
    on(event: 'finished', cb: (blob: Blob) => void): void
    render(): void
    abort(): void
  }

  export default GIF
}
