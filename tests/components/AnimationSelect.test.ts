import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import AnimationSelect from '@/components/ui/AnimationSelect.vue'

type MenuPropsFn = (option: unknown) => { style: string }
type NodePropsFn = (option: { key: string; children?: unknown[] }) => { onMouseenter?: (e: MouseEvent) => void }

function setup(props: Record<string, unknown> = {}) {
  return mount(AnimationSelect, {
    props: { value: null, animations: ['idle', 'fx/fire', 'fx/smoke'], ...props },
    attachTo: document.body,
  })
}

function openMenu(wrapper: VueWrapper, triggerRect: Partial<DOMRect>) {
  const trigger = wrapper.find('[role="combobox"]').element as HTMLElement
  trigger.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 120, height: 28, ...triggerRect }) as DOMRect
  wrapper.findComponent(NDropdown).vm.$emit('update:show', true)
}

describe('AnimationSelect', () => {
  let wrapper: VueWrapper
  afterEach(() => wrapper.unmount())

  it('emits leaves only and exposes the open state for the keyboard guard', async () => {
    wrapper = setup()
    const dropdown = wrapper.findComponent(NDropdown)
    openMenu(wrapper, { top: 100, bottom: 128 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('true')

    dropdown.vm.$emit('select', '__group__fx')
    dropdown.vm.$emit('select', 'fx/fire')
    expect(wrapper.emitted('select')).toEqual([['fx/fire']])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('false')
  })

  it('caps the root menu to the space below by default and above for top-start', async () => {
    window.innerHeight = 800
    wrapper = setup()
    openMenu(wrapper, { top: 100, bottom: 128 })
    const menuProps = wrapper.findComponent(NDropdown).props('menuProps') as MenuPropsFn
    expect(menuProps(undefined).style).toContain('max-height: 664px')
    wrapper.unmount()

    wrapper = setup({ placement: 'top-start' })
    openMenu(wrapper, { top: 700, bottom: 728 })
    expect(wrapper.findComponent(NDropdown).props('placement')).toBe('top-start')
    const upMenuProps = wrapper.findComponent(NDropdown).props('menuProps') as MenuPropsFn
    expect(upMenuProps(undefined).style).toContain('max-height: 692px')
  })

  it('lets an upward submenu use the larger side of its folder row', () => {
    window.innerHeight = 800
    wrapper = setup({ placement: 'top-start' })
    openMenu(wrapper, { top: 700, bottom: 728 })
    const dropdown = wrapper.findComponent(NDropdown)
    const nodeProps = dropdown.props('nodeProps') as NodePropsFn
    const row = document.createElement('div')
    row.getBoundingClientRect = () => ({ top: 600, bottom: 630 }) as DOMRect
    nodeProps({ key: '__group__fx', children: [] }).onMouseenter!({ currentTarget: row } as unknown as MouseEvent)
    const menuProps = dropdown.props('menuProps') as MenuPropsFn
    expect(menuProps({ key: '__group__fx' }).style).toBe('max-height: 622px')
  })

  it('does not open while disabled', async () => {
    wrapper = setup({ disabled: true })
    openMenu(wrapper, { top: 0, bottom: 28 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('false')
  })
})
