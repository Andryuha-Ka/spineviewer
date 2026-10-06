/**
 * @file diffSeverity.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import type { SpineDiff } from './types'

interface DiffSeverity {
  animName: number
  animDur: number
  skin: number
  globalEvent: number
  animEventName: number
  animEventTiming: number
  placeholder: number
  constraintCritical: number
  constraintParam: number
  sliderCritical: number
  sliderParam: number
  freeBone: number
  critical: number   // animName + skin + globalEvent + animEventName + placeholder + constraintCritical + sliderCritical
  warn: number       // animDur + animEventTiming + constraintParam + sliderParam + freeBone
}

export function diffSeverity(diff: SpineDiff | null): DiffSeverity {
  const animName = diff?.animTable.filter(r => r.status === 'only-a' || r.status === 'only-b').length ?? 0
  const animDur = diff?.animTable.filter(r => r.status === 'delta').length ?? 0
  const skin = diff?.skinTable.filter(s => s.status !== 'ok').length ?? 0
  const globalEvent = diff?.globalEvents.filter(e => e.status !== 'ok').length ?? 0
  const animEventName = diff?.animEvents.reduce((sum, g) => sum + g.events.filter(e => e.status === 'only-a' || e.status === 'only-b').length, 0) ?? 0
  const animEventTiming = diff?.animEvents.reduce((sum, g) => sum + g.events.filter(e => e.status === 'delta').length, 0) ?? 0
  const placeholder = diff?.placeholders.filter(p => p.status !== 'equal').length ?? 0
  const constraintCritical = diff?.constraintTable.filter(r =>
    r.status === 'only-a' || r.status === 'only-b' ||
    (r.status === 'changed' && (r.bonesChanged || r.targetChanged)),
  ).length ?? 0
  const constraintParam = diff?.constraintTable.filter(r =>
    r.status === 'changed' && !r.bonesChanged && !r.targetChanged && r.paramsChanged,
  ).length ?? 0
  const sliderCritical = diff?.sliderTable.filter(r => r.status === 'only-a' || r.status === 'only-b').length ?? 0
  const sliderParam = diff?.sliderTable.filter(r => r.status === 'changed').length ?? 0
  const freeBone = diff?.freeBoneTable.filter(r => r.status !== 'ok').length ?? 0

  return {
    animName, animDur, skin, globalEvent, animEventName, animEventTiming, placeholder,
    constraintCritical, constraintParam, sliderCritical, sliderParam, freeBone,
    critical: animName + skin + globalEvent + animEventName + placeholder + constraintCritical + sliderCritical,
    warn: animDur + animEventTiming + constraintParam + sliderParam + freeBone,
  }
}
