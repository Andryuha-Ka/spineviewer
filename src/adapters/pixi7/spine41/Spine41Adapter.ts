/**
 * @file Spine41Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as spine41 from '@pixi-spine/all-4.1'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine41Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '4.1'
  protected get spineModule() { return spine41 }
}
