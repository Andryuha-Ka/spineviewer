/**
 * @file Pixi7ProgressOverlay.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */
import * as PIXI from 'pixi.js'
import type { IProgressOverlay, ProgressOverlayParams, TrackDisplayState, MarkerDisplay } from '@/core/types/IProgressOverlay'
import {
  buildDCSparkline,
  hitTestOverlay,
  overlayTotalHeight,
  OVERLAY_MARGIN_X,
  TRACK_INFO_H,
  TRACK_BAR_H,
  TRACK_BAR_H_HOVER,
  TRACK_GAP,
  TRACK_ROW_H,
  DC_HEADER_H,
  DC_GRAPH_H,
  OVERLAY_PAD_TOP,
} from '@/core/overlay/overlayMath'

const TEXT_STYLE = new PIXI.TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: 0xffffff,
  lineHeight: 14,
})

const IDX_STYLE = new PIXI.TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: 0x888888,
  lineHeight: 14,
})

const NAME_STYLE = new PIXI.TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: 0xaaaaaa,
  lineHeight: 14,
})

const DC_STYLE = new PIXI.TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: 0xffffff,
  lineHeight: 14,
})

const DC_TITLE_STYLE = new PIXI.TextStyle({
  fontFamily: 'monospace',
  fontSize: 9,
  fill: 0x555555,
  lineHeight: 14,
})

export class Pixi7ProgressOverlay implements IProgressOverlay {
  private readonly _container: PIXI.Container
  private readonly _gfx: PIXI.Graphics
  private _trackIdxTexts: PIXI.Text[] = []
  private _trackNameTexts: PIXI.Text[] = []
  private _trackTimeTexts: PIXI.Text[] = []
  private _dcText: PIXI.Text
  private _dcTitleText: PIXI.Text
  private _stageW: number
  private _stageH: number
  private _currentTrackCount = 0
  private _currentTracks: TrackDisplayState[] = []
  private _seekLockedTrackRowIndex = -1   // row index locked during drag

  constructor(stage: PIXI.Container, w: number, h: number) {
    this._stageW = w
    this._stageH = h

    this._container = new PIXI.Container()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // TODO: PIXI 7 Container does not declare zIndex in TS types — cast required
    ;(this._container as any).zIndex = 10000

    this._gfx = new PIXI.Graphics()
    this._container.addChild(this._gfx)

    this._dcTitleText = new PIXI.Text('DC', DC_TITLE_STYLE)
    this._dcTitleText.alpha = 0.9
    this._container.addChild(this._dcTitleText)

    this._dcText = new PIXI.Text('', DC_STYLE)
    this._dcText.alpha = 0.65
    this._container.addChild(this._dcText)

    stage.addChild(this._container)
  }

  update(params: ProgressOverlayParams): void {
    const { tracks, markersPerTrack, dcBuckets, stageW, stageH, hoveredTrackIndex } = params
    this._stageW = stageW
    this._stageH = stageH
    this._currentTracks = tracks

    const hasDC = dcBuckets.some(v => v !== null)
    const totalH = overlayTotalHeight(tracks.length, hasDC)
    const overlayTop = stageH - totalH

    this._syncTextPool(tracks.length)
    this._gfx.clear()

    // ── Draw tracks ────────────────────────────────────────────────────────────
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      const rowTop = overlayTop + OVERLAY_PAD_TOP + i * TRACK_ROW_H
      const barTop = rowTop + TRACK_INFO_H + TRACK_GAP
      const barX   = OVERLAY_MARGIN_X
      const barW   = stageW - OVERLAY_MARGIN_X * 2
      const isHovered = hoveredTrackIndex === i
      const barH = isHovered ? TRACK_BAR_H_HOVER : TRACK_BAR_H

      // Bar background
      this._gfx.beginFill(0xffffff, 0.1)
      this._gfx.drawRect(barX, barTop, barW, barH)
      this._gfx.endFill()

      // Bar fill
      const fillW = Math.max(0, barW * track.normPos)
      if (fillW > 0) {
        this._gfx.beginFill(0x7c6af5, 0.85)
        this._gfx.drawRect(barX, barTop, fillW, barH)
        this._gfx.endFill()
      }

      // Event markers
      const markers: MarkerDisplay[] = markersPerTrack.get(track.trackIndex) ?? []
      for (const m of markers) {
        const mx = barX + m.normPos * barW
        this._gfx.lineStyle(1.5, 0xfacc15, 0.85)
        this._gfx.moveTo(mx, barTop - 3)
        this._gfx.lineTo(mx, barTop + barH + 3)
        this._gfx.lineStyle(0)
      }

      // Track index text
      const idxText = this._trackIdxTexts[i]
      idxText.text = `#${track.trackIndex}`
      idxText.position.set(barX, rowTop)

      // Track name text
      const nameText = this._trackNameTexts[i]
      const maxNameW = (stageW - OVERLAY_MARGIN_X * 2) * 0.55
      nameText.text = track.animationName
      nameText.position.set(barX + 24, rowTop)
      // Clip name text by width (PIXI7 doesn't support CSS overflow, truncate manually)
      const nameMaxChars = Math.floor(maxNameW / 6.5)
      if (track.animationName.length > nameMaxChars) {
        nameText.text = track.animationName.slice(0, nameMaxChars - 1) + '…'
      }

      // Time text (right-aligned)
      const timeStr = `${track.displayTime.toFixed(2)}s / ${track.duration.toFixed(2)}s`
      const timeText = this._trackTimeTexts[i]
      timeText.text = timeStr
      const timeW = timeText.width
      timeText.position.set(stageW - OVERLAY_MARGIN_X - timeW, rowTop)
    }

    // ── Draw DC sparkline ──────────────────────────────────────────────────────
    if (hasDC && tracks.length > 0) {
      const dcTop = overlayTop + OVERLAY_PAD_TOP + tracks.length * TRACK_ROW_H
      const graphX = OVERLAY_MARGIN_X
      const graphW = stageW - OVERLAY_MARGIN_X * 2
      const spark = buildDCSparkline(dcBuckets, graphW, DC_GRAPH_H)

      // DC title
      this._dcTitleText.visible = true
      this._dcTitleText.position.set(graphX, dcTop)

      // DC stats text
      if (spark.hasData) {
        this._dcText.text = `${spark.min}  –  ${spark.cur}  –  ${spark.max}`
        this._dcText.visible = true
        const textW = this._dcText.width
        this._dcText.position.set(stageW - OVERLAY_MARGIN_X - textW, dcTop)
      } else {
        this._dcText.visible = false
      }

      // Graph area
      const graphTop = dcTop + DC_HEADER_H

      if (spark.hasData && spark.linePoints.length >= 2) {
        // Fill polygon — base always spans full width (0..graphW) so graph
        // visually covers the full animation timeline regardless of where
        // the first/last DC sample lands.
        this._gfx.beginFill(0x7c6af5, 0.12)
        this._gfx.moveTo(graphX, graphTop + DC_GRAPH_H)
        for (const [px, py] of spark.linePoints) {
          this._gfx.lineTo(graphX + px, graphTop + py)
        }
        this._gfx.lineTo(graphX + graphW, graphTop + DC_GRAPH_H)
        this._gfx.closePath()
        this._gfx.endFill()

        // Line
        this._gfx.lineStyle(1.5, 0x7c6af5, 0.75)
        let first = true
        for (const [px, py] of spark.linePoints) {
          if (first) { this._gfx.moveTo(graphX + px, graphTop + py); first = false }
          else        { this._gfx.lineTo(graphX + px, graphTop + py) }
        }
        this._gfx.lineStyle(0)
      }
    } else {
      this._dcTitleText.visible = false
      this._dcText.visible = false
    }

    this._currentTrackCount = tracks.length
  }

  resize(w: number, h: number): void {
    this._stageW = w
    this._stageH = h
  }

  handleSeekClick(localX: number, localY: number): { trackIndex: number; pct: number } | null {
    const hasDC = true   // conservative: always treat DC zone as present for hit-test
    const hit = hitTestOverlay(localX, localY, this._stageW, this._stageH, this._currentTrackCount, hasDC)
    if (!hit.inOverlay || hit.trackRowIndex < 0) return null
    const track = this._currentTracks[hit.trackRowIndex]
    if (!track) return null
    this._seekLockedTrackRowIndex = hit.trackRowIndex
    return { trackIndex: track.trackIndex, pct: hit.barPct }
  }

  handleSeekDrag(localX: number, localY: number): { trackIndex: number; pct: number } | null {
    // During drag: use locked row index, only update X pct
    if (this._seekLockedTrackRowIndex < 0) return this.handleSeekClick(localX, localY)
    const track = this._currentTracks[this._seekLockedTrackRowIndex]
    if (!track) return null
    const barX = OVERLAY_MARGIN_X
    const barW = this._stageW - OVERLAY_MARGIN_X * 2
    const pct  = Math.max(0, Math.min(1, (localX - barX) / barW))
    return { trackIndex: track.trackIndex, pct }
  }

  destroy(): void {
    for (const t of this._trackIdxTexts)   t.destroy()
    for (const t of this._trackNameTexts)  t.destroy()
    for (const t of this._trackTimeTexts)  t.destroy()
    this._trackIdxTexts  = []
    this._trackNameTexts = []
    this._trackTimeTexts = []
    this._dcText.destroy()
    this._dcTitleText.destroy()
    this._gfx.destroy()
    if (this._container.parent) {
      this._container.parent.removeChild(this._container)
    }
    this._container.destroy()
  }

  private _syncTextPool(count: number): void {
    // Add texts
    while (this._trackIdxTexts.length < count) {
      const idx  = new PIXI.Text('', IDX_STYLE)
      const name = new PIXI.Text('', NAME_STYLE)
      const time = new PIXI.Text('', TEXT_STYLE)
      idx.alpha  = 0.65
      name.alpha = 0.65
      time.alpha = 0.45
      this._container.addChild(idx)
      this._container.addChild(name)
      this._container.addChild(time)
      this._trackIdxTexts.push(idx)
      this._trackNameTexts.push(name)
      this._trackTimeTexts.push(time)
    }
    // Remove excess texts
    while (this._trackIdxTexts.length > count) {
      this._trackIdxTexts.pop()!.destroy()
      this._trackNameTexts.pop()!.destroy()
      this._trackTimeTexts.pop()!.destroy()
    }
    // Show / hide
    for (let i = 0; i < this._trackIdxTexts.length; i++) {
      const vis = i < count
      this._trackIdxTexts[i].visible  = vis
      this._trackNameTexts[i].visible = vis
      this._trackTimeTexts[i].visible = vis
    }
  }
}
