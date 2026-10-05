/**
 * @file useSettingsStore.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { defineStore } from 'pinia'
import { isPalette, type PaletteName } from '@/core/utils/themePalette'

type Theme    = 'dark' | 'light'
export type FontSize = 'sm' | 'md' | 'lg'

export const useSettingsStore = defineStore('settings', () => {
  const storedTheme    = localStorage.getItem('sv-theme') as Theme
  const storedFontSize = localStorage.getItem('sv-fontsize') as FontSize
  const theme    = ref<Theme>(['dark', 'light'].includes(storedTheme) ? storedTheme : 'dark')
  const fontSize = ref<FontSize>(['sm', 'md', 'lg'].includes(storedFontSize) ? storedFontSize : 'sm')
  const storedPalette = localStorage.getItem('svp:theme:palette')
  const palette  = ref<PaletteName>(isPalette(storedPalette) ? storedPalette : 'darkroom')

  watch(theme,    v => localStorage.setItem('sv-theme', v))
  watch(fontSize, v => localStorage.setItem('sv-fontsize', v))
  watch(palette,  v => localStorage.setItem('svp:theme:palette', v))

  return { theme, fontSize, palette }
})
