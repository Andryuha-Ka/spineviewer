import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useViewerKeyboard } from '@/core/composables/useViewerKeyboard'
import { useAnimationStore, FRAME_STEP_SECONDS } from '@/core/stores/useAnimationStore'

function makeStage() {
  return {
    seekDelta:    vi.fn(),
    clearTracks:  vi.fn(),
    setTrackLoop: vi.fn(),
  }
}

function press(target: EventTarget, code: string, init: KeyboardEventInit = {}) {
  const down = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(down)
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true, ...init }))
  return down
}

describe('useViewerKeyboard', () => {
  let stage: ReturnType<typeof makeStage>
  let wrapper: VueWrapper
  let host: HTMLElement

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    stage = makeStage()
    host = document.createElement('div')
    document.body.appendChild(host)
    const Harness = defineComponent({
      setup() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useViewerKeyboard(ref(stage) as any)
        return () => h('div')
      },
    })
    wrapper = mount(Harness, { global: { plugins: [pinia] }, attachTo: host })
  })

  afterEach(() => {
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('toggles playback with Space', () => {
    const anim = useAnimationStore()
    press(document.body, 'Space')
    expect(anim.isPlaying).toBe(true)
    press(document.body, 'Space')
    expect(anim.isPlaying).toBe(false)
    expect(anim.isPaused).toBe(true)
  })

  it('steps the current track by one 1/60 s frame and pauses', () => {
    const anim = useAnimationStore()
    anim.currentTrack = 3
    anim.play()
    press(document.body, 'ArrowRight')
    expect(anim.isPlaying).toBe(false)
    expect(stage.seekDelta).toHaveBeenLastCalledWith(3, FRAME_STEP_SECONDS)
    press(document.body, 'ArrowLeft')
    expect(stage.seekDelta).toHaveBeenLastCalledWith(3, -FRAME_STEP_SECONDS)
    expect(FRAME_STEP_SECONDS).toBeCloseTo(1 / 60)
  })

  it('keeps Space away from a focused n-select (C17)', () => {
    const selection = document.createElement('div')
    selection.className = 'n-base-selection'
    const focusable = document.createElement('div')
    focusable.tabIndex = 0
    selection.appendChild(focusable)
    document.body.appendChild(selection)
    const onSelectKey = vi.fn()
    selection.addEventListener('keydown', onSelectKey)

    press(focusable, 'Space')
    expect(onSelectKey).not.toHaveBeenCalled()
    expect(useAnimationStore().isPlaying).toBe(true)
  })

  it('keeps Space away from role-based controls', () => {
    for (const role of ['checkbox', 'switch', 'button', 'combobox']) {
      const el = document.createElement('div')
      el.setAttribute('role', role)
      document.body.appendChild(el)
      const onKey = vi.fn()
      el.addEventListener('keyup', onKey)
      press(el, 'Space')
      expect(onKey, role).not.toHaveBeenCalled()
    }
  })

  it('does not seek while the animation menu is open (C15)', () => {
    const trigger = document.createElement('div')
    trigger.setAttribute('role', 'combobox')
    trigger.setAttribute('aria-expanded', 'true')
    document.body.appendChild(trigger)
    const ev = press(trigger, 'ArrowRight')
    expect(stage.seekDelta).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)

    trigger.setAttribute('aria-expanded', 'false')
    press(trigger, 'ArrowRight')
    expect(stage.seekDelta).toHaveBeenCalledTimes(1)
  })

  it('ignores text inputs and IME composition', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    press(input, 'Space')
    press(document.body, 'Space', { isComposing: true })
    expect(useAnimationStore().isPlaying).toBe(false)
  })

  it('selects tracks with digits, clears with R, toggles loop with L / Shift+L', () => {
    const anim = useAnimationStore()
    anim.tracks = [
      { trackIndex: 0, animationName: 'a', time: 0, duration: 1, loop: false, timeScale: 1, queue: [] },
      { trackIndex: 2, animationName: 'b', time: 0, duration: 1, loop: true,  timeScale: 1, queue: [] },
    ]
    press(document.body, 'Digit2')
    expect(anim.currentTrack).toBe(2)
    press(document.body, 'KeyL')
    expect(stage.setTrackLoop).toHaveBeenCalledWith(2, false)
    stage.setTrackLoop.mockClear()
    press(document.body, 'KeyL', { shiftKey: true })
    expect(stage.setTrackLoop.mock.calls).toEqual([[0, true], [2, false]])
    press(document.body, 'KeyR')
    expect(stage.clearTracks).toHaveBeenCalledTimes(1)
  })

  it('L toggles the list Loop of a track with a list, not the live entry loop', () => {
    const anim = useAnimationStore()
    anim.tracks = [
      { trackIndex: 0, animationName: 'b', time: 0, duration: 1, loop: false, timeScale: 1, queue: [] },
    ]
    anim.setTrackPlaylist(0, [{ animationName: 'a', loop: true }, { animationName: 'b', loop: false }])
    anim.currentTrack = 0
    press(document.body, 'KeyL')
    expect(stage.setTrackLoop).toHaveBeenCalledWith(0, false)
  })

  it('removes listeners on unmount', () => {
    wrapper.unmount()
    press(document.body, 'Space')
    expect(useAnimationStore().isPlaying).toBe(false)
    wrapper = mount(defineComponent({ render: () => h('div') }))
  })
})
