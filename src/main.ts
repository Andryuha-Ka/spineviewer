/**
 * @file main.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/themes.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
