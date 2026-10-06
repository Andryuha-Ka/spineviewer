/**
 * @file registerSpine43Pipe.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { extensions, ExtensionType } from 'pixi8'
import { SpinePipe } from 'spine-pixi-v8-43'

// Both runtimes register a pipe named 'spine' and the first one wins (4.2 is imported first),
// so the 4.3 pipe gets its own name; Spine43Adapter sets renderPipeId = 'spine43' on its instances.
extensions.add({
  type: [ExtensionType.WebGLPipes, ExtensionType.WebGPUPipes, ExtensionType.CanvasPipes],
  name: 'spine43',
  ref: SpinePipe,
})
