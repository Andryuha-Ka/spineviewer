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
          <li><b>History sidebar</b> — last 20 sessions on the picker page; click to reload automatically (Chrome/Edge) or reopen the folder; per-session delete available on hover</li>
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
          <li><b>Placeholder labels</b> — toggle the <code>ph</code> checkbox to show/hide named placeholder overlays; expand the list below to enable/disable individual placeholders; toggle state and per-item visibility saved per skeleton</li>
          <li><b>Placeholder images</b> — expand a skeleton in the Spines tab to see its placeholder slots; drag &amp; drop any image (PNG/JPG/WebP) onto a placeholder drop zone to attach it as a child sprite; multiple images per placeholder are supported; each can be removed individually; click a thumbnail to <b>activate</b> it; disable the sync toggle (🔗) on an image to reposition it by dragging or scale it with the scroll wheel independently; state saved per skeleton</li>
          <li><b>Independent pan/zoom</b> — disable the sync toggle (🔗) on a skeleton or background image in the Spines tab; drag and scroll then affect only that item; hold <kbd>Shift</kbd> to pan/zoom the global scene instead</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Panels -->
      <section class="help-section">
        <h3 class="sec-title">Side Panel Tabs</h3>
        <div class="tab-grid">
          <div class="tab-item">
            <span class="tab-badge">Spines</span>
            <span>Appears when 2+ skeletons or a background image is loaded — click to switch the active skeleton; <b>drag</b> the 6-dot handle to reorder (top = highest z-index on stage); <b>pin</b> (📌) to keep a skeleton visible while browsing others. Viewport, animation, skin, and placeholder state saved per skeleton. <b>Sync toggle</b> (🔗) — disable to move/zoom the active item independently (Shift+drag moves the scene). <b>Clone</b> button duplicates the active skeleton with its full state. <b>Expand</b> a skeleton row (▶) to reveal its placeholder slots — drop images onto them to attach child sprites; click a thumbnail to activate it; each image has its own <b>sync toggle</b> (🔗) — disable to drag/scroll-scale that image independently; <b>clone button</b> duplicates the image into the same placeholder at (0, 0) with the original scale. <b>Drop zone</b> at the bottom — drop an image to set a background, or drop spine files to add new skeletons</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Anim</span>
            <span>Animation list (sorted alphabetically; folder opens on hover; selected path stays highlighted), tracks, queue, skins, events timeline</span>
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

      <!-- Compare Mode -->
      <section class="help-section">
        <h3 class="sec-title">Compare Mode</h3>
        <p class="help-p">Side-by-side visual and structural comparison of two Spine skeletons. Open via <b>⇄ Compare</b> on the picker page or in the viewer toolbar.</p>
        <ul class="help-list">
          <li><b>Two canvases</b> side by side with a resizable divider; per-canvas skin and animation selectors</li>
          <li><b>Time sync</b> (↺) — mirrors playback time from Master to Secondary in real-time</li>
          <li><b>Viewport sync</b> (⊞) — mirrors pan and zoom between canvases</li>
          <li><b>Animation / Skin sync</b> — changes on one side auto-apply the same name to the other when sync is on</li>
          <li><b>Diff panel</b> — runs automatically on load; shows Bones · Slots · Skins · Animations · Events · Constraints</li>
          <li><b>Reskin Overview</b> — animation presence + duration delta, skin diff, event timing diff, placeholder parameter changes; severity badges: 🔴 critical · 🟠 non-critical</li>
          <li><b>Placeholder labels</b> — <code>ph</code> checkbox per canvas; individual checkboxes for each placeholder (only non-removed ones shown)</li>
          <li>Diff panel position (left / right / bottom) is persisted</li>
        </ul>
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
          browser extension. Spine slot containers are named after their attachment — visible in the Inspector's scene tree.
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

      <!-- What's New -->
      <section class="help-section">
        <h3 class="sec-title">What's New</h3>
        <div class="changelog">
          <div class="cl-entry">
            <span class="cl-ver">v1.3.4</span>
            <ul class="help-list">
              <li><b>Placeholder image transform</b> — click a thumbnail in the Spines tab to activate it; disable its sync toggle (🔗) to drag it or scroll-scale it independently inside the slot container; transform saved and restored per skeleton</li>
              <li><b>Clone placeholder image</b> — copy button on each placeholder image entry duplicates it into the same slot at position (0, 0) with the original scale; clone is fully independent</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.3</span>
            <ul class="help-list">
              <li><b>Placeholder images</b> — expand any skeleton in the Spines tab to see its placeholder slots; drop PNG/JPG/WebP images onto a slot to attach them as child sprites at the placeholder's origin; multiple images per placeholder; removable individually; state saved per skeleton</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.2</span>
            <ul class="help-list">
              <li><b>Pixi Inspector</b> — spine slot containers are now named after their attachment; each slot is identifiable by name in the Pixi Inspector scene tree</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.1</span>
            <ul class="help-list">
              <li><b>Viewport sync model</b> — global pan/zoom shared by all spines; desynced items carry scene-space personal offsets; no position jump when toggling sync on/off</li>
              <li><b>Spines panel</b> — Pin, Sync, and Clone buttons always visible</li>
              <li>State persistence fix: global viewport no longer saved/restored per-slot</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.0</span>
            <ul class="help-list">
              <li><b>Background image</b> — drop a PNG/JPG/WebP/AVIF onto the Spines drop zone; z-order DnD, sync toggle, independent pan/zoom</li>
              <li><b>Sync toggle</b> (🔗) per spine/background — disable to move/zoom that item independently; Shift+drag moves the global scene</li>
              <li><b>Clone spine</b> — duplicate the active skeleton with its full state; fully independent copy</li>
              <li><b>Spines drop zone</b> — drop images or spine files directly in the tab; spine files are validated before loading</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.15</span>
            <ul class="help-list">
              <li>Visual pin state indicator per entry in the Spines tab</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.14</span>
            <ul class="help-list">
              <li><b>Progress bar &amp; draw-call graph</b> migrated from HTML overlay to PIXI rendering; seek-on-click/drag routed through the PIXI overlay</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.13</span>
            <ul class="help-list">
              <li>Skin restored on slot switch; <b>drag-to-reorder</b> skeletons (z-order); <b>Pin button</b> per slot</li>
              <li>Per-spine placeholder list with individual checkboxes; toggle state saved per skeleton</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.12</span>
            <ul class="help-list">
              <li><b>Animation list</b> — alphabetically sorted; folder opens on hover; selected path stays highlighted</li>
              <li><b>Placeholder labels</b> — <code>ph</code> checkbox shows named overlays on canvas; individual per-item checkboxes; state saved per skeleton</li>
              <li><b>File history sidebar</b> — last 20 sessions; one-click auto-reload (Chrome/Edge); per-session delete</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.11</span>
            <ul class="help-list">
              <li><b>FreeBone panel</b> (Bones tab) — manually position/rotate unkeyframed bones; free-bone diff in Compare</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.2.0</span>
            <ul class="help-list">
              <li><b>Compare mode</b> — side-by-side comparison; viewport / animation / skin sync; Reskin Overview with severity badges (🔴 / 🟠); auto-diff on load; bone/slot highlight on canvas</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.1.2</span>
            <ul class="help-list">
              <li><b>Multi-Spine</b> — load up to 30 skeletons simultaneously; Spines tab for switching; per-skeleton state preserved independently</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.0.0</span>
            <ul class="help-list">
              <li>Initial release: Spine 3.8–4.2 · Pixi 7 &amp; 8 · animation playback · skins · inspector · atlas viewer · complexity analyzer · export (PNG / Sprite Sheet / GIF / Pose JSON) · keyboard shortcuts</li>
            </ul>
          </div>
        </div>
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

/* Changelog */
.changelog {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cl-entry {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.cl-ver {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
  min-width: 48px;
  text-align: center;
  margin-top: 2px;
}

.cl-entry .help-list {
  flex: 1;
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
