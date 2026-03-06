import { defineStore } from 'pinia'

export type Theme    = 'dark' | 'light'
export type FontSize = 'sm' | 'md' | 'lg'

export const useSettingsStore = defineStore('settings', () => {
  const theme    = ref<Theme>(   (localStorage.getItem('sv-theme')    as Theme)    ?? 'dark')
  const fontSize = ref<FontSize>((localStorage.getItem('sv-fontsize') as FontSize) ?? 'sm')

  watch(theme,    v => localStorage.setItem('sv-theme', v))
  watch(fontSize, v => localStorage.setItem('sv-fontsize', v))

  return { theme, fontSize }
})
