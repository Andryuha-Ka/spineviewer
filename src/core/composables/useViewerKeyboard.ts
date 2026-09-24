/**
 * @file useViewerKeyboard.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useAnimationStore, FRAME_STEP_SECONDS } from '@/core/stores/useAnimationStore'
import type PreviewStage from '@/components/stage/PreviewStage.vue'

const SPACE_CONTROL_ROLES = new Set(['checkbox', 'switch', 'button', 'combobox'])

/** Focused controls that react to Space themselves; n-select focuses a role-less div inside `.n-base-selection`. */
function isSpaceControl(el: HTMLElement): boolean {
  return SPACE_CONTROL_ROLES.has(el.getAttribute?.('role') ?? '') || !!el.closest?.('.n-base-selection')
}

/** An open AnimationSelect menu navigates folders with ← / →. */
function isAnimationMenuOpen(): boolean {
  return !!document.querySelector('[role="combobox"][aria-expanded="true"]')
}

export function useViewerKeyboard(
  stageRef: Ref<InstanceType<typeof PreviewStage> | null>
): void {
  const animationStore = useAnimationStore()

  function stepFrame(direction: -1 | 1) {
    if (animationStore.isPlaying) animationStore.pause()
    stageRef.value?.seekDelta(animationStore.currentTrack, direction * FRAME_STEP_SECONDS)
  }

  function onKeyDown(e: KeyboardEvent) {
    const el = e.target as HTMLElement
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    // isComposing=true means an IME/dead-key sequence is in progress — ignore to avoid
    // misfires when switching to a non-Latin keyboard layout (e.g. Ukrainian/CJK)
    if (e.isComposing || e.keyCode === 229) return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Capture phase: keep Space away from the focused control so it only toggles playback.
    if (e.code === 'Space' && isSpaceControl(el)) e.stopPropagation()

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        if (animationStore.isPlaying) animationStore.pause()
        else animationStore.play()
        break
      case 'ArrowLeft':
        if (isAnimationMenuOpen()) return
        e.preventDefault()
        stepFrame(-1)
        break
      case 'ArrowRight':
        if (isAnimationMenuOpen()) return
        e.preventDefault()
        stepFrame(1)
        break
      case 'KeyR':
        stageRef.value?.clearTracks()
        break
      case 'KeyL': {
        const targets = e.shiftKey
          ? animationStore.tracks
          : animationStore.tracks.filter(t => t.trackIndex === animationStore.currentTrack)
        for (const t of targets) {
          const loop = animationStore.trackPlaylists[t.trackIndex]?.length
            ? animationStore.isTrackListLoop(t.trackIndex)
            : t.loop
          stageRef.value?.setTrackLoop(t.trackIndex, !loop)
        }
        break
      }
      default:
        if (/^Digit[0-9]$/.test(e.code)) {
          animationStore.currentTrack = Number(e.code.replace('Digit', ''))
        }
    }
  }

  // Naive UI toggles checkboxes and switches on keyup, so keydown alone is not enough.
  function onKeyUpCapture(e: KeyboardEvent) {
    if (e.code !== 'Space') return
    if (isSpaceControl(e.target as HTMLElement)) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUpCapture, true)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUpCapture, true)
  })
}
