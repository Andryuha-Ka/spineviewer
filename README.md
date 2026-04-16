# Spine Viewer Pro

Browser-based viewer for [Spine](http://esotericsoftware.com/) skeletal animations. Supports Spine versions 3.8–4.2 with Pixi.js 7 and 8. Runs entirely in the browser — no installation, no server, no data upload.

---

## Features

### File Loading
- **Drag & drop** files or folders directly onto the picker page
- **Choose Files / Choose Folder** buttons with File System Access API support (Chrome / Edge)
- Automatic Spine version detection from `.json` / `.skel` headers
- Supports all attachment image formats: PNG, JPG, WebP, AVIF
- Load **up to 30 skeletons** simultaneously and switch between them
- **File history sidebar** — last 20 sessions shown on the picker page
  - One-click auto-reload (Chrome/Edge): files reopen without a picker dialog
  - Picker opens in the session's original folder as fallback
  - Per-session delete button; clear all history button

### Playback
- **Multi-track** playback (tracks 0–11 simultaneously)
- Animation **queue** — chain multiple animations per track
- Per-track **loop** toggle
- **Speed control** 0×–3× with fine slider
- **Frame stepping** ±1 frame at 30/60 fps
- Seek to any position

### Animation Dropdown (Anim tab)
- Animations and folders sorted **alphabetically**
- Folder opens on **hover** — no extra click needed
- Parent folder stays **highlighted** while navigating the submenu
- Selected animation and its parent folder remain highlighted until a new one is chosen

### Viewport
- **Pan** with left mouse drag
- **Zoom** with scroll wheel (0.05×–20×)
- Double-click to **reset view**
- Toggle **origin crosshair** (X/Y center)
- Change **background color** via color picker
- **Placeholder labels** toggle (`ph` checkbox) — show/hide named placeholder overlays on canvas
  - Individual checkboxes under the `ph` toggle to enable/disable each placeholder separately
  - Toggle state and per-placeholder visibility saved and restored per skeleton
- **Independent pan/zoom** — disable the sync toggle (🔗) on any spine slot or background image in the Spines tab; drag and zoom wheel then affect only that item; hold **Shift** to pan/zoom the global scene instead

### Multi-Skeleton (Spines tab)
- Load **up to 30 skeletons** in one session
- **Spines tab** appears automatically when 2+ skeletons or a background image is loaded
- Click any entry to switch the active skeleton
- **Drag to reorder** skeletons — higher in the list = higher z-index on the stage (6-dot drag handle)
- **Pin button** — keep a skeleton on stage while switching to another
- Each skeleton's viewport position, animation, skin, placeholder toggle, and playback state is preserved independently
- **Sync toggle** (🔗) per skeleton — when disabled, the active skeleton moves and scales independently from the global scene; drag moves only it, scroll wheel scales only it; hold **Shift** to move the global scene while sync is off
- **Clone button** — duplicate the active skeleton with its full current state (animation, skin, position, sync); the clone is fully independent of the original
- **Drop zone** at the bottom of the Spines tab — drop image files (PNG / JPG / WebP / AVIF) to add a background image, or drop spine file sets to add new skeletons with automatic version detection and validation

### Background Image
- Drop a **PNG / JPG / WebP / AVIF** file onto the Spines tab drop zone (or the canvas) to load it as a scene background
- Background image appears as a special item in the Spines tab with z-order DnD (always rendered behind spine slots by default)
- Has its own **sync toggle** — when disabled and active, drag and zoom affect only the background independently
- Replacing an existing background asks for confirmation
- Not persisted between sessions

### Skins
- Single skin selection with **radio buttons** — selection preserved when switching skeletons
- **Skin Composer** — combine multiple skins into one composite skin
- First non-default skin auto-applied on initial load

### Inspector (Insp tab)
- **Bone hierarchy** — live x, y, rotation, scale values; expandable tree; search
- **Active Attachments** — slot names, attachment types (region / mesh / mask / path), vertex counts, blend mode badges

### Atlas Viewer (Atlas tab)
- Visual preview of all atlas pages
- Seen/unseen region tracking (regions used in current animation highlighted)
- Atlas utilization % (used area vs total)
- Region search and list
- Zoom/pan within atlas; full-screen modal

### Performance Profiler (Perf tab)
- **FPS graph** — 120-frame rolling history
- **Stats grid** — FPS, frame time, draw calls, mask count, mesh count, VRAM estimate, JS Heap
- **Slow frames log** — captures frames below 30 fps with context
- **Long tasks log** — main thread tasks >50 ms (Chrome PerformanceObserver)

### Complexity Analyzer (Compl tab)
- Bone / slot / animation / keyframe counts with OK/warn/critical thresholds
- Mesh vertex count, mask slots, region count
- Blending mode breakdown (Normal / Additive / Multiply / Screen)
- Automatic recommendations for optimization

### Animation Events (Events sub-panel in Anim tab)
- **Live event log** — newest first, up to 500 entries
- Filter by event name
- **Timeline** — colored ticks per event, hover tooltip, click to seek
- Event statistics (count per event name)

### Export
| Format | Description |
|--------|-------------|
| **PNG** | Current frame screenshot |
| **Pose JSON** | Snapshot of all bone transforms |
| **Sprite Sheet** | N-frame grid as a single PNG |
| **GIF** | Animated GIF with configurable FPS and quality |

### Compare Mode

Side-by-side visual and structural comparison of two Spine skeletons. Accessible from the picker page and the viewer toolbar.

**Layout**
- Two independent Pixi canvases rendered side by side with a resizable divider
- Per-canvas control bar: side badge (A / B), skin selector, animation selector, time, FPS
- Diff panel with three configurable positions: left, right, bottom (persisted)

**Synchronized Playback**
- **Time sync** (↺) — mirrors time position in real-time from Master to Secondary
- **Viewport sync** (⊞) — mirrors pan and zoom between canvases
- **Animation sync** — changing animation on one side auto-applies the same name to the other (if found)
- **Skin sync** — skin changes mirrored when sync is enabled

**Diff Panel**
- Runs automatically when both canvases finish loading — no manual trigger needed
- Sections: Skeleton meta · Bones · Slots · Skins · Animations · Events · Constraints · IK / Transform / Path constraints
- **Reskin Overview** (always shown first):
  - Animation presence + duration delta
  - Skin presence diff
  - Event definition presence diff
  - Per-animation event timing diff (JSON only)
  - Placeholder slots / bones / attachments with critical parameter change detection
- Severity badges: 🔴 critical (missing name, missing event, placeholder changed) · 🟠 non-critical (duration delta, timing delta)

**Placeholder Labels**
- `ph` checkbox in each canvas overlay — show/hide named placeholder overlays
- Individual checkboxes for each placeholder (only non-removed ones shown)
- Shared `disabledPlaceholders` state with the main viewer

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Step −1 / +1 frame |
| `R` | Reset pose (clear all tracks) |
| `L` | Toggle loop on current track |
| `Shift+L` | Toggle loop on all tracks |
| `0`–`9` | Select track 0–9 |

---

## Supported Versions

| Pixi.js | Spine Runtime |
|---------|--------------|
| Pixi 7 | Spine 3.8, 4.0, 4.1 |
| Pixi 8 | Spine 4.2 |

---

## Getting Started

### Prerequisites
- Node.js 18+ (recommended: Node 22 via `nvm use 22`)

### Install and Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`.

---

## Usage

1. Open the app — you'll see the **Version Picker** page.
2. **Drop your Spine files** (`.json`/`.skel` + `.atlas` + images) onto the drop zone, or click **Choose Files** / **Choose Folder**.
3. The app auto-detects the Spine version and selects the matching runtime.
4. Click **Open Viewer**.
5. Use the **Anim** tab to select animations and control playback.
6. Explore the other tabs: **Insp**, **Atlas**, **Perf**, **Compl**, **Export**.

### Multi-Spine Workflow
When you drop multiple Spine skeletons, all are loaded into slots. The **Spines** tab appears in the viewer — click any entry to switch. Each skeleton's viewport, animation, skin, and placeholder state is saved independently.

- **Drag** the 6-dot handle to reorder skeletons — position in the list determines z-order (top = front)
- **Pin** a skeleton (📌 button) to keep it visible on stage while you browse others
- **Sync toggle** (🔗) — disable to move/zoom the active skeleton independently; hold Shift to move the global scene
- **Clone** the active skeleton via the clone button in the Spines tab
- **Drop zone** at the bottom of the Spines tab — drop images for background or spine files to add more skeletons

---

## Changelog

### v1.3.1
- **Viewport sync model fix** — global pan/zoom (`posX/posY/zoom`) shared across all spines; desynced spines carry personal scene-space offsets (`indPosX/Y/indZoom`) composed on top via a single unified rendering formula; no coordinate conversion on sync toggle (eliminates position jump on toggle)
- **Spines panel** — Pin, Sync, and Clone buttons now always visible regardless of skeleton count
- **State persistence** — global viewport position no longer saved/restored per-slot; slot save/restore covers only personal offsets + `syncEnabled`

### v1.3.0
- **Background image** — load a PNG/JPG/WebP/AVIF as a scene background from the Spines tab drop zone; supports z-order DnD, sync toggle, and independent pan/zoom
- **Independent viewport per item** — sync toggle (🔗) per spine slot and background image; when disabled, drag/wheel affects only that item; Shift+drag moves the global scene
- **Clone spine** — duplicate the active spine slot with its full state (animation, skin, position); the clone is fully independent of the original
- **Spines tab drop zone** — drop images or spine file sets directly in the Spines tab; spine files go through version detection and validation before loading

### v1.2.15
- Visual pin state indicator per skeleton entry in the Spines tab (shows which slots are currently pinned)

### v1.2.14
- Progress bar and draw-call sparkline migrated from HTML overlay to PIXI rendering; seek-on-click/drag routed through the new PIXI overlay

### v1.2.13
- **Skin restore on slot switch** — active skin is saved and reapplied when switching back to a skeleton
- **Drag-and-drop reorder** in the Spines tab — changes z-order directly on stage (top = front)
- **Pin button** per skeleton slot — keep a skeleton visible on stage while browsing others
- Per-spine independent placeholder list with individual enable/disable checkboxes
- Placeholder toggle state and per-item visibility saved/restored per skeleton

### v1.2.12
- **Animation list** — alphabetically sorted, folder hover-expand (no extra click), selected animation and parent folder stay highlighted
- **Placeholder labels toggle** (`ph` checkbox) — show/hide named placeholder overlays on canvas; individual per-item checkboxes below; state saved per skeleton; same toggle in Compare canvases
- **File history sidebar** — last 20 sessions on the picker page; one-click auto-reload (Chrome/Edge via FSAA + IndexedDB); per-session delete; clear all button

### v1.2.11
- **FreeBone panel** (Bones tab) — detect and manually position/rotate individual unkeyframed bones directly on stage
- Free-bone diff section added to Compare mode

### v1.2.6
- Reskin-aware diff improvements: animation duration deltas, per-animation event timing diffs with severity

### v1.2.3
- Bone and slot selection highlighted directly on the canvas
- Placeholder labels rendered as PIXI objects (slot/bone children in scene hierarchy)
- IK / Transform / Path constraint diff added to Reskin Overview in Compare mode

### v1.2.2
- Auto-diff runs automatically when both Compare canvases finish loading (no manual trigger)
- Color-coded severity badges: 🔴 critical (missing name, missing event, placeholder changed) · 🟠 non-critical (duration delta, timing delta)

### v1.2.1
- Viewport controls in Compare mode: per-canvas pan/zoom/bg/center + viewport sync toggle (⊞)
- **Reskin Overview** panel — animation presence table, skin diff, event timing diff per animation

### v1.2.0
- **Compare mode** — side-by-side visual and structural comparison of two Spine skeletons
- Diff panel: Bones · Slots · Skins · Animations · Events · Constraints
- Animation sync and Skin sync between canvases

### v1.1.4
- Atlas and image file names color-coded in the Skeleton tab

### v1.1.2
- **Multi-Spine** — load up to 30 skeletons simultaneously; Spines tab for switching; per-skeleton viewport, animation, skin, and placeholder state preserved independently

### v1.1.0
- **Draw call sparkline** in the progress overlay
- **Pixi Inspector** integration (`globalThis.__PIXI_APP__`)

### v1.0.0
- Initial release: Spine 3.8–4.2 · Pixi 7 & 8 · multi-track animation playback (tracks 0–11) · animation queue · skins · Skin Composer · bone inspector · atlas viewer · performance profiler · complexity analyzer · export (PNG / Sprite Sheet / GIF / Pose JSON) · keyboard shortcuts · background color picker

---

## Project Structure

```
src/
├── core/                   # Version-agnostic shared code
│   ├── types/              # ISpineAdapter, IPixiApp, FileSet
│   ├── utils/              # fileLoader, versionDetector, atlasTextParser
│   └── stores/             # Pinia stores (animation, skeleton, profiler, …)
├── adapters/
│   ├── pixi7/              # Pixi 7 app + Spine 3.8/4.0/4.1 adapters
│   └── pixi8/              # Pixi 8 app + Spine 4.2 adapter
└── components/
    ├── pages/              # VersionPickerPage, ViewerPage
    ├── panels/             # AnimationPanel, SkeletonPanel, AtlasInspector, …
    └── stage/              # PreviewStage (canvas + overlays)
```

---

## Tech Stack

- **Vite 6** + **Vue 3** + **TypeScript**
- **Pinia** — state management
- **Naive UI** — component library
- **Pixi.js 7** — renderer for Spine 3.8–4.1
- **Pixi.js 8** — renderer for Spine 4.2
- **@pixi-spine** (3.8 / 4.0 / 4.1) — Spine runtimes for Pixi 7
- **@esotericsoftware/spine-pixi-v8** — official Spine 4.2 runtime for Pixi 8
- **gif.js** — GIF export via Web Worker

---

## Developer Notes

### Pixi DevTools
The app exposes the active Pixi application instance for the [Pixi DevTools](https://chromewebstore.google.com/detail/pixi-inspector/aamddddknhcagpehecnhphigffljadon) browser extension:
```js
globalThis.__PIXI_APP__ = app
```

**Known limitation:** After a hard page reload (`Ctrl+R` / `F5`) with DevTools already open, the Pixi Inspector panel may show `uniqueContextId not found`. This is a bug in the extension — it caches the old execution context ID and doesn't re-register after navigation.

Workarounds (pick one):
- Open DevTools **after** the viewer is loaded and the animation is playing
- Navigate picker → viewer **without** reloading the page (SPA navigation keeps the same context)
- After a page reload: close and reopen the DevTools window to get a fresh context

### Version Injection
Build version is injected at compile time from `package.json` via `vite.config.ts`:
```ts
define: { __APP_VERSION__: JSON.stringify(pkg.version) }
```

### Dual Pixi Strategy
Both Pixi 7 and Pixi 8 are installed simultaneously. Vite aliases (`pixi7` / `pixi8`) and a custom `spinePixi8Redirect` plugin ensure each Spine runtime uses the correct Pixi instance without registry conflicts.
