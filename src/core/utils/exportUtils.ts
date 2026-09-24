/**
 * @file exportUtils.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

/** Download a Blob as a file */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Download a JSON-serializable value as a .json file */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

/** Resolve an HTMLCanvasElement to a PNG Blob */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })
}

/** Assemble multiple canvases into a sprite-sheet grid */
export async function buildSpriteSheet(
  frames: HTMLCanvasElement[],
  cols: number,
): Promise<HTMLCanvasElement> {
  if (frames.length === 0) throw new Error('No frames to assemble')
  const fw   = frames[0].width
  const fh   = frames[0].height
  const rows = Math.ceil(frames.length / cols)

  const sheet = document.createElement('canvas')
  sheet.width  = fw * cols
  sheet.height = fh * rows
  const ctx = sheet.getContext('2d')!

  for (let i = 0; i < frames.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    ctx.drawImage(frames[i], col * fw, row * fh, fw, fh)
  }
  return sheet
}

const SCALES = [4, 2, 1] as const
const SEQUENCE_BUDGET_BYTES = 1024 ** 3

/** Largest of 4/2/1 not above `scale` whose output fits a `max`×`max` texture; never below 1. */
export function fitScale(w: number, h: number, scale: number, max: number): number {
  return SCALES.find(s => s <= scale && Math.ceil(w * s) <= max && Math.ceil(h * s) <= max) ?? 1
}

/** Largest of 4/2/1 not above `scale` keeping `frames` RGBA frames within 1 GB; never below 1. */
export function fitSequenceScale(frames: number, w: number, h: number, scale: number): number {
  return SCALES.find(s => s <= scale && frames * w * h * s * s * 4 <= SEQUENCE_BUDGET_BYTES) ?? 1
}

/** Copy of `canvas` drawn over a solid `color` (number = 0xRRGGBB). */
export function withBackground(canvas: HTMLCanvasElement, color: number | string): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width  = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out
}
