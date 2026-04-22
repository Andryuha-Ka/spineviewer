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

export interface PHImageEntry {
  imageId: string
  fileName: string
  dataURL: string
  syncEnabled: boolean
  posX: number
  posY: number
  scale: number
}

export interface SpineSlotSavedState {
  // Viewport
  speed: number
  // Animation
  selectedAnimation: string | null
  currentTrack: number
  loop: boolean
  trackEnabled: Record<number, boolean>
  /** Full playlists per track — same shape as TrackQueueEntry[] */
  trackPlaylists: Record<number, Array<{ animationName: string; loop: boolean }>>
  wasPlaying: boolean
  /** Per-track playback position in seconds at the moment the slot was saved */
  trackTimes?: Record<number, number>
  // Skin
  selectedSkins: string[]
  // Placeholders
  showPlaceholders: boolean
  disabledPlaceholders: string[]
  placeholderImages?: Record<string, PHImageEntry[]>
  // Independent movement
  syncEnabled: boolean
  indPosX: number
  indPosY: number
  indZoom: number
}

export interface SpineSlot {
  id: string
  name: string
  fileSet?: FileSet             // undefined when error is set
  error?: string                // set for unmatched / incomplete slots (classification)
  validationErrors?: string[]   // content validation errors (missing images, regions, etc.)
  savedState?: SpineSlotSavedState
  placeholders?: Array<{ name: string; kind: 'bone' | 'slot' }>
  // Independent movement (desynced from global viewport)
  syncEnabled?: boolean         // default: true
  indPosX?: number              // default: 0
  indPosY?: number              // default: 0
  indZoom?: number              // default: 1
}
