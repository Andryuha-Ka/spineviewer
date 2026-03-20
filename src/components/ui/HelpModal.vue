<!--
 * @file HelpModal.vue
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
-->

<template>
  <button class="help-btn" title="Help" @click="open = true">?</button>

  <n-modal
    v-model:show="open"
    :mask-closable="true"
    :close-on-esc="true"
    preset="card"
    class="help-modal-card"
    title="Spine Viewer Pro — Help"
    :style="{ maxWidth: '640px', width: '92vw' }"
  >
    <div class="help-body">

      <!-- File Loading -->
      <section class="help-section">
        <h3 class="sec-title">File Loading</h3>
        <ul class="help-list">
          <li><b>Drag &amp; drop</b> files or a folder onto the drop zone — or use <b>Choose Files / Choose Folder</b></li>
          <li>Supported skeletons: <code>.json</code>, <code>.skel</code></li>
          <li>Spine version is detected automatically from the file header</li>
          <li>Supported image formats: PNG · JPG · WebP · AVIF</li>
          <li>Up to <b>30 skeletons</b> can be loaded at once (use the <b>Spines</b> tab to switch)</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Playback -->
      <section class="help-section">
        <h3 class="sec-title">Playback</h3>
        <ul class="help-list">
          <li>Select an animation in the <b>Anim</b> tab and click <b>Set</b> or double-click the row</li>
          <li>Supports <b>tracks 0–11</b> simultaneously — add more via the <b>+</b> button</li>
          <li>Per-track <b>Loop</b> toggle and animation <b>Queue</b> (chain animations)</li>
          <li><b>Speed</b> control: 0×–3× with fine slider</li>
          <li><b>Frame stepping</b> ±1 frame at 30 fps via keyboard</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Viewport -->
      <section class="help-section">
        <h3 class="sec-title">Viewport</h3>
        <ul class="help-list">
          <li><b>Pan</b> — left mouse drag</li>
          <li><b>Zoom</b> — scroll wheel (0.05×–20×)</li>
          <li><b>Reset view</b> — double-click the canvas</li>
          <li>Toggle <b>origin crosshair</b> in settings (⚙)</li>
          <li>Change <b>background color</b> via the color picker in the bottom-right corner of the canvas</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Panels -->
      <section class="help-section">
        <h3 class="sec-title">Side Panel Tabs</h3>
        <div class="tab-grid">
          <div class="tab-item">
            <span class="tab-badge">Spines</span>
            <span>Appears when 2+ skeletons are loaded — lists all slots, click to switch the active skeleton. Each skeleton's viewport, animation, and playback state is saved independently</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Anim</span>
            <span>Animation list, tracks, queue, skins, events timeline</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Insp</span>
            <span>Bone hierarchy with live transforms; active attachment list with blend mode badges</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Atlas</span>
            <span>Visual atlas page viewer; region search; seen/unseen tracking; utilization %</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Perf</span>
            <span>FPS graph, draw calls, VRAM estimate, JS heap, slow frames &amp; long tasks log</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Compl</span>
            <span>Complexity analyzer — bone/slot/keyframe counts with OK/warn/critical thresholds and optimization hints</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Export</span>
            <span>PNG screenshot · Pose JSON · Sprite Sheet · Animated GIF</span>
          </div>
        </div>
      </section>

      <n-divider class="divider" />

      <!-- Keyboard shortcuts -->
      <section class="help-section">
        <h3 class="sec-title">Keyboard Shortcuts</h3>
        <table class="kbd-table">
          <tbody>
            <tr><td><kbd>Space</kbd></td><td>Play / Pause</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Step −1 / +1 frame</td></tr>
            <tr><td><kbd>R</kbd></td><td>Reset pose (clear all tracks)</td></tr>
            <tr><td><kbd>L</kbd></td><td>Toggle loop on current track</td></tr>
            <tr><td><kbd>Shift</kbd> + <kbd>L</kbd></td><td>Toggle loop on all tracks</td></tr>
            <tr><td><kbd>0</kbd> – <kbd>9</kbd></td><td>Select track 0–9</td></tr>
          </tbody>
        </table>
      </section>

      <n-divider class="divider" />

      <!-- Supported versions -->
      <section class="help-section">
        <h3 class="sec-title">Supported Versions</h3>
        <table class="ver-table">
          <thead>
            <tr><th>Pixi.js</th><th>Spine Runtime</th></tr>
          </thead>
          <tbody>
            <tr><td>Pixi 7</td><td>Spine 3.8 · 4.0 · 4.1</td></tr>
            <tr><td>Pixi 8</td><td>Spine 4.2</td></tr>
          </tbody>
        </table>
      </section>

      <n-divider class="divider" />

      <!-- Pixi DevTools -->
      <section class="help-section">
        <h3 class="sec-title">Pixi DevTools</h3>
        <p class="help-p">
          The app exposes <code>globalThis.__PIXI_APP__</code> for the
          <a class="about-link" href="https://chromewebstore.google.com/detail/pixi-inspector/aamddddknhcagpehecnhphigffljadon" target="_blank" rel="noopener">Pixi Inspector</a>
          browser extension.
        </p>
        <p class="help-p help-p--warn">
          After a hard page reload (Ctrl+R) with DevTools already open, the panel may lose its execution context.
          This is a known extension bug — it doesn't re-register after navigation.
        </p>
        <ul class="help-list">
          <li>Open DevTools <b>after</b> the viewer is loaded and animation is playing</li>
          <li>Or navigate picker → viewer without reloading the page</li>
          <li>Or close and reopen DevTools after a page reload</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- About -->
      <section class="help-section">
        <h3 class="sec-title">About</h3>
        <div class="about-block">
          <span class="about-name">Andrii Karpus</span>
          <a class="about-link" href="mailto:andryuha.ka@gmail.com">andryuha.ka@gmail.com</a>
          <span class="about-copy">&copy; 2026 Andrii Karpus</span>
          <span class="about-ver">v{{ appVersion }}</span>
        </div>
      </section>

    </div>
  </n-modal>
</template>

<script setup lang="ts">
const open = ref(false)
const appVersion = __APP_VERSION__
</script>

<style scoped>
.help-btn {
  background: none;
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s;
}

.help-btn:hover {
  color: var(--c-text-dim);
  border-color: var(--c-text-ghost);
}

.help-body {
  display: flex;
  flex-direction: column;
  max-height: 72vh;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-text-ghost) transparent;
}

.help-body::-webkit-scrollbar {
  width: 4px;
}

.help-body::-webkit-scrollbar-track {
  background: transparent;
}

.help-body::-webkit-scrollbar-thumb {
  background: var(--c-text-ghost);
  border-radius: 2px;
}

.help-body::-webkit-scrollbar-thumb:hover {
  background: var(--c-text-faint);
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sec-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-ghost);
  margin: 0;
}

.help-p {
  font-size: 0.82rem;
  color: var(--c-text-dim);
  line-height: 1.5;
  margin: 0;
}

.help-p--warn {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.07);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 5px;
  padding: 5px 8px;
}

.help-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.help-list li {
  font-size: 0.82rem;
  color: var(--c-text-dim);
  line-height: 1.5;
}

.help-list b {
  color: var(--c-text);
}

code {
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 0.78rem;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 3px;
  padding: 1px 4px;
  color: var(--c-text-muted);
}

.divider {
  margin: 12px 0 !important;
}

/* Tab grid */
.tab-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tab-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 0.82rem;
  color: var(--c-text-dim);
  line-height: 1.45;
}

.tab-badge {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(124, 106, 245, 0.14);
  color: #9d8fff;
  border: 1px solid rgba(124, 106, 245, 0.3);
  min-width: 40px;
  text-align: center;
}

/* Keyboard table */
.kbd-table {
  border-collapse: collapse;
  font-size: 0.82rem;
  width: 100%;
}

.kbd-table td {
  padding: 3px 0;
  vertical-align: middle;
}

.kbd-table td:first-child {
  width: 160px;
  white-space: nowrap;
}

.kbd-table td:last-child {
  color: var(--c-text-dim);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-family: inherit;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text-muted);
  min-width: 24px;
  white-space: nowrap;
}

/* Version table */
.ver-table {
  border-collapse: collapse;
  font-size: 0.82rem;
  width: 100%;
}

.ver-table th,
.ver-table td {
  padding: 4px 10px;
  text-align: left;
  border: 1px solid var(--c-border-dim);
}

.ver-table th {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-text-ghost);
  background: var(--c-surface);
}

.ver-table td {
  color: var(--c-text-dim);
}

/* About block */
.about-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0 2px;
}

.about-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--c-text);
}

.about-link {
  font-size: 0.82rem;
  color: #7c6af5;
  text-decoration: none;
  transition: color 0.15s;
}

.about-link:hover {
  color: #9d8fff;
  text-decoration: underline;
}

.about-copy {
  font-size: 0.78rem;
  color: var(--c-text-muted);
}

.about-ver {
  font-size: 0.7rem;
  color: var(--c-text-ghost);
  letter-spacing: 0.06em;
}
</style>
