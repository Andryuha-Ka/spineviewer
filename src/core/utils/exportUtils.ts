/**
 * @file exportUtils.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { AsyncZippable } from 'fflate'
import type { FileSet } from '@/core/types/FileSet'

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

/** Replaces characters not allowed in file names with `_`. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}

/**
 * Flat edited-skeleton zip: `<name>.json`, the source atlas and its page images with their original bytes.
 * The skeleton body must already be Spine JSON text; aborting `signal` terminates packing.
 */
export async function buildSkeletonZip(
  fileSet: FileSet,
  skeletonName: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { skeleton, atlas, images } = fileSet
  if (typeof skeleton.fileBody !== 'string') throw new Error('Skeleton is not Spine JSON')
  const { zip } = await import('fflate')
  const text = { level: 6 } as const
  const files: AsyncZippable = {
    [`${safeFileName(skeletonName)}.json`]: [bodyBytes(skeleton.fileBody, false), text],
    [safeFileName(atlas.filename)]:         [bodyBytes(atlas.fileBody, false), text],
  }
  for (const img of images) files[safeFileName(img.filename)] = [bodyBytes(img.fileBody, true), { level: 0 }]

  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () => { terminate(); reject(signal!.reason) }
    const terminate = zip(files, (err, data) => {
      signal?.removeEventListener('abort', onAbort)
      if (err) reject(err)
      else resolve(new Blob([data], { type: 'application/zip' }))
    })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function bodyBytes(body: string | ArrayBuffer, dataUrl: boolean): Uint8Array {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (!dataUrl) return new TextEncoder().encode(body)
  const bin = atob(body.slice(body.indexOf(',') + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
