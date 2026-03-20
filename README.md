# Spine Viewer Pro

Browser-based viewer for [Spine](http://esotericsoftware.com/) skeletal animations. Supports Spine versions 3.8–4.2 with Pixi.js 7 and 8. Runs entirely in the browser — no installation, no server, no data upload.

---

## Features

### File Loading
- **Drag & drop** files or folders directly onto the picker page
- Automatic Spine version detection from `.json` / `.skel` headers
- Supports all attachment image formats: PNG, JPG, WebP, AVIF
- Load **up to 30 skeletons** simultaneously and switch between them

### Playback
- **Multi-track** playback (tracks 0–11 simultaneously)
- Animation **queue** — chain multiple animations per track
- Per-track **loop** toggle
- **Speed control** 0×–3× with fine slider
- **Frame stepping** ±1 frame at 30/60 fps
- Seek to any position

### Viewport
- **Pan** with left mouse drag
- **Zoom** with scroll wheel (0.05×–20×)
- Double-click to **reset view**
- Toggle **origin crosshair** (X/Y center)
- Change **background color** via color picker

### Multi-Skeleton (Spines tab)
- Load **up to 30 skeletons** in one session
- **Spines tab** appears automatically when 2+ skeletons are loaded
- Click any entry to switch the active skeleton
- Each skeleton's viewport position, animation, and playback state is preserved independently

### Skins
- Single skin selection
- **Skin Composer** — combine multiple skins into one composite skin

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
When you drop multiple Spine skeletons, all are loaded into slots. The **Spines** tab appears in the viewer — click any entry to switch. Each skeleton's viewport, animation, and playback state is saved independently.

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

- **Vite 5** + **Vue 3** + **TypeScript**
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
