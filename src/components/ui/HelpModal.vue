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
    :style="{ maxWidth: '1120px', width: '94vw' }"
  >
    <div ref="bodyEl" class="help-body" @scroll="onScroll">

      <nav ref="navEl" class="help-nav" aria-label="Help sections">
        <button
          v-for="s in sections"
          :key="s.key"
          type="button"
          class="nav-item"
          :class="{ active: active === s.key }"
          :data-key="s.key"
          :title="s.title"
          :aria-current="active === s.key ? 'true' : undefined"
          @click="jump(s.key)"
        >{{ s.label }}</button>
      </nav>

      <!-- File Loading -->
      <section class="help-section" data-sec="files">
        <h3 class="sec-title" tabindex="-1">File Loading</h3>
        <ul class="help-list">
          <li><b>Drag &amp; drop</b> files or a folder onto the drop zone — or use <b>Choose Files / Choose Folder</b></li>
          <li>Skeletons: <code>.json</code>, <code>.skel</code> · images: PNG · JPG · WebP · AVIF</li>
          <li><b>Zip archives</b> — a <code>.zip</code> (e.g. a keyframe.it or Spine export) is unpacked in the browser
            <ul>
              <li>skeletons, atlases and images at any folder depth are picked up</li>
              <li>other entries, <code>__MACOSX/</code>, hidden files and nested archives are ignored</li>
              <li>zipped and loose files of one drop are grouped together</li>
            </ul>
          </li>
          <li><b>Version detection</b> — automatic, from the file header
            <ul>
              <li>a Spine 4.3 file selects Pixi 8 + Spine 4.3</li>
              <li>a file of an unsupported version is marked with an error and <b>Open Viewer</b> stays disabled</li>
            </ul>
          </li>
          <li>Up to <b>30 skeletons</b> at once — switch between them in the <b>Spines</b> tab</li>
          <li><b>History sidebar</b> on the picker page
            <ul>
              <li>last 20 sessions</li>
              <li>click to reload automatically (Chrome/Edge) or reopen the folder</li>
              <li>per-session delete on hover</li>
            </ul>
          </li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Playback -->
      <section class="help-section" data-sec="playback">
        <h3 class="sec-title" tabindex="-1">Playback</h3>
        <ul class="help-list">
          <li>Pick an animation in the <b>Anim</b> tab flyout — it applies to the current track at once</li>
          <li><b>Tracks 0–11</b> play simultaneously
            <ul>
              <li>choose the current track in the Anim tab track grid or with <kbd>0</kbd>–<kbd>9</kbd></li>
              <li>with <b>+ Add mode</b> on, a picked animation is appended to the track's list instead of replacing it</li>
            </ul>
          </li>
          <li>Per-track <b>Loop</b> toggle and animation <b>Queue</b> (chain animations)</li>
          <li><b>Global Loop</b> switch (Anim tab) — sets Loop on every active track; the default for newly selected animations</li>
          <li><b>List loop</b> — with the track Loop on, a queue of several animations plays in a cycle; played entries stay in the list greyed out</li>
          <li><b>Speed</b> — 0×–3× with fine slider</li>
          <li><b>Frame stepping</b> in 1/60 s steps
            <ul>
              <li><kbd>←</kbd> <kbd>→</kbd> step the current track</li>
              <li>the Anim tab <b>← 1f / 1f →</b> buttons step every running track</li>
            </ul>
          </li>
          <li><b>Toolbar track controls</b> — directly in the top toolbar
            <ul>
              <li><b>Skin</b> — synced with Anim → Skins; a Composer mix shows as <i>Composite (N)</i></li>
              <li><b>Track</b> (0–11) and its <b>animation</b></li>
              <li><b>▶</b> enables the track (and starts playback of every enabled track when stopped); <b>⏸</b> freezes only that track</li>
              <li><b>Loop</b> toggle; <b>✕</b> clears the track</li>
              <li>works for the active skeleton and for a placeholder child spine selected in the Spines tab</li>
            </ul>
          </li>
        </ul>
        <h4 class="sub-title">Per-track options (Anim tab, each active track row)</h4>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Option</th><th>Spine versions</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Mix (ms)</b></td>
              <td>every</td>
              <td>0–5000 ms, default 0 = instant; crossfades every new or queued animation from the previous one on that track; queued animations start blending that many milliseconds before the previous one ends; the first animation on an empty track starts instantly</td>
            </tr>
            <tr>
              <td><b>Additive</b></td>
              <td>4.3 only</td>
              <td>checkbox on the track row</td>
            </tr>
            <tr>
              <td><b>Curve</b></td>
              <td>4.3 only</td>
              <td>Linear, Smooth, Slow-fast, Fast-slow, Circle — shapes the Mix (ms) crossfade</td>
            </tr>
          </tbody>
        </table></div>
        <p class="help-p">Mix (ms), Additive and Curve are saved per skeleton like loop and speed.</p>
      </section>

      <n-divider class="divider" />

      <!-- Viewport -->
      <section class="help-section" data-sec="viewport">
        <h3 class="sec-title" tabindex="-1">Viewport</h3>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Action</th><th>How</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Pan</b></td><td>left mouse drag</td></tr>
            <tr><td><b>Zoom</b></td><td>scroll wheel (0.05×–20×)</td></tr>
            <tr><td><b>Reset view</b></td><td>double-click the canvas</td></tr>
            <tr><td><b>Global pan / zoom</b></td><td>hold <kbd>Shift</kbd> while an item is desynced: Shift+drag = global pan, Shift+scroll = global zoom</td></tr>
          </tbody>
        </table></div>
        <ul class="help-list">
          <li><b>Canvas corner controls</b> (top-left)
            <ul>
              <li><code>origin</code> checkbox — toggles the <b>origin crosshair</b></li>
              <li><code>bg</code> colour input — changes the <b>background color</b></li>
              <li><code>ph</code> checkbox — shows/hides named <b>placeholder labels</b>; expand the list below to enable/disable individual placeholders; toggle state and per-item visibility saved per skeleton</li>
            </ul>
          </li>
          <li><b>Settings</b> (⚙) — palette, Dark/Light theme and font size</li>
          <li><b>Independent pan/zoom</b> — disable the sync toggle (🔗) on a skeleton or image layer (including the background) in the Spines tab; drag and scroll then affect only that item</li>
          <li><b>Placeholder images and spines on canvas</b> (attaching and list management: see Panels → Spines)
            <ul>
              <li>click a desynced placeholder image sprite on canvas to <b>activate</b> it</li>
              <li>with sync (🔗) off, drag an image to reposition it or scale it with the scroll wheel independently</li>
              <li>clicking a desynced image of a <b>pinned non-active spine</b> activates that spine and starts dragging the image in one click</li>
              <li>a child spine renders and plays simultaneously with the parent; click its sprite to activate it and control its animation, skins and tracks independently in the side panels</li>
              <li>with sync (🔗) off, a child spine is repositioned and scaled freely inside the container</li>
              <li>images and child spines of a placeholder stack like the Spines list: the top row renders in front; a newly added or moved-in child is listed first and renders in front; a clone sits directly above its source</li>
              <li>state saved and restored per skeleton</li>
            </ul>
          </li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Panels -->
      <section class="help-section" data-sec="panels">
        <h3 class="sec-title" tabindex="-1">Side Panel Tabs</h3>
        <div class="table-wrap"><table class="help-table tabs-table">
          <thead>
            <tr><th>Tab</th><th>What it does</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="tab-badge">Spines</span></td>
              <td>Switch, reorder, pin, clone and sync skeletons; placeholders, image layers, background, drop zone</td>
              <td>Always shown; see <i>Spines tab</i> below</td>
            </tr>
            <tr>
              <td><span class="tab-badge">Anim</span></td>
              <td>
                <ul class="cell-list">
                  <li>animation list — sorted alphabetically; folder opens on hover; selected path stays highlighted</li>
                  <li>tracks, queue</li>
                  <li>skins — <b>Skin Composer</b> combines several skins</li>
                  <li>events table — every event keyframe of the current animations; a row flashes when its event fires</li>
                </ul>
              </td>
              <td>Spine 3.8: only the first checked skin is shown (that runtime cannot merge skins)</td>
            </tr>
            <tr>
              <td><span class="tab-badge">Insp</span></td>
              <td>Bone hierarchy with live transforms; bones that draw nothing right now are dimmed, hover for the reason and the constraints driving the bone; the selected bone's canvas crosshair is green, grey while it draws nothing; active attachment list with blend mode badges; slider constraints with live time and mix</td>
              <td>Sliders: Spine 4.3</td>
            </tr>
            <tr>
              <td><span class="tab-badge">Bones</span></td>
              <td><b>Bone</b> editor for any bone: live overrides, setup pose, keys, undo; free bones and sliders</td>
              <td>See <i>Bones tab</i> below</td>
            </tr>
            <tr>
              <td><span class="tab-badge">Atlas</span></td>
              <td>Visual atlas page viewer; region search; seen/unseen tracking; utilization %</td>
              <td></td>
            </tr>
            <tr>
              <td><span class="tab-badge">Perf</span></td>
              <td>FPS graph, draw calls, VRAM estimate, JS heap, slow frames &amp; long tasks log</td>
              <td></td>
            </tr>
            <tr>
              <td><span class="tab-badge">Compl</span></td>
              <td>
                Complexity analyzer with OK/warn/critical thresholds and optimization hints
                <ul class="cell-list">
                  <li>Bones, Slots, Regions, Mask, Meshes, Mesh vertices, Non-normal blends, Atlas VRAM, Atlas utilization, Skeleton size, Sliders</li>
                  <li>per-animation keyframe table</li>
                </ul>
              </td>
              <td>Sliders: Spine 4.3; keyframe table: JSON skeletons only</td>
            </tr>
            <tr>
              <td><span class="tab-badge">Export</span></td>
              <td>
                <ul class="cell-list">
                  <li>PNG screenshot · Pose JSON · Sprite Sheet · Animated GIF — visible canvas without overlays, Scale 1× / 2× / 4×, transparent or background colour</li>
                  <li><b>Skeleton</b> — <b>Export Spine JSON (.zip)</b> downloads <code>&lt;name&gt;.zip</code> with the (edited) skeleton as Spine JSON in its own version, the source atlas and page images</li>
                  <li>binary <code>.skel</code> skeletons are converted (warnings listed)</li>
                  <li>exporting keeps the changes and clears the unsaved ★ tooltip</li>
                </ul>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table></div>

        <h4 class="sub-title">Spines tab</h4>
        <ul class="help-list">
          <li><b>Rows</b>
            <ul>
              <li>click a row to switch the active skeleton</li>
              <li><b>drag</b> the 6-dot handle to reorder (top = highest z-index on stage), or drop the row on another skeleton's placeholder to make it a child spine</li>
              <li><b>pin</b> (📌) keeps a skeleton visible while browsing others; click a <b>pinned non-active spine on canvas</b> to activate it directly</li>
              <li><b>sync toggle</b> (🔗) — disable to move/zoom the active item independently (Shift+drag/scroll moves the scene)</li>
              <li><b>clone</b> duplicates the active skeleton with its full state</li>
              <li>the scene pan and zoom are shared; each skeleton's own offsets (when its sync is off), animation, skin, placeholder and playback state are saved per skeleton</li>
            </ul>
          </li>
          <li><b>Global toolbar</b> (Expand / Sync / Pin) above the list
            <ul>
              <li>applies the action to all spines at once</li>
              <li>Sync also desyncs all placeholder images</li>
              <li>its state persists when switching to other tabs</li>
            </ul>
          </li>
          <li><b>Placeholders</b> — <b>expand</b> a skeleton row (▶) to reveal its placeholder slots (canvas interaction: see Viewport)
            <ul>
              <li>drop images (PNG, JPG, WebP, AVIF or GIF) onto a slot to attach child sprites; multiple per placeholder, each removable individually</li>
              <li>drop <b>spine skeleton files</b> onto a slot to attach live child spines; multiple per placeholder</li>
              <li>click a thumbnail to activate it; each child has its own <b>sync toggle</b> (🔗) — disable to drag/scroll-scale that child independently</li>
              <li>image <b>clone button</b> duplicates the image at (0, 0) with the original scale</li>
              <li><b>drag</b> an image or child spine row onto another row of either kind to reorder (top row in front; the canvas stacking follows the list), or onto another placeholder drop zone to move it (even across spines)</li>
              <li>drag a child spine row onto the Spines list to make it a normal skeleton at that position (it keeps its animation and becomes active)</li>
            </ul>
          </li>
          <li><b>Image layers</b> — drag an image row onto the list to make it a layer
            <ul>
              <li>its own row with a <b>Background</b> checkbox, sync and ✕</li>
              <li>ordered and stacked with the skeletons; included in exports</li>
              <li>activated by clicking the row; moved and scaled by drag/scroll when desynced</li>
              <li>drop a layer row on a placeholder drop zone to turn it back into a placeholder image</li>
            </ul>
          </li>
          <li><b>Background</b> — the <b>Background</b> checkbox on a layer row makes it the background
            <ul>
              <li>one at a time, always the bottom row and behind everything</li>
              <li>no drag handle; rows dropped on it land above it</li>
              <li>✕ removes it; unticking turns it back into a normal layer</li>
              <li>a desynced background moves in screen pixels and global Sync leaves it alone</li>
            </ul>
          </li>
          <li><b>Drop zone</b> at the bottom
            <ul>
              <li>an image (same formats) is added as a normal image layer at the top of the list</li>
              <li>the background is never replaced; only its <b>Background</b> checkbox makes a layer the background</li>
              <li>spine files are added as new skeletons</li>
            </ul>
          </li>
        </ul>

        <h4 class="sub-title">Bones tab</h4>
        <ul class="help-list">
          <li><b>Override fields</b> — pick any bone here or in the Insp tab
            <ul>
              <li>X, Y, Rotation, Scale X/Y, Shear X/Y hold a live <b>override</b> on top of the animation</li>
              <li>● marks overridden inputs</li>
              <li>bones that draw nothing right now are dimmed in the picker; for such a bone a warning <i>This bone draws nothing right now: …</i> (not in the applied skins, attachments hidden, or no drawn attachments) appears above the inputs</li>
              <li><i>Driven by …</i> names the IK, transform, path constraints or 4.3 sliders acting on the bone — their constrained properties ignore local edits</li>
              <li>editing stays allowed in both cases</li>
              <li>saved per skeleton, lost on page reload</li>
            </ul>
          </li>
          <li><b>Actions</b>
            <ul>
              <li><b>Release</b> drops the bone's overrides</li>
              <li><b>Apply to setup pose</b> writes them (or the current pose) into the setup pose</li>
              <li><b>Key at current time</b> keys them into the current track's animation</li>
              <li><b>New animation</b> creates an empty one</li>
              <li><b>Undo / Redo</b> (last 20 data edits) and <b>Revert skeleton</b></li>
            </ul>
          </li>
          <li><b>Edited marker ★</b> — shown here and in the Spines list until exported</li>
          <li><b>Free bones and Sliders</b>
            <ul>
              <li>free (unkeyed) bones with X, Y, R and reset (↺)</li>
              <li><b>Sliders</b> (Spine 4.3) with Time and Mix</li>
            </ul>
          </li>
          <li><b>Units</b> — skeleton units, degrees counter-clockwise, y up, local to the parent bone</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Compare Mode -->
      <section class="help-section" data-sec="compare">
        <h3 class="sec-title" tabindex="-1">Compare Mode</h3>
        <p class="help-p">Side-by-side visual and structural comparison of two Spine skeletons. Open via <b>⇄ Compare</b> on the picker page or in the viewer toolbar.</p>
        <ul class="help-list">
          <li><b>Two canvases</b> side by side with a resizable divider; per-canvas skin and animation pickers with folder submenus</li>
        </ul>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Control</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Time sync</b> (↺)</td><td>mirrors playback time from Master to Secondary in real-time</td></tr>
            <tr><td><b>Viewport sync</b> (⊞)</td><td>mirrors pan and zoom between canvases</td></tr>
            <tr><td><b>Animation / Skin sync</b></td><td>when on, a change on one side auto-applies the same name to the other</td></tr>
          </tbody>
        </table></div>
        <ul class="help-list">
          <li><b>Diff panel</b> — runs automatically on load
            <ul>
              <li>below the Reskin Overview: Skeleton · Bones · Slots in JSON mode</li>
              <li>Bones · Slots · Skins · Animations · Events in runtime mode</li>
              <li>its position (left / right / bottom) is persisted</li>
            </ul>
          </li>
          <li><b>Reskin Overview</b>
            <ul>
              <li>animation presence + duration delta, skin diff, event diff, event timing diff, placeholder presence</li>
              <li>constraints (JSON only), sliders (Spine 4.3, JSON only), free bones (runtime only)</li>
              <li>severity badges: 🔴 critical · 🟠 non-critical</li>
              <li>the header shows <b>ok</b> when nothing is critical</li>
            </ul>
          </li>
          <li><b>Placeholder labels</b> — <code>ph</code> checkbox per canvas; individual checkboxes for each placeholder (only non-removed ones shown)</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- Keyboard shortcuts -->
      <section class="help-section" data-sec="shortcuts">
        <h3 class="sec-title" tabindex="-1">Keyboard Shortcuts</h3>
        <div class="table-wrap"><table class="help-table keys-table">
          <thead>
            <tr><th>Key</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Space</kbd></td><td>Play / Pause</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Pause and step the current track by 1/60 s</td></tr>
            <tr><td><kbd>R</kbd></td><td>Reset pose (clear all tracks)</td></tr>
            <tr><td><kbd>L</kbd></td><td>Toggle loop on current track</td></tr>
            <tr><td><kbd>Shift</kbd> + <kbd>L</kbd></td><td>Toggle loop on all tracks</td></tr>
            <tr><td><kbd>0</kbd> – <kbd>9</kbd></td><td>Select track 0–9</td></tr>
          </tbody>
        </table></div>
        <p class="help-p">Shortcuts are ignored while <kbd>Ctrl</kbd>, <kbd>Cmd</kbd> or <kbd>Alt</kbd> is held.</p>
      </section>

      <n-divider class="divider" />

      <!-- Supported versions -->
      <section class="help-section" data-sec="versions">
        <h3 class="sec-title" tabindex="-1">Supported Versions</h3>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Pixi</th><th>Spine runtimes</th><th>Mix in one session</th></tr>
          </thead>
          <tbody>
            <tr><td>Pixi 7</td><td>Spine 3.8 · 4.0 · 4.1</td><td>3.8, 4.0 and 4.1</td></tr>
            <tr><td>Pixi 8</td><td>Spine 4.2 · 4.3</td><td>4.2 and 4.3</td></tr>
          </tbody>
        </table></div>
        <p class="help-p">Mixing works on the two Compare canvases too.</p>
      </section>

      <n-divider class="divider" />

      <!-- API & MCP -->
      <section class="help-section" data-sec="api">
        <h3 class="sec-title" tabindex="-1">API &amp; MCP</h3>
        <p class="help-p">
          Scripts, the DevTools console and AI agents drive the viewer through <code>window.svp</code>, API version <b class="api-ver">{{ apiVersion }}</b>.
          Every method returns a Promise and calls run one at a time; <code>svp.help()</code> lists the methods with their arguments.
        </p>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Group</th><th>Methods</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Session</b></td><td><code>info</code>, <code>help</code>, <code>load</code> (text, base64 or zip), <code>reset</code>, <code>listSlots</code>, <code>selectSlot</code>, <code>getSkeleton</code></td></tr>
            <tr><td><b>Playback &amp; skins</b></td><td><code>setAnimation</code>, <code>addAnimation</code>, <code>clearTrack(s)</code>, <code>seek</code>, <code>play</code>, <code>pause</code>, <code>setSpeed</code>, <code>setTrackOptions</code>, <code>getTracks</code>, <code>setSkins</code>, <code>getSkins</code></td></tr>
            <tr><td><b>Bones</b></td><td><code>getBones</code>, <code>setBoneOverride</code>, <code>applyPose</code>, <code>releaseOverride</code>, <code>getOverrides</code></td></tr>
            <tr><td><b>Editing</b></td><td><code>setSetupPose</code>, <code>applyOverridesToSetupPose</code>, <code>createAnimation</code>, <code>getKeys</code>, <code>setKey</code>, <code>deleteKey</code>, <code>setKeyEasing</code>, <code>keyCurrentPose</code>, <code>buildAnimation</code>, <code>undo</code>, <code>redo</code>, <code>getEditState</code>, <code>revertToSource</code></td></tr>
            <tr><td><b>Export</b></td><td><code>capturePng</code>, <code>getPose</code>, <code>exportSkeleton</code></td></tr>
          </tbody>
        </table></div>
        <dl class="help-dl">
          <dt>Units</dt>
          <dd>positions in skeleton units, rotation and shear in degrees counter-clockwise, scale as a factor, times in seconds, y up; bone values are local to the parent bone</dd>
          <dt>Errors</dt>
          <dd>calls reject with an <code>SvpError</code>: <code>{ name: "SvpError", code, message: "CODE: explanation" }</code>, codes <code>NOT_IN_VIEWER</code>, <code>NO_SKELETON</code>, <code>NOT_FOUND</code>, <code>INVALID_ARGUMENT</code>, <code>INVALID_STATE</code>, <code>UNSAVED_EDITS</code>, <code>LOAD_FAILED</code>, <code>EXPORT_FAILED</code>, <code>UNSUPPORTED</code></dd>
          <dt>MCP server</dt>
          <dd><code>svp-mcp</code> opens the viewer in Chrome and exposes the API as MCP tools: <code>npx -y spine-viewer-pro-mcp --headed</code> (<code>--headed</code> shows the browser window; it opens the production viewer, <code>--url &lt;address&gt;</code> points it at another viewer)</dd>
        </dl>

        <h4 class="sub-title">Quick start</h4>
        <p class="help-p">Works on the hosted viewer — nothing to install: open <a class="about-link" href="https://andryuha-ka.github.io/spineviewer/" target="_blank" rel="noopener">andryuha-ka.github.io/spineviewer</a>, load your files, press <kbd>F12</kbd> → Console.</p>
        <p class="help-p">Paste a line; replace the bone and animation names with ones from <code>getSkeleton()</code>.</p>
        <div class="snippets">
          <div v-for="s in quickStart" :key="s.code" class="snippet">
            <span class="snippet-label">{{ s.label }}</span>
            <pre class="snippet-code"><code>{{ s.code }}</code></pre>
            <button class="copy-btn" title="Copy" @click="copyText(s.code)"><CopyIcon /></button>
          </div>
        </div>

        <h4 class="sub-title">Editing semantics</h4>
        <ul class="help-list">
          <li><b>Overrides</b> (<code>setBoneOverride</code>, <code>applyPose</code>) are live values held over every animation until <code>releaseOverride</code>; they change no data until baked with <code>applyOverridesToSetupPose</code> or keyed with <code>keyCurrentPose</code></li>
          <li><b>Keys</b> (<code>setKey</code>, <code>buildAnimation</code>) are offsets from the setup pose: <code>rotation: 20</code> means 20° more than setup, <code>x: 0</code> means the setup position</li>
          <li><b>Scale</b> keys are factors of the setup scale (<code>1</code> = unchanged)</li>
          <li><b>Key types</b> — <code>rotate</code>, <code>translate</code>, <code>scale</code>, <code>shear</code> and the split <code>translatex</code> … <code>sheary</code></li>
          <li><b>Easing</b> — <code>"linear"</code>, <code>"stepped"</code> or <code>[cx1, cy1, cx2, cy2]</code></li>
          <li><b>Data edits</b> are undoable (<code>undo</code> / <code>redo</code>); <code>getEditState()</code> shows unsaved edits, which make <code>load</code> and <code>reset</code> reject with <code>UNSAVED_EDITS</code> unless <code>discardEdits: true</code></li>
        </ul>

        <h4 class="sub-title">Install &amp; connect</h4>
        <p class="help-p">Prerequisites:</p>
        <ul class="help-list">
          <li><b>Node.js ≥ 20</b></li>
          <li><b>Google Chrome</b></li>
        </ul>

        <p class="help-p">Add the server to your AI client — it opens the production viewer by default, <code>--headed</code> shows its Chrome window:</p>
        <n-tabs type="line" size="small" class="client-tabs">
          <n-tab-pane v-for="c in clients" :key="c.name" :name="c.name" :tab="c.name" display-directive="show">
            <div class="client-pane">
              <p class="help-p">
                <template v-for="(part, i) in c.where" :key="i"><code v-if="i % 2">{{ part }}</code><template v-else>{{ part }}</template></template>
              </p>
              <div v-for="code in c.snippets" :key="code" class="snippet">
                <pre class="snippet-code"><code>{{ code }}</code></pre>
                <button class="copy-btn" title="Copy" @click="copyText(code)"><CopyIcon /></button>
              </div>
              <p class="help-p">
                <template v-for="(part, i) in c.note" :key="i"><code v-if="i % 2">{{ part }}</code><template v-else>{{ part }}</template></template>
              </p>
            </div>
          </n-tab-pane>
        </n-tabs>

        <p class="help-p">Verify:</p>
        <ul class="help-list">
          <li>restart / reload the client, then ask the agent to call <code>svp_session</code> — a Chrome window opens on the viewer and the client lists the <code>svp_*</code> tools</li>
          <li>Claude Code: <code>claude mcp list</code> shows <code>svp</code></li>
          <li>the first run downloads the package and may take a while</li>
          <li>if it fails, see troubleshooting in the full guide (Chrome not found, API version mismatch)</li>
        </ul>

        <h4 class="sub-title">From an AI agent</h4>
        <p class="help-p"><code>svp-mcp</code> drives the viewer in its own Chrome:</p>
        <div class="table-wrap"><table class="help-table">
          <thead>
            <tr><th>Group</th><th>Tools</th></tr>
          </thead>
          <tbody>
            <tr><td><b>Session</b></td><td><code>svp_open</code>, <code>svp_session</code>, <code>svp_methods</code>, <code>svp_call</code>, <code>svp_load</code>, <code>svp_slots</code></td></tr>
            <tr><td><b>Playback</b></td><td><code>svp_set_animation</code>, <code>svp_seek</code>, <code>svp_playback</code></td></tr>
            <tr><td><b>Bones</b></td><td><code>svp_get_bones</code>, <code>svp_apply_pose</code>, <code>svp_release_pose</code></td></tr>
            <tr><td><b>Editing</b></td><td><code>svp_apply_to_setup_pose</code>, <code>svp_key_bone</code>, <code>svp_build_animation</code>, <code>svp_undo</code></td></tr>
            <tr><td><b>Export</b></td><td><code>svp_capture</code>, <code>svp_screenshot</code>, <code>svp_export</code></td></tr>
            <tr><td><b>keyframe.it</b></td><td><code>svp_keyframe_*</code></td></tr>
          </tbody>
        </table></div>
        <ul class="help-list">
          <li><b>Files on disk</b> — <code>svp_load</code> reads files, folders and <code>.zip</code> archives by path; <code>svp_export</code> writes into the export folder (<code>~/.svp-mcp/exports</code>, <code>--export-dir</code>)</li>
          <li><b>Window</b> — <code>--headed</code> shows it; keep the viewer tab visible, a hidden tab throttles frames</li>
        </ul>

        <h4 class="sub-title">keyframe.it round trip</h4>
        <ol class="help-list round-trip">
          <li><code>svp_viewer_to_keyframe</code> — exports the active skeleton unpacked and imports it into keyframe.it through "Import Spine…"</li>
          <li><code>svp_keyframe_call</code> — edits through keyframe.it's <code>window.keyframe</code>, e.g. <code>{ method: "setMode", args: ["setup"] }</code>, then <code>poseBone</code>, <code>applyPose</code>, <code>keyBone</code> (method <code>help</code> lists the rest)</li>
          <li><code>svp_keyframe_to_viewer { version: "4.2" | "3.8", binary?, mode? }</code> — exports a Spine zip into the export folder and loads it as the active skeleton</li>
        </ol>
        <ul class="help-list">
          <li>A 3.8 export over a 4.2 (Pixi 8) session needs <code>mode: 'replace'</code>; otherwise it lands as a version-mismatch error row</li>
          <li>keyframe.it is y-down; its exporter flips the signs, so values arrive y up</li>
          <li>Its exporter bakes curves per frame into linear keys at the project fps</li>
          <li>It imports Spine 3.8 and 4.x JSON including 4.3 (with atlas and pages, not binary <code>.skel</code>)</li>
          <li>Exported files land in the export folder, <code>~/.svp-mcp/exports</code> by default</li>
        </ul>

        <p class="help-p">
          Full guide — every method, every tool, recipes and troubleshooting:
          <a class="about-link" :href="guideUrl" target="_blank" rel="noopener">docs/api-and-mcp.md</a>
        </p>
      </section>

      <n-divider class="divider" />

      <!-- Pixi DevTools -->
      <section class="help-section" data-sec="devtools">
        <h3 class="sec-title" tabindex="-1">Pixi DevTools</h3>
        <ul class="help-list">
          <li>The app exposes <code>globalThis.__PIXI_APP__</code> for the
            <a class="about-link" href="https://chromewebstore.google.com/detail/pixi-inspector/aamddddknhcagpehecnhphigffljadon" target="_blank" rel="noopener">Pixi Inspector</a>
            browser extension</li>
          <li>Spine slot containers are named after their attachment — visible in the Inspector's scene tree</li>
        </ul>
        <p class="help-p help-p--warn">
          After a hard page reload (Ctrl+R) with DevTools already open, the panel may lose its execution context.
          This is a known extension bug — it doesn't re-register after navigation.
        </p>
        <h4 class="sub-title">Workarounds</h4>
        <ul class="help-list">
          <li>Open DevTools <b>after</b> the viewer is loaded and animation is playing</li>
          <li>Navigate picker → viewer without reloading the page</li>
          <li>Close and reopen DevTools after a page reload</li>
        </ul>
      </section>

      <n-divider class="divider" />

      <!-- What's New -->
      <section class="help-section" data-sec="whatsnew">
        <h3 class="sec-title" tabindex="-1">What's New</h3>
        <div class="changelog">
          <div class="cl-entry">
            <span class="cl-ver">v1.4.0</span>
            <ul class="help-list">
              <li><b>Viewer API</b> — scripts, the DevTools console and AI agents drive the viewer through <code>window.svp</code>: load files, play, pose and key bones, edit, export (<code>svp.help()</code> lists every method)</li>
              <li><b>MCP server</b> — <code>svp-mcp</code> opens the viewer in its own Chrome and exposes the API as MCP tools, including loading from and exporting to disk and a round trip to keyframe.it</li>
              <li><b>Bone overrides on any bone</b>
                <ul>
                  <li>the Bones tab is always shown</li>
                  <li>X, Y, Rotation, Scale and Shear hold a live override on top of the animation, kept per skeleton</li>
                  <li>the Insp tab shows local, applied and world values of the selected bone</li>
                </ul>
              </li>
              <li><b>Setup pose, keys and undo</b>
                <ul>
                  <li>Apply to setup pose, Key at current time, New animation, Undo / Redo (20 steps) and Revert skeleton</li>
                  <li>edited skeletons show ★ and leaving asks before unsaved edits or overrides are lost</li>
                </ul>
              </li>
              <li><b>Zip in and out</b> — <code>.zip</code> archives load in every picking path, and files are grouped per folder so same-named files in different folders never mix</li>
              <li><b>Spine JSON export</b> — Export tab → Skeleton: <code>&lt;name&gt;.zip</code> with the (edited) skeleton as Spine JSON plus atlas and pages; binary <code>.skel</code> skeletons are converted</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.20</span>
            <ul class="help-list">
              <li><b>Global Loop switch applies to every track</b> — toggling it in the Anim tab sets Loop on every track of the current skeleton (enabled or disabled) and stays the default for newly selected animations</li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.19</span>
            <ul class="help-list">
              <li><b>Spine 4.3 support</b> — Pixi 8 + Spine 4.3 next to 4.2
                <ul>
                  <li>a detected 4.3 file selects it automatically</li>
                  <li>4.2 and 4.3 skeletons mix in one Pixi 8 session (pinned, as placeholder child spines and on the Compare canvases)</li>
                </ul>
              </li>
              <li><b>Sliders</b> (Spine 4.3) — Bones tab Sliders section with live Time and Mix and a reset; sliders are also listed in Insp, counted in Compl and compared in the Compare diff Sliders table</li>
              <li><b>Mix (ms) per track</b> — Anim tab track rows on every Spine version get a crossfade in milliseconds from the previous animation on that track, saved per skeleton</li>
              <li><b>Additive and Curve per track</b> (Spine 4.3) — Anim tab track rows get an Additive checkbox and a Curve select that shapes the Mix (ms) crossfade, saved per skeleton</li>
              <li><b>Unsupported versions blocked</b> — a file of a Spine version the viewer cannot run is marked with an error and Open Viewer stays disabled</li>
            </ul>
          </div>
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
              <li><b>Image layers</b> — drag a placeholder image onto the Spines list to make it an image layer
                <ul>
                  <li>its own row with sync and ✕, ordered and stacked with skeletons</li>
                  <li>moved and scaled when desynced, included in exports</li>
                  <li>drop a layer on a placeholder zone to put it back</li>
                </ul>
              </li>
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
              <li><b>Toolbar track controls</b>
                <ul>
                  <li>Track selector, animation picker, per-track play/pause, per-track Loop and clear-track button in the top toolbar</li>
                  <li>selecting a track shows its current animation and loop state, so placeholder child spines can be previewed without switching to the Anim tab</li>
                </ul>
              </li>
            </ul>
          </div>
          <div class="cl-entry">
            <span class="cl-ver">v1.3.7</span>
            <ul class="help-list">
              <li><b>Spine in placeholder</b> — drop a spine skeleton file onto any placeholder drop zone to attach it as a live child spine
                <ul>
                  <li>it renders and animates inside the placeholder container simultaneously with the parent</li>
                  <li>click its sprite on canvas to activate it and control animation, skins, and tracks independently</li>
                  <li>disable sync (🔗) to reposition and scale it freely inside the container</li>
                </ul>
              </li>
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
      <section class="help-section" data-sec="about">
        <h3 class="sec-title" tabindex="-1">About</h3>
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
import { SVP_API_VERSION } from '@/core/api/svpApi'

const open = ref(false)
const appVersion = __APP_VERSION__
const apiVersion = SVP_API_VERSION

const sections = [
  { key: 'files', label: 'Files', title: 'File Loading' },
  { key: 'playback', label: 'Playback', title: 'Playback' },
  { key: 'viewport', label: 'Viewport', title: 'Viewport' },
  { key: 'panels', label: 'Panels', title: 'Side Panel Tabs' },
  { key: 'compare', label: 'Compare', title: 'Compare Mode' },
  { key: 'shortcuts', label: 'Shortcuts', title: 'Keyboard Shortcuts' },
  { key: 'versions', label: 'Versions', title: 'Supported Versions' },
  { key: 'api', label: 'API & MCP', title: 'API & MCP' },
  { key: 'devtools', label: 'DevTools', title: 'Pixi DevTools' },
  { key: 'whatsnew', label: "What's New", title: "What's New" },
  { key: 'about', label: 'About', title: 'About' },
]

const bodyEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
const active = ref(sections[0].key)

watch(open, (v) => { if (v) active.value = sections[0].key })

function setActive(key: string) {
  if (active.value === key) return
  active.value = key
  nextTick(() => {
    const nav = navEl.value
    const btn = nav?.querySelector<HTMLElement>(`[data-key="${key}"]`)
    if (!nav || !btn) return
    // Scroll the bar itself; button.scrollIntoView would also scroll .help-body
    if (btn.offsetLeft < nav.scrollLeft) nav.scrollLeft = btn.offsetLeft
    else if (btn.offsetLeft + btn.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = btn.offsetLeft + btn.offsetWidth - nav.clientWidth
    }
  })
}

function jump(key: string) {
  const sec = bodyEl.value?.querySelector<HTMLElement>(`[data-sec="${key}"]`)
  if (!sec) return
  setActive(key)
  sec.scrollIntoView({ block: 'start' })
  sec.querySelector<HTMLElement>('.sec-title')?.focus({ preventScroll: true })
}

function onScroll() {
  const body = bodyEl.value
  if (!body) return
  const secs = [...body.querySelectorAll<HTMLElement>('[data-sec]')]
  if (!secs.length) return
  let current = secs[0]
  if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) {
    current = secs[secs.length - 1]
  } else {
    const line = body.scrollTop + (navEl.value?.offsetHeight ?? 0) + 8
    for (const s of secs) if (s.offsetTop - body.offsetTop <= line) current = s
  }
  setActive(current.dataset.sec!)
}

const guideUrl = 'https://github.com/Andryuha-Ka/spineviewer/blob/master/docs/api-and-mcp.md'

const quickStart = [
  { label: 'Session and methods', code: 'await svp.info()\nawait svp.help()' },
  { label: 'Read the skeleton', code: 'await svp.getSkeleton()' },
  { label: 'Play an animation', code: "await svp.setAnimation({ animation: 'idle' })" },
  { label: 'Hold and release a bone', code: "await svp.setBoneOverride({ bone: 'head', rotation: 15 })\nawait svp.releaseOverride({ bones: ['head'] })" },
  { label: 'Bake overrides into setup', code: "await svp.setBoneOverride({ bone: 'head', rotation: 15 })\nawait svp.applyOverridesToSetupPose()" },
  { label: 'Key an animation', code: "await svp.createAnimation({ name: 'nod' })\nawait svp.setKey({ animation: 'nod', bone: 'head', type: 'rotate', time: 0.5, value: { rotation: 20 } })\nawait svp.setKeyEasing({ animation: 'nod', bone: 'head', type: 'rotate', time: 0.5, easing: 'stepped' })" },
  { label: 'Undo the last edit', code: 'await svp.undo()' },
  { label: 'Export the skeleton', code: "const { artifact } = await svp.exportSkeleton({ format: 'zip' })" },
]

const mcpServersJson = `{
  "mcpServers": {
    "svp": {
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}`

// Text between backticks renders as <code>
const parts = (s: string) => s.split('`')

const clients = [
  {
    name: 'Claude Code',
    where: parts('Run in a terminal; scopes: `local` (default, `~/.claude.json`, this project), `project` (`.mcp.json` in the project root, shared via VCS), `user` (`~/.claude.json`, all projects)'),
    snippets: [
      'claude mcp add svp -- npx -y spine-viewer-pro-mcp --headed',
      'claude mcp add --scope user svp -- npx -y spine-viewer-pro-mcp --headed',
    ],
    note: parts('`--` separates Claude\'s options from the server command; `claude mcp list` checks it.'),
  },
  {
    name: 'Claude Desktop',
    where: parts('Settings → Developer → Edit Config — macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\\Claude\\claude_desktop_config.json`'),
    snippets: [mcpServersJson],
    note: parts('Fully quit and restart after saving.'),
  },
  {
    name: 'Cursor',
    where: parts('Project `.cursor/mcp.json` or global `~/.cursor/mcp.json`'),
    snippets: [mcpServersJson],
    note: parts('Same `mcpServers` JSON as Claude Desktop.'),
  },
  {
    name: 'VS Code',
    where: parts('VS Code / GitHub Copilot — workspace `.vscode/mcp.json`; user profile via the command “MCP: Open User Configuration”'),
    snippets: [`{
  "servers": {
    "svp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}`],
    note: parts('The top-level key is `servers` (not `mcpServers`); `type` is required, `"stdio"`.'),
  },
  {
    name: 'Codex CLI',
    where: parts('OpenAI Codex CLI — global `~/.codex/config.toml` (project `.codex/config.toml` for trusted projects; shared by CLI, IDE extension and desktop app), or `codex mcp add`'),
    snippets: [
      `[mcp_servers.svp]
command = "npx"
args = ["-y", "spine-viewer-pro-mcp", "--headed"]
startup_timeout_sec = 60`,
      'codex mcp add svp -- npx -y spine-viewer-pro-mcp --headed',
    ],
    note: parts('`startup_timeout_sec = 60` covers the first-run download plus the Chrome launch.'),
  },
  {
    name: 'Gemini CLI',
    where: parts('User `~/.gemini/settings.json`, project `.gemini/settings.json`'),
    snippets: [mcpServersJson],
    note: parts('Or `gemini mcp add svp npx -y spine-viewer-pro-mcp --headed` (`-s user|project`).'),
  },
  {
    name: 'Windsurf',
    where: parts('Windsurf: `~/.codeium/windsurf/mcp_config.json`; Devin Desktop: `~/.config/devin/mcp_config.json` / `%APPDATA%\\devin\\mcp_config.json` — or open it from Cascade → … → Open MCP config file'),
    snippets: [mcpServersJson],
    note: parts('Same `mcpServers` JSON as Claude Desktop.'),
  },
  {
    name: 'Other (stdio)',
    where: parts('Any client that launches a stdio server: command `npx`, args `["-y", "spine-viewer-pro-mcp", "--headed"]`'),
    snippets: ['npx -y spine-viewer-pro-mcp --headed'],
    note: parts('Most clients accept the `mcpServers` JSON shown for Claude Desktop.'),
  },
]

const CopyIcon = () => h('svg', {
  width: '10', height: '10', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
}, [
  h('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }),
  h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
])

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}
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

.help-body b {
  color: var(--c-text);
}

/* Section navigation */
.help-nav {
  position: sticky;
  top: 0;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 0.25rem 2px 0.375rem;
  margin-bottom: 0.625rem;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border-dim);
}

.nav-item {
  flex-shrink: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: nowrap;
  padding: 0.25rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 4px 4px 0 0;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.nav-item:hover {
  background: var(--c-hover);
}

.nav-item.active {
  background: var(--c-selection);
  color: var(--c-text);
  border-bottom-color: var(--c-accent);
}

.nav-item:focus-visible {
  outline: 2px solid var(--c-focus-ring);
  outline-offset: -2px;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  scroll-margin-top: 2.375rem;
}

.sec-title {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--c-text-ghost);
  margin: 0;
}

.sec-title:focus {
  outline: none;
}

.sec-title:focus-visible {
  outline: 2px solid var(--c-focus-ring);
  outline-offset: 2px;
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

.help-list ul {
  margin: 2px 0 0;
  padding-left: 16px;
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

/* API & MCP how-to */
.sub-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--c-text-muted);
  margin: 6px 0 0;
}

.help-strong {
  color: var(--c-text);
}

.snippets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snippet {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.snippet-label {
  font-size: 0.75rem;
  color: var(--c-text-faint);
}

.snippet-code {
  margin: 0;
  padding: 5px 26px 5px 8px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 5px;
  overflow-x: auto;
}

.snippet-code code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.75rem;
  white-space: pre;
}

.copy-btn {
  position: absolute;
  right: 4px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--c-text-ghost);
  cursor: pointer;
  padding: 3px;
  line-height: 1;
  border-radius: 3px;
  transition: color 0.12s;
}

.copy-btn:hover {
  color: var(--c-text-muted);
  background: var(--c-raised);
}

.tab-badge {
  display: inline-block;
  white-space: nowrap;
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

.client-pane {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.help-list li > .snippet {
  margin: 4px 0;
}

/* Tables */
.table-wrap {
  overflow-x: auto;
}

.help-table {
  border-collapse: collapse;
  table-layout: auto;
  font-size: 0.8125rem;
  width: 100%;
  line-height: 1.45;
}

.help-table th,
.help-table td {
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--c-border-dim);
}

.help-table th {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-text-ghost);
  background: var(--c-surface);
}

.help-table td {
  color: var(--c-text-dim);
  word-break: normal;
  overflow-wrap: normal;
}

.help-table th,
.help-table td:first-child {
  white-space: nowrap;
}

.help-table code {
  overflow-wrap: break-word;
}

.tabs-table td:last-child {
  font-size: 0.75rem;
  color: var(--c-text-muted);
}

.cell-list {
  margin: 0;
  padding-left: 14px;
}

/* Label–value rows */
.help-dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 10px;
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.help-dl dt {
  font-weight: 700;
  color: var(--c-text);
}

.help-dl dd {
  margin: 0;
  color: var(--c-text-dim);
  overflow-wrap: break-word;
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
