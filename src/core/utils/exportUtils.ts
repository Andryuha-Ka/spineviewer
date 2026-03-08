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
