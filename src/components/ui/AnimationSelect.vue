<!--
 * @file AnimationSelect.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <n-dropdown
    trigger="click"
    placement="bottom-start"
    size="small"
    scrollable
    :show="menuOpen"
    :disabled="disabled"
    :options="dropdownOptions"
    :value="value ?? undefined"
    :menu-props="menuProps"
    :node-props="nodeProps"
    :render-label="renderLabel"
    @update:show="onMenuUpdateShow"
    @select="onSelect"
  >
    <div
      ref="triggerRef"
      v-bind="$attrs"
      class="anim-select"
      :class="{ 'anim-select--open': menuOpen, 'anim-select--disabled': disabled }"
      role="combobox"
      tabindex="0"
      :title="value ?? undefined"
      :aria-expanded="menuOpen"
      :aria-disabled="disabled"
    >
      <span v-if="value" class="anim-select__value">{{ value }}</span>
      <span v-else class="anim-select__placeholder">{{ placeholder }}</span>
      <button
        v-if="clearable && value && !disabled"
        type="button"
        class="anim-select__clear"
        title="Clear"
        @click.stop="emit('clear')"
      >×</button>
      <svg class="anim-select__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  </n-dropdown>
</template>

<script setup lang="ts">
import { h, type VNodeChild } from 'vue'
import type { CascaderOption, DropdownOption, DropdownProps } from 'naive-ui'
import { buildCascaderOptions } from '@/core/utils/buildCascaderOptions'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  value: string | null
  animations: string[]
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  clearable: true,
  placeholder: 'Select animation…',
})

const emit = defineEmits<{
  select: [name: string]
  clear:  []
}>()

// Flyout dropdown: each folder submenu opens level with its folder row.
const MENU_MARGIN_PX = 8
const MENU_MIN_HEIGHT_PX = 32

const menuOpen          = ref(false)
const triggerRef        = ref<HTMLElement | null>(null)
const rootMenuMaxHeight = ref(0)
const rootMenuMinWidth  = ref(0)
// Submenu followers flip when content overflows, so each submenu is capped
// to the viewport space below its folder row to stay anchored there.
const submenuMaxHeight  = ref<Record<string, number>>({})

function toDropdownOptions(options: CascaderOption[]): DropdownOption[] {
  return options.map(o => ({
    key:   String(o.value),
    label: String(o.label ?? ''),
    ...(o.children ? { children: toDropdownOptions(o.children) } : {}),
  }))
}

const dropdownOptions = computed<DropdownOption[]>(() =>
  toDropdownOptions(buildCascaderOptions(props.animations)),
)

function spaceBelow(top: number): number {
  return Math.max(MENU_MIN_HEIGHT_PX, window.innerHeight - top - MENU_MARGIN_PX)
}

function onMenuUpdateShow(show: boolean) {
  if (show) {
    if (props.disabled) return
    const rect = triggerRef.value?.getBoundingClientRect()
    if (rect) {
      rootMenuMinWidth.value  = rect.width
      rootMenuMaxHeight.value = spaceBelow(rect.bottom)
    }
    submenuMaxHeight.value = {}
  }
  menuOpen.value = show
}

type MenuAttrs = ReturnType<NonNullable<DropdownProps['menuProps']>>
type NodeAttrs = ReturnType<NonNullable<DropdownProps['nodeProps']>>

const menuProps: NonNullable<DropdownProps['menuProps']> = (option): MenuAttrs => {
  if (!option) {
    return {
      class: 'anim-select-menu',
      style: `max-height: ${rootMenuMaxHeight.value}px; min-width: ${rootMenuMinWidth.value}px`,
    }
  }
  const height = submenuMaxHeight.value[String(option.key)] ?? rootMenuMaxHeight.value
  return { class: 'anim-select-menu', style: `max-height: ${height}px` }
}

const nodeProps: NonNullable<DropdownProps['nodeProps']> = (option): NodeAttrs => {
  if (!option.children) return {}
  // Naive types node attrs as string/number values only; event handlers need a cast.
  return {
    onMouseenter: (e: MouseEvent) => {
      const top = (e.currentTarget as HTMLElement).getBoundingClientRect().top
      submenuMaxHeight.value = { ...submenuMaxHeight.value, [String(option.key)]: spaceBelow(top) }
    },
  } as unknown as NodeAttrs
}

// Option keys on the selected animation's path — kept highlighted while navigating.
const selectedKeyPath = computed<Set<string>>(() => {
  const sel = props.value
  if (!sel) return new Set()
  const parts = sel.split('/')
  const set = new Set<string>([sel])
  for (let i = 1; i < parts.length; i++) {
    set.add(`__group__${parts.slice(0, i).join('/')}`)
  }
  return set
})

function renderLabel(option: DropdownOption): VNodeChild {
  const inSelected = selectedKeyPath.value.has(String(option.key ?? ''))
  return h('span', {
    style: inSelected ? { color: '#9d8fff', fontWeight: '600' } : undefined,
  }, String(option.label ?? ''))
}

function onSelect(key: string | number) {
  const name = String(key)
  if (name.startsWith('__group__')) return
  menuOpen.value = false
  // Blur the selector after selection so Space hotkey (play/pause) is not intercepted.
  ;(document.activeElement as HTMLElement | null)?.blur()
  emit('select', name)
}
</script>

<style scoped>
.anim-select {
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--c-border);
  border-radius: 3px;
  background: var(--c-surface);
  color: var(--c-text);
  font-size: 0.8rem;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}
.anim-select:hover,
.anim-select:focus-visible,
.anim-select--open { border-color: var(--c-text-ghost); }
.anim-select--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.anim-select__value,
.anim-select__placeholder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.anim-select__placeholder { color: var(--c-text-ghost); }
.anim-select__clear {
  display: none;
  padding: 0 2px;
  border: none;
  background: none;
  color: var(--c-text-muted);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.anim-select:hover .anim-select__clear { display: block; }
.anim-select__clear:hover { color: var(--c-text-dim); }
.anim-select__arrow {
  flex-shrink: 0;
  color: var(--c-text-muted);
  transition: transform 0.15s;
}
.anim-select--open .anim-select__arrow { transform: rotate(180deg); }
</style>
