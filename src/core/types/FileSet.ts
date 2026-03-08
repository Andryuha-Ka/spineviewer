/**
 * @file FileSet.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

export type SpineFileType = 'skeleton-json' | 'skeleton-skel' | 'atlas' | 'image'

export interface SpineFile {
  filename: string
  /** DataURL for images, plain text for json/atlas, ArrayBuffer for .skel */
  fileBody: string | ArrayBuffer
  type: SpineFileType
  mimeType: string
}

export interface FileSet {
  skeleton: SpineFile   // .json or .skel
  atlas: SpineFile      // .atlas
  images: SpineFile[]   // .png / .jpg / .webp / .avif
}
