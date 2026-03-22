# Spine Compare — Implementation Plan

## Overview

A dedicated Compare mode for side-by-side visual and structural comparison of two Spine skeletons. Accessible from both the Picker page and the Viewer page. Renders two independent Pixi canvases with synchronized playback and a resizable diff panel.

---

## Navigation Flow

```
VersionPickerPage  ──[Compare]──→  ComparePage
ViewerPage         ──[Compare]──→  ComparePage
ComparePage        ──[← Back] ──→  returns to origin page
```

`App.vue` gets a new page state: `'picker' | 'viewer' | 'compare'`

---

## Requirements

### File Loading
- **From loaded slots** — pick any two spines already loaded in `loaderStore.spineSlots`
- **Direct load** — drop or browse files directly into the left/right slot in Compare mode (stored separately in `useCompareStore`, does not affect `loaderStore`)
- Both slots are independently selectable / replaceable at any time

### Visual
- Two canvases side by side, each with its own Pixi adapter instance
- Vertical resize handle between the two canvases
- Per-canvas control bar: side badge (A/B), skin selector (if >1 skin), animation selector, play/pause (master only), current time, FPS
- Skin selector auto-selects first non-default skin on load
- Diff panel with three configurable positions: **left**, **right**, **bottom** (buttons in toolbar only)
- Position persisted in `localStorage`

### Synchronized Playback
- One side is **Master** (full playback controls), other is **Secondary** (mirrors master)
- **Time sync** (↺) — toggle on/off; when ON: time position mirrored in real-time via master ticker
- **Viewport sync** (⊞) — toggle on/off; pan/zoom mirrored between canvases
- **Animation sync** — when Time ON and user changes animation, same name applied to other side; if name absent → toast "X not found", keep current
- **Skin sync** — when Time ON and user changes skin, same name applied to other side
- Master drives time via ticker callback → `secondaryAdapter.seekTrackTo(0, t)`

### Structural Comparison
Full diff for `.json`, maximum available for `.skel` (via runtime adapter).

Diff runs **automatically** when a canvas finishes loading a spine — no manual "Run Diff" button needed.

### Reskin Overview (first section in diff panel)
Dedicated overview for reskin-focused comparison, always shown first:

- **Animations** — name/presence diff + duration delta
- **Skins** — presence diff; canvas slots show skin selector, auto-selects first non-default skin
- **Events (global)** — event definition presence diff
- **Event timing** — per-animation event occurrence and timing diff (JSON only)
- **Placeholders** — slots/bones/attachments with "placeholder" in name; critical param changes flagged

**Severity color coding in header badges:**
- 🔴 Red (critical): animation name missing, event name missing, event occurrence missing, placeholder changed
- 🟠 Orange (non-critical): animation duration delta, skin name diff, event timing delta

### Placeholders
Moved inside **Reskin Overview** (not a standalone section). Equal items show green ✓.

---

## Architecture

### New Files

```
src/
├── core/
│   ├── stores/
│   │   └── useCompareStore.ts
│   └── utils/
│       └── spineCompare.ts
└── components/
    └── compare/
        ├── ComparePage.vue          ← main layout
        ├── CompareToolbar.vue       ← toolbar (back, file slots, sync, panel position)
        ├── CompareSplitStage.vue    ← two canvases + sync logic
        ├── CompareCanvasSlot.vue    ← single canvas slot (canvas + control bar)
        ├── CompareDiffPanel.vue     ← diff accordion tree
        ├── CompareDiffSection.vue   ← single expandable section
        └── CompareFileSlot.vue      ← file picker / slot selector for one side
```

### Modified Files

```
src/
├── App.vue                           ← new 'compare' page state + navigation
├── components/pages/
│   ├── VersionPickerPage.vue         ← Compare button (if 2+ slots loaded)
│   └── ViewerPage.vue                ← Compare button in toolbar
```

---

## Step-by-Step Implementation

### Step 1 — Navigation & Entry Points

**`App.vue`**
- Add `page` value `'compare'`
- Pass `fromPage` ref so Back button returns to correct origin
- Pass selected slot indices as props to `ComparePage`

**`VersionPickerPage.vue`**
- `Compare` button always visible (even with 0 or 1 spine loaded) — user may want Compare only
- 2+ valid slots → pre-fills left=slot[0], right=slot[1]
- 1 valid slot → pre-fills left=slot[0] only
- 0 valid slots → opens Compare with empty slots

**`ViewerPage.vue`**
- Show `Compare` button in toolbar always (user can load files in compare)
- Pre-fills left=activeSlot if available

---

### Step 2 — `useCompareStore`

```ts
interface SpineSlotRef {
  source: 'loaded'            // from loaderStore
  slotIndex: number
  label: string               // filename for display
}

interface CompareFileSet {
  source: 'direct'            // loaded directly in compare mode
  fileSet: FileSet
  label: string
}

type CompareSlot = SpineSlotRef | CompareFileSet | null

interface CompareState {
  leftSlot:     CompareSlot
  rightSlot:    CompareSlot
  syncEnabled:  boolean
  masterSide:   'left' | 'right'
  diffPanelPos: 'left' | 'right' | 'bottom'   // persisted in localStorage
  diff:         SpineDiff | null
  diffStatus:   'idle' | 'running' | 'done' | 'error'
  diffError:    string | null
}
```

Actions:
- `setLeft(slot)` / `setRight(slot)` — set file source for each side
- `loadDirect(side, files)` — classify + store files directly for compare
- `runDiff()` — trigger comparison engine
- `setPanelPos(pos)` — update + persist panel position
- `reset()` — clear both slots + diff

---

### Step 3 — `spineCompare.ts` — Comparison Engine

#### Input types

```ts
interface SpineJsonData {
  source: 'json'
  raw: Record<string, unknown>     // parsed JSON object
}

interface SpineRuntimeData {
  source: 'runtime'
  adapter: ISpineAdapter
}

type SpineData = SpineJsonData | SpineRuntimeData
```

#### Output types

```ts
interface SpineDiff {
  source: 'json-full' | 'runtime-partial'
  summary: {
    added: number
    removed: number
    changed: number
    equal: number
  }
  placeholders: PlaceholderDiff[]   // always first, always populated
  sections: DiffSection[]
}

interface PlaceholderDiff {
  name: string
  kind: 'bone' | 'slot' | 'attachment'
  status: 'added' | 'removed' | 'changed' | 'equal'
  params: PlaceholderParam[]
}

interface PlaceholderParam {
  key: string
  valueA?: string
  valueB?: string
  changed: boolean
  critical: boolean    // true for: blend mode, parent bone, draw order shift >2
}

interface DiffSection {
  id: string           // 'skeleton' | 'bones' | 'slots' | 'skins' | 'animations' | 'events' | 'constraints'
  label: string
  status: 'equal' | 'changed'
  counts: { a: number; b: number }
  items: DiffItem[]
}

interface DiffItem {
  key: string
  status: 'added' | 'removed' | 'changed' | 'equal'
  valueA?: string
  valueB?: string
  children?: DiffItem[]
}
```

#### Comparison sections

**Skeleton meta** (JSON only)
- `width`, `height`, `fps`, `version`, `hash`

**Bones**

| Field | JSON | Runtime |
|---|---|---|
| count | ✅ | ✅ |
| names ± | ✅ | ✅ |
| parent | ✅ | ✅ |
| x / y | ✅ | ✅ |
| rotation | ✅ | ✅ |
| scaleX / scaleY | ✅ | ✅ |
| shearX / shearY | ✅ | ⚠️ partial |
| length | ✅ | ✅ |

**Slots**

| Field | JSON | Runtime |
|---|---|---|
| count | ✅ | ✅ |
| names ± | ✅ | ✅ |
| bone assignment | ✅ | ✅ |
| blend mode | ✅ | ✅ |
| default attachment | ✅ | ✅ |
| draw order | ✅ | ✅ |

**Skins**

| Field | JSON | Runtime |
|---|---|---|
| names ± | ✅ | ✅ |
| attachment count per skin | ✅ | ⚠️ |

**Animations**

| Field | JSON | Runtime |
|---|---|---|
| names ± | ✅ | ✅ |
| duration | ✅ | ✅ |
| keyframe count per track | ✅ | ⚠️ |

**Events (definitions)**

| Field | JSON | Runtime |
|---|---|---|
| names ± | ✅ | ✅ |
| int / float / string defaults | ✅ | ✅ |

**Events (per animation)**

| Field | JSON | Runtime |
|---|---|---|
| which events fire | ✅ | ✅ |
| timing (seconds) | ✅ | ✅ |
| count per animation | ✅ | ✅ |

**Constraints** (IK / Transform / Path)

| Field | JSON | Runtime |
|---|---|---|
| names ± | ✅ | ✅ |
| target bones | ✅ | ✅ |
| mix / bend direction | ✅ | ⚠️ |

#### Placeholder extraction

```ts
// Runs after main comparison, results go into diff.placeholders
function extractPlaceholders(data: SpineData): PlaceholderEntry[]

// Search in: bones, slots, and attachment names within skins
const PLACEHOLDER_RE = /placeholder/i
```

Critical flags:
- `blend mode` change → `critical: true`
- `parent bone` change → `critical: true`
- draw order shift > 2 positions → `critical: true`

---

### Step 4 — `CompareSplitStage.vue`

```
┌─────────────────────┬──┬─────────────────────┐
│  [A] filename.json  │  │  [B] filename.json  │
│                     │▐▌│                     │
│   Pixi canvas A     │  │   Pixi canvas B     │
│                     │  │                     │
├─────────────────────┤  ├─────────────────────┤
│ ▶ walk  0.0s  60fps │  │ ↔ synced  0.0s      │
└─────────────────────┴──┴─────────────────────┘
```

- Each side: independent `IPixiApp` + `ISpineAdapter` instance
- Vertical resize handle (same pattern as existing panel resize)
- `CompareCanvasSlot.vue` — reusable single-side component:
  - canvas element + ResizeObserver
  - control bar: animation selector, play/pause (master only), current time, FPS
  - "No file loaded" empty state with drop zone

**Sync logic** (in `CompareSplitStage.vue`):
```ts
// runs on master's ticker
function onMasterTick() {
  if (!compareStore.syncEnabled) return
  const t = masterAdapter.getTrackTime(0)
  secondaryAdapter.seekTrackTo(0, t)
}
```

**Animation matching**:
```ts
function syncAnimation(name: string) {
  masterAdapter.setAnimation(0, name, loop)
  const hasMatch = secondaryAdapter.getAnimationNames().includes(name)
  if (hasMatch) {
    secondaryAdapter.setAnimation(0, name, loop)
  }
  // else: secondary keeps current animation, only time syncs
}
```

---

### Step 5 — `CompareDiffPanel.vue`

**Summary bar** (always visible):
```
Spine A: skeleton_v1.json    Spine B: skeleton_v2.json
+4 added  ·  -2 removed  ·  ~7 changed  ·  source: json-full
```

**Filter toggle**: `All | Differences only`

**Placeholders section** (always first, expanded by default):
```
⚠ Placeholders  [3 changed]                        [−]
  ⚠ slot: leftHand_placeholder          CHANGED
      bone        arm_l        →  arm_l_v2      ⚠ critical
      blend       Normal       →  Additive      ⚠ critical
      draw order  12           →  14
  ✓ bone: weapon_placeholder             EQUAL
  + slot: fx_placeholder_01              ADDED in B
```

**Other sections** (collapsed by default if equal):
```
  Bones         [42 A / 43 B]  ~3 changed        [+]
  Slots         [28 A / 28 B]  equal             [+]
  Animations    [12 A / 15 B]  +3 added          [+]
  Events        [8 A  / 7 B ]  -1 removed        [+]
  Constraints   [4 A  / 4 B ]  equal             [+]
```

**Item row** inside expanded section:
```
  bone_name           value_A          →   value_B
  ─────────────────────────────────────────────────
  root                —                    —         ✓
  arm_l               parent: spine   →   parent: torso   ~
  arm_l_v2            —               →   (new)           +
```

**Panel position switcher** in panel header:
```
[◧ Left]  [◨ Right]  [⬓ Bottom]
```

---

### Step 6 — `ComparePage.vue` + `CompareToolbar.vue`

**CompareToolbar** (top bar):
```
[← Back]  [A: filename_v1.json ▾]  ⟷  [B: filename_v2.json ▾]
          [↺ Time ON]  [⊞ View ON]  [Master: A|B]  [⚙]  [◧◨⬓]
```

- File slot dropdowns: list loaded spines OR "Load file..."
- **Time sync** toggle (↺) — time position sync
- **Viewport sync** toggle (⊞) — pan/zoom sync
- Master side toggle (A / B)
- Panel position buttons `◧ ◨ ⬓` (toolbar only, removed from panel header)
- Settings popover (⚙) — theme, font
- **No "Run Diff" button** — diff runs automatically on spine load

**Back button**: shows `confirm` dialog → on confirm clears `compareStore`, `skeletonStore`, `animationStore`, `loaderStore`, `exportStore` and returns to origin page.

**ComparePage layout** — three configurations:

*Panel Left:*
```
┌──────────┬─────────────────────────────┐
│ DiffPanel│     CompareSplitStage       │
└──────────┴─────────────────────────────┘
```

*Panel Right:*
```
┌─────────────────────────────┬──────────┐
│     CompareSplitStage       │ DiffPanel│
└─────────────────────────────┴──────────┘
```

*Panel Bottom:*
```
┌─────────────────────────────────────────┐
│          CompareSplitStage              │
├─────────────────────────────────────────┤
│              DiffPanel                  │
└─────────────────────────────────────────┘
```

---

## Implementation Order

| # | Task | Files |
|---|---|---|
| 1 | Navigation — new `compare` page state | `App.vue` |
| 2 | Entry point buttons | `VersionPickerPage.vue`, `ViewerPage.vue` |
| 3 | `useCompareStore` | `src/core/stores/useCompareStore.ts` |
| 4 | `spineCompare.ts` — JSON comparison | `src/core/utils/spineCompare.ts` |
| 5 | `spineCompare.ts` — runtime comparison | same file |
| 6 | `spineCompare.ts` — placeholder extraction | same file |
| 7 | `CompareCanvasSlot.vue` — single canvas + adapter | `src/components/compare/` |
| 8 | `CompareSplitStage.vue` — split + sync | same dir |
| 9 | `CompareDiffSection.vue` — single section UI | same dir |
| 10 | `CompareDiffPanel.vue` — full panel | same dir |
| 11 | `CompareFileSlot.vue` — file picker / selector | same dir |
| 12 | `CompareToolbar.vue` | same dir |
| 13 | `ComparePage.vue` — assembly + layout | same dir |

---

## localStorage Keys

| Key | Value |
|---|---|
| `svp:compare:panelPos` | `'left' \| 'right' \| 'bottom'` |
| `svp:compare:panelWidth` | `number` (px, for left/right positions) |
| `svp:compare:panelHeight` | `number` (px, for bottom position) |
| `svp:compare:syncEnabled` | `'true' \| 'false'` |
| `svp:compare:masterSide` | `'left' \| 'right'` |

---

## Known Limitations

- `.skel` binary files: keyframe count and shear values are partially unavailable without a full binary parser
- Event timing for `.skel` depends on runtime adapter exposing timeline data via `ISpineAdapter`
- If both spines use different Pixi versions (one Pixi 7, one Pixi 8), two separate Pixi instances will be active simultaneously — expected behavior, no conflict
