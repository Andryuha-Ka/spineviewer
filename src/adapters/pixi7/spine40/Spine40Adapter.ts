/**
 * @file Spine40Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as spine40 from '@pixi-spine/all-4.0'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine40Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '4.0'
  protected get spineModule() { return spine40 }
}
