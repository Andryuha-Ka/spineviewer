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
          <li>Pick an animation in the <b>Anim</b> tab flyout — it applies to the current track at once</li>
          <li>Supports <b>tracks 0–11</b> simultaneously — choose the current track in the Anim tab track grid or with <kbd>0</kbd>–<kbd>9</kbd>; with <b>+ Add mode</b> on, a picked animation is appended to the track's list instead of replacing it</li>
          <li>Per-track <b>Loop</b> toggle and animation <b>Queue</b> (chain animations); the global <b>Loop</b> switch in the Anim tab sets the loop of newly selected animations only</li>
          <li><b>List loop</b> — with the track Loop on, a queue of several animations plays in a cycle; played entries stay in the list greyed out</li>
          <li><b>Speed</b> control: 0×–3× with fine slider</li>
          <li><b>Frame stepping</b> in 1/60 s steps — <kbd>←</kbd> <kbd>→</kbd> step the current track, the Anim tab <b>← 1f / 1f →</b> buttons step every running track</li>
          <li><b>Toolbar track controls</b> — pick a skin (synced with Anim → Skins; a Composer mix shows as <i>Composite (N)</i>), pick a track (0–11), set its animation, ▶ to enable the track (and start playback of every enabled track when stopped) or ⏸ to freeze only that track, toggle its Loop or clear it (✕) directly in the top toolbar; works for the active skeleton and for a placeholder child spine selected in the Spines tab</li>
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
          <li>Toggle <b>origin crosshair</b> with the <code>origin</code> checkbox in the top-left corner of the canvas</li>
          <li>Change <b>background color</b> with the <code>bg</code> color input in the top-left corner of the canvas</li>
          <li><b>Settings</b> (⚙) — palette, Dark/Light theme and font size</li>
          <li><b>Placeholder labels</b> — toggle the <code>ph</code> checkbox to show/hide named placeholder overlays; expand the list below to enable/disable individual placeholders; toggle state and per-item visibility saved per skeleton</li>
          <li><b>Placeholder images</b> — expand a skeleton in the Spines tab to see its placeholder slots; drag &amp; drop an image (PNG, JPG, WebP, AVIF or GIF) onto a placeholder drop zone to attach it as a child sprite; multiple images per placeholder are supported; each can be removed individually; click a thumbnail to <b>activate</b> it (or click directly on the sprite on canvas when desynced); disable the sync toggle (🔗) on an image to reposition it by dragging or scale it with the scroll wheel independently; clicking a desynced image of a <b>pinned non-active spine</b> on canvas activates that spine and starts dragging the image in one click; images and child spines of a placeholder stack like the Spines list (the top row renders in front; a newly added or moved-in child is listed first and renders in front, a clone sits directly above its source); state saved per skeleton</li>
          <li><b>Placeholder spines</b> — drop a spine skeleton file onto a placeholder drop zone to attach it as a live child spine inside the container; the child renders and plays simultaneously with the parent; click its sprite on canvas to activate it and control its animation, skins, and tracks independently in the side panels; disable sync (🔗) to reposition and scale it freely inside the container; multiple children per placeholder supported; state saved and restored per skeleton</li>
          <li><b>Independent pan/zoom</b> — disable the sync toggle (🔗) on a skeleton or image layer (including the background) in the Spines tab; drag and scroll then affect only that item; hold <kbd>Shift</kbd> to pan/zoom the global scene instead (Shift+drag = global pan, Shift+scroll = global zoom)</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Panels -->
      <section class="help-section">
        <h3 class="sec-title">Side Panel Tabs</h3>
        <div class="tab-grid">
          <div class="tab-item">
            <span class="tab-badge">Spines</span>
            <span>Always shown — click to switch the active skeleton; <b>drag</b> the 6-dot handle to reorder (top = highest z-index on stage) or drop the row on another skeleton's placeholder to make it a child spine; <b>pin</b> (📌) to keep a skeleton visible while browsing others; click a <b>pinned non-active spine on canvas</b> to activate it directly. The scene pan and zoom are shared; each skeleton's own offsets (when its sync is off), animation, skin, placeholder and playback state are saved per skeleton. <b>Sync toggle</b> (🔗) — disable to move/zoom the active item independently (Shift+drag/scroll moves the scene). <b>Clone</b> button duplicates the active skeleton with its full state. <b>Global toolbar</b> (Expand / Sync / Pin) above the list applies the action to all spines at once; Sync also desyncs all placeholder images; state persists when switching to other tabs. <b>Expand</b> a skeleton row (▶) to reveal its placeholder slots — drop images (PNG, JPG, WebP, AVIF or GIF) or <b>spine skeleton files</b> onto them to attach child sprites or live child spines; click a thumbnail to activate it; each child has its own <b>sync toggle</b> (🔗) — disable to drag/scroll-scale that child independently; for images: <b>clone button</b> duplicates the image at (0, 0) with the original scale; <b>drag</b> an image or child spine row onto another row of either kind to reorder (top row in front; the canvas stacking follows the list) or onto another placeholder drop zone to move it (even across spines); drag a child spine row onto the Spines list to make it a normal skeleton at that position (it keeps its animation and becomes active); drag an image row onto the list to make it an <b>image layer</b> — its own row with a <b>Background</b> checkbox, sync and ✕, ordered and stacked with the skeletons, activated by clicking the row, moved and scaled by drag/scroll when desynced, included in exports; drop a layer row on a placeholder drop zone to turn it back into a placeholder image; child spines can be activated by clicking on canvas to control their animation and skins in the side panels. <b>Background</b> checkbox on a layer row makes it the background — one at a time, always the bottom row and behind everything, no drag handle (rows dropped on it land above it), ✕ removes it, unticking turns it back into a normal layer; a desynced background moves in screen pixels and global Sync leaves it alone. <b>Drop zone</b> at the bottom — drop an image (PNG, JPG, WebP, AVIF or GIF) to add it as a normal image layer at the top of the list (the background is never replaced; only its <b>Background</b> checkbox makes a layer the background), or drop spine files to add new skeletons</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Anim</span>
            <span>Animation list (sorted alphabetically; folder opens on hover; selected path stays highlighted), tracks, queue, skins (<b>Skin Composer</b> combines several skins; on a Spine 3.8 skeleton only the first checked skin is shown, because that runtime cannot merge skins), events table (every event keyframe of the current animations; a row flashes when its event fires)</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Insp</span>
            <span>Bone hierarchy with live transforms; active attachment list with blend mode badges</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Bones</span>
            <span>Shown only while the skeleton has free (unkeyed) bones — numeric X, Y, R inputs and a reset button (↺) per bone pose it live on the canvas; values are not saved</span>
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
            <span>Complexity analyzer — Bones, Slots, Regions, Mask, Meshes, Mesh vertices, Non-normal blends, Atlas VRAM, Atlas utilization and Skeleton size with OK/warn/critical thresholds, optimization hints and a per-animation keyframe table (JSON skeletons only)</span>
          </div>
          <div class="tab-item">
            <span class="tab-badge">Export</span>
            <span>PNG screenshot · Pose JSON · Sprite Sheet · Animated GIF — visible canvas without overlays, Scale 1× / 2× / 4×, transparent or background colour</span>
          </div>
        </div>
      </section>

      <n-divider class="divider" />

      <!-- Compare Mode -->
      <section class="help-section">
        <h3 class="sec-title">Compare Mode</h3>
        <p class="help-p">Side-by-side visual and structural comparison of two Spine skeletons. Open via <b>⇄ Compare</b> on the picker page or in the viewer toolbar.</p>
        <ul class="help-list">
          <li><b>Two canvases</b> side by side with a resizable divider; per-canvas skin and animation pickers with folder submenus</li>
          <li><b>Time sync</b> (↺) — mirrors playback time from Master to Secondary in real-time</li>
          <li><b>Viewport sync</b> (⊞) — mirrors pan and zoom between canvases</li>
          <li><b>Animation / Skin sync</b> — changes on one side auto-apply the same name to the other when sync is on</li>
          <li><b>Diff panel</b> — runs automatically on load; below the Reskin Overview it shows Skeleton · Bones · Slots in JSON mode, or Bones · Slots · Skins · Animations · Events in runtime mode</li>
          <li><b>Reskin Overview</b> — animation presence + duration delta, skin diff, event diff, event timing diff, placeholder presence, constraints (JSON only), free bones (runtime only); severity badges: 🔴 critical · 🟠 non-critical</li>
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
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Pause and step the current track by 1/60 s</td></tr>
            <tr><td><kbd>R</kbd></td><td>Reset pose (clear all tracks)</td></tr>
            <tr><td><kbd>L</kbd></td><td>Toggle loop on current track</td></tr>
            <tr><td><kbd>Shift</kbd> + <kbd>L</kbd></td><td>Toggle loop on all tracks</td></tr>
            <tr><td><kbd>0</kbd> – <kbd>9</kbd></td><td>Select track 0–9</td></tr>
          </tbody>
        </table>
        <p class="help-p">Shortcuts are ignored while <kbd>Ctrl</kbd>, <kbd>Cmd</kbd> or <kbd>Alt</kbd> is held.</p>
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
        <p class="help-p">Spine 3.8, 4.0 and 4.1 skeletons can be mixed in one Pixi 7 session; Spine 4.2 needs Pixi 8.</p>
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
            <span class="cl-ver">v1.3.17</span>
            <ul class="help-list">
              <li><b>Studio Mono theme</b> — monochrome dark/light palette, readable 11px minimum text, larger row buttons</li>
              <li><b>Palette selector</b> — pick Studio Mono, Darkroom Neutral, Slate Scrub, Keyframe Rose or Graphite Teal in ⚙ settings, each in Dark and Light; Darkroom Neutral is the new default</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.16</span>
            <ul class="help-list">
              <li><b>Dropped images become normal layers</b> — an image dropped on the canvas or the Spines drop zone is added as a normal image layer at the top of the list; the background is never replaced, tick <b>Background</b> yourself</li>
              <li><b>New items appear in front</b> — new skeletons and image layers go to the top of the Spines list, and new or moved-in placeholder images and child spines go to the top of their placeholder</li>
              <li><b>Clones appear above their source</b> — a cloned skeleton, placeholder image or child spine is listed directly above the original and renders just in front of it</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.15</span>
            <ul class="help-list">
              <li><b>Placeholder stacking like the Spines list</b> — inside a placeholder the top row renders in front; newly added, cloned or moved-in images and child spines go to the bottom of the tree and render behind</li>
              <li><b>Background checkbox on image layers</b> — any image layer can be the background (one at a time); the background always sits at the bottom of the list and behind everything, has no drag handle and can be removed with ✕</li>
              <li><b>Image drop keeps the old background</b> — dropping an image on the canvas or the Spines drop zone adds it as the new background layer without a confirmation; the previous background stays as a normal layer</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.14</span>
            <ul class="help-list">
              <li><b>Placeholder stacking</b> — images and child spines of a placeholder stack in list order; drag rows of either kind onto each other to reorder; the canvas follows at once, also on pinned skeletons</li>
              <li><b>Child spine to top level</b> — drag a child spine row onto the Spines list to make it a normal skeleton at that position; it keeps its animation and becomes active</li>
              <li><b>Image layers</b> — drag a placeholder image onto the Spines list to make it an image layer: its own row with sync and ✕, ordered and stacked with skeletons, moved and scaled when desynced, included in exports; drop a layer on a placeholder zone to put it back</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.13</span>
            <ul class="help-list">
              <li><b>Mixed Spine versions</b> — 3.8, 4.0 and 4.1 skeletons open together in one Pixi 7 session, each on its own runtime (also as child spines and in Compare); the toolbar shows the active skeleton's version</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.12</span>
            <ul class="help-list">
              <li><b>Export quality</b> — PNG, sprite sheet and GIF capture the visible canvas without progress bars and labels, at 1× / 2× / 4× scale, transparent or on the background colour</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.11</span>
            <ul class="help-list">
              <li><b>List loop</b> — the track Loop on a queue of several animations cycles the whole list; played animations stay in the Anim tab list greyed out</li>
              <li><b>Toolbar skin picker</b> — skin dropdown at the start of the toolbar track controls, synced both ways with the Anim tab Skins; picking a skin there leaves Skin Composer</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.10</span>
            <ul class="help-list">
              <li><b>Move a spine into a placeholder</b> — drag a skeleton row from the Spines list onto another skeleton's placeholder drop zone; it becomes a child spine and keeps its animation and skins</li>
              <li><b>Compare pickers</b> — animation and skin selectors on the compare canvases use the folder flyout</li>
              <li><b>Global Loop</b> sets the loop of newly selected animations only; running tracks keep their own</li>
              <li><b>Frame stepping</b> — keyboard and Anim tab buttons both step 1/60 s</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.9</span>
            <ul class="help-list">
              <li><b>Toolbar track controls</b> — Track selector, animation picker, per-track play/pause, per-track Loop and clear-track button in the top toolbar; selecting a track shows its current animation and loop state, so placeholder child spines can be previewed without switching to the Anim tab</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.7</span>
            <ul class="help-list">
              <li><b>Spine in placeholder</b> — drop a spine skeleton file onto any placeholder drop zone to attach it as a live child spine; it renders and animates inside the placeholder container simultaneously with the parent; click its sprite on canvas to activate it and control animation, skins, and tracks independently; disable sync (🔗) to reposition and scale it freely inside the container</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.6</span>
            <ul class="help-list">
              <li><b>Global toolbar state persistence</b> — Expand / Sync / Pin toolbar state above the Spines list is preserved when switching tabs and restored on return</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.5</span>
            <ul class="help-list">
              <li><b>Drag &amp; drop reorder placeholder images</b> — grab the handle (⠿) on a placeholder image entry and drag it onto another entry in the same placeholder to reorder; z-index updates accordingly</li>
              <li><b>Move image to another placeholder</b> — drag an image entry onto any placeholder drop zone (same or different spine) to reparent it; target spine is activated automatically if needed</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.4</span>
            <ul class="help-list">
              <li><b>Placeholder image transform</b> — click a thumbnail in the Spines tab to activate it; disable its sync toggle (🔗) to drag it or scroll-scale it independently inside the slot container; transform saved and restored per skeleton</li>
              <li><b>Clone placeholder image</b> — copy button on each placeholder image entry duplicates it into the same slot at position (0, 0) with the original scale; clone is fully independent</li>
              <li><b>Canvas activation</b> — click directly on a desynced placeholder image sprite on canvas to activate it (topmost image wins when sprites overlap); drag starts immediately</li>
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
  font-size: 0.875rem;
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
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sec-title {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-ghost);
  margin: 0;
}

.help-p {
  font-size: 0.8125rem;
  color: var(--c-text-dim);
  line-height: 1.5;
  margin: 0;
}

.help-p--warn {
  color: var(--c-warning);
  background: var(--c-warning-soft);
  border: 1px solid var(--c-warning);
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
  font-size: 0.8125rem;
  color: var(--c-text-dim);
  line-height: 1.5;
}

.help-list b {
  color: var(--c-text);
}

code {
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 0.8125rem;
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
  font-size: 0.8125rem;
  color: var(--c-text-dim);
  line-height: 1.45;
}

.tab-badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--c-badge-bg);
  color: var(--c-badge-text);
  border: 1px solid var(--c-badge-border);
  min-width: 40px;
  text-align: center;
}

/* Keyboard table */
.kbd-table {
  border-collapse: collapse;
  font-size: 0.8125rem;
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
  font-size: 0.6875rem;
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
  font-size: 0.8125rem;
  width: 100%;
}

.ver-table th,
.ver-table td {
  padding: 4px 10px;
  text-align: left;
  border: 1px solid var(--c-border-dim);
}

.ver-table th {
  font-size: 0.75rem;
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
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--c-success-soft);
  color: var(--c-success);
  border: 1px solid var(--c-success);
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
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--c-text);
}

.about-link {
  font-size: 0.8125rem;
  color: var(--c-accent);
  text-decoration: none;
  transition: color 0.15s;
}

.about-link:hover {
  color: var(--c-accent-hover);
  text-decoration: underline;
}

.about-copy {
  font-size: 0.8125rem;
  color: var(--c-text-muted);
}

.about-ver {
  font-size: 0.75rem;
  color: var(--c-text-ghost);
  letter-spacing: 0.06em;
}

:global(html.theme-dark .help-modal-card) {
  outline: 1px solid var(--c-border-strong);
  box-shadow: var(--c-modal-glow), 0 24px 64px var(--c-shadow-strong);
}
</style>
