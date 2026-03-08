/**
 * @file Spine38Adapter.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as spine38 from '@pixi-spine/all-3.8'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine38Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '3.8'
  protected get spineModule() { return spine38 }
}
