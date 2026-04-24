# Placeholder Image Children — Architecture Reference
_Added: 2026-04-22 · Updated: 2026-04-25 (Canvas spine activation, Global toolbar, Multi-slot image hit-test, Drag priority; Global state sync fix)_

## Overview

Feature that allows dropping PNG/JPG images onto **placeholder slots** directly from the Spines panel. Each dropped image becomes a `PIXI.Sprite` child of the corresponding slot container in the Pixi scene graph. State is serialized into `SpineSlotSavedState` in-memory and restored on slot switch.

Each image carries its own **independent transform** (`posX`, `posY`, `scale`, `syncEnabled`). When `syncEnabled = false` — the image can be repositioned by dragging and scaled by scroll wheel, relative to the slot-container (bone) space. Transform is persisted automatically via `SpineSlotSavedState.placeholderImages`.

**Additional operations (added 2026-04-24):**
- **Clone** — duplicates a `PHImageEntry` in the same placeholder at (0, 0) with the original scale; fully independent
- **Canvas activation** — clicking a desynced sprite on the canvas activates it; topmost sprite (highest zIndex) wins when sprites overlap
- **Drag reorder** — drag on entire `ph-image-entry` row reorders sprites within the same placeholder (zIndex updated live)
- **Drag move** — drag to a different placeholder drop zone (same or different spine) to reparent the sprite; target spine activates automatically if needed

**Additional operations (added 2026-04-25):**
- **Canvas spine activation** — clicking a pinned non-active spine on the canvas activates it; only spines with animation tracks can be activated this way
- **Cross-slot image drag** — clicking a desynced image of a pinned non-active spine activates that spine + image and starts image drag in a single mousedown
- **Global toolbar** — Expand / Sync / Pin buttons above the spine list in SpinesPanel apply to all spines at once; local states sync TO the global intent ref (not inverted)
- **Shift+scroll** — holding Shift while scrolling always zooms the global scene, even when a desynced spine or image is active

**Scope:** slot-kind placeholders only (no bone-kind). No rotation, keyboard shortcuts, or undo/redo.

---

## Core Architecture: Action-Queue Bridge

Components never reference each other directly. Communication goes through the store:

```
SpinesPanel (Vue) ──push action──► usePlaceholderImagesStore ──drain──► PreviewStage ──call──► ISpineAdapter
```

`SpinesPanel` has no ref to `PreviewStage`. The store holds both the UI state (`images` map) and the pending action queue (`_pendingActions`). `PreviewStage` calls `drainPlaceholderActions()` when `hasPendingActions` fires AND explicitly after each slot switch completes (paths 5a and 5b) to flush actions that may have accumulated while `spineAdapter` was null during the async switch.

**Drain timing issue:** `hasPendingActions` and `activeSlotId` both change synchronously in the same JS tick (e.g., `moveImage` + `setActiveSlot`). Vue batches watcher flushes; by the time the drain watcher fires, `activeSlotId` may already be the new value while `spineAdapter` is still null (slot switch async). Returning early without draining leaves `_pendingActions` non-empty; since `hasPendingActions` doesn't change again, the watcher never re-fires. Fix: `drainPlaceholderActions()` is a named function called both from the watcher and explicitly at the end of paths 5a/5b.

---

## Key Types

```ts
// src/core/types/FileSet.ts
interface PHImageEntry {
  imageId: string
  fileName: string
  dataURL: string
  syncEnabled: boolean  // default: true — when false, drag/scroll targets this image
  posX: number          // sprite.x in slot-container local space (default: 0)
  posY: number          // sprite.y in slot-container local space (default: 0)
  scale: number         // sprite.scale.set(scale) (default: 1)
}

// SpineSlot — written by PreviewStage after spine load
placeholders?: Array<{ name: string; kind: 'bone' | 'slot' }>

// SpineSlotSavedState — in-memory only, not persisted to localStorage
placeholderImages?: Record<string, PHImageEntry[]>  // phName → entries

// src/core/types/ISpineAdapter.ts
addImageToPlaceholder(placeholderName: string, dataURL: string, imageId: string): void
removeImageFromPlaceholder(placeholderName: string, imageId: string): void
setImageTransform(imageId: string, posX: number, posY: number, scale: number): void
getImageContainerWorldTransform(imageId: string): { a: number; b: number; c: number; d: number; tx: number; ty: number } | null
getImageAtCanvasPoint(x: number, y: number): string | null  // topmost sprite under canvas point
setImageZIndex(imageId: string, zIndex: number): void
```

`PHImageEntry` is defined in `FileSet.ts` (not in the store) to avoid a circular import — `SpineSlotSavedState` references it, and `FileSet.ts` must not import from stores.

---

## Action Queue

`PHImageAction` is a flat interface with optional fields discriminated by `type`:

| type | required fields | effect |
|------|-----------------|--------|
| `'add'` | `slotId, phName, imageId, dataURL` | create sprite in active slot's adapter |
| `'remove'` | `slotId, phName, imageId` | destroy sprite in active slot's adapter |
| `'reorder'` | `slotId, phName, orderedIds[]` | apply new zIndex sequence to sprites in any mounted adapter |
| `'move'` | `slotId, phName, imageId, dataURL, dstSlotId, dstPhName, scale` | remove sprite from src adapter, add to dst adapter (any mounted) |

`'add'` and `'remove'` are guarded by `slotId !== activeSlotId` (skipped for inactive slots). `'reorder'` and `'move'` resolve the adapter via `mountedAdapters.get(slotId)` — they operate on any mounted adapter regardless of which slot is active.

---

## Data Flow: Adding an Image

1. `SpinesPanel.onPhDrop()` — filters `image/*`, calls `phImagesStore.addImage(slotId, phName, file)`
2. `usePlaceholderImagesStore.addImage()` — `readFileAsDataURL(file)` → `crypto.randomUUID()` → push to `images[slotId][phName]` + push `{ type:'add', ... }` to `_pendingActions`
3. `hasPendingActions` computed flips → `PreviewStage` drain watcher fires → `drainPlaceholderActions()`
4. `spineAdapter.addImageToPlaceholder(phName, dataURL, imageId)` called; if entry has non-default transform, `setImageTransform` called immediately after
5. Adapter: `slotContainers[findIndex(slots, phName)]` → non-cached `new PIXI.BaseTexture(img)` + `new PIXI.Sprite(texture)` → `sprite.anchor.set(0.5, 0.5)` → `target.sortableChildren = true; sprite.zIndex = target.children.length` → `findDeepestTarget(container).addChild(sprite)` → `_phImages.set(imageId, sprite)`
6. Vue re-renders `phImagesStore.getPlaceholderImages(slotId, phName)` → thumbnail entry visible

**zIndex:** `sprite.zIndex = target.children.length` (before `addChild`) assigns incrementing indices. `target.sortableChildren = true` tells Pixi to respect zIndex when rendering. Newer images always render on top.

## Data Flow: Removing an Image

`phImagesStore.removeImage(slotId, phName, imageId)` → splices from `images` map + pushes `{ type:'remove' }` action → drain → `spineAdapter.removeImageFromPlaceholder(_, imageId)` → `sprite.parent?.removeChild(sprite)` → `sprite.destroy(...)` → `_phImages.delete(imageId)`

## Data Flow: Cloning an Image

`phImagesStore.cloneImage(slotId, phName, imageId)`:
1. Finds `PHImageEntry` in `images[slotId][phName]`
2. Creates new entry with new UUID, same `dataURL`/`fileName`/`syncEnabled`/`scale`, `posX: 0, posY: 0`
3. Pushes new entry to `images[slotId][phName]`
4. Pushes `{ type:'add', ..., dataURL }` to `_pendingActions`
5. Drain: `addImageToPlaceholder` called; since `scale` may differ from 1, `setImageTransform` is called if `posX !== 0 || posY !== 0 || scale !== 1`

## Data Flow: Reordering Images

`phImagesStore.reorderImages(slotId, phName, orderedIds)`:
1. Sorts `images[slotId][phName]` array to match `orderedIds` order
2. Pushes `{ type:'reorder', slotId, phName, orderedIds }` to `_pendingActions`
3. Drain: finds adapter via `slotId === activeSlotId ? spineAdapter : mountedAdapters.get(slotId)`; calls `adapter.setImageZIndex(id, idx)` for each id in order

`SpinesPanel` drag: `dragstart` on handle sets `application/x-ph-image` data; `drop` on another `ph-image-entry` in same placeholder → computes new order (insert srcImageId at original dstIdx in the pre-splice array) → calls `reorderImages`.

**Correct splice order:** `dstIdx` must be captured BEFORE `entries.splice(srcIdx, 1)`. Using `entries.indexOf(dstImageId)` after splice gives the shifted index, producing wrong results for forward moves.

## Data Flow: Moving to Another Placeholder

`phImagesStore.moveImage(srcSlotId, srcPhName, imageId, dstSlotId, dstPhName)`:
1. Splices entry from `images[srcSlotId][srcPhName]`; clears `activeImageId` if matches
2. Appends `{ ...entry, posX: 0, posY: 0 }` to `images[dstSlotId][dstPhName]` (position resets; scale preserved)
3. Pushes `{ type:'move', slotId: srcSlotId, phName: srcPhName, imageId, dataURL, dstSlotId, dstPhName, scale }` to `_pendingActions`

`SpinesPanel` then immediately calls:
```ts
loaderStore.patchSlotPlaceholderImages(srcSlotId, phImagesStore.getSlotImages(srcSlotId))
// and if dst is non-active non-pinned:
loaderStore.patchSlotPlaceholderImages(dstSlotId, phImagesStore.getSlotImages(dstSlotId))
loaderStore.setActiveSlot(dstSlotId)
```

`patchSlotPlaceholderImages` updates `slot.savedState.placeholderImages` for any slot with an existing savedState. This ensures:
- Returning to srcSlot does not restore the moved image from stale savedState
- Activating dstSlot via `restoreState` picks up the moved image even if drain hasn't processed yet

Drain `'move'` processing:
- `srcAdapter = slotId === activeSlotId ? spineAdapter : mountedAdapters.get(slotId)` → `removeImageFromPlaceholder`
- `dstAdapter = dstSlotId === activeSlotId ? spineAdapter : mountedAdapters.get(dstSlotId)` → `addImageToPlaceholder` + `setImageTransform` + `setImageZIndex`
- `addImageToPlaceholder` idempotency guard prevents double-add when `restoreState` already created the sprite

---

## Independent Transform

Each `PHImageEntry` carries `posX`, `posY`, `scale`, `syncEnabled` — coordinates in the **slot-container local space** (`sprite.x / sprite.y`). This mirrors the spine-slot desynced mode (`SpineSlot.syncEnabled / indPosX / indPosY / indZoom`) but operates one level deeper: inside the container that follows the bone, not inside the global scene.

### Spatial Model

```
Canvas space
  └─ Spine scene (global viewport zoom/pan)
       └─ Slot container (follows bone transform; has worldTransform)
            └─ PIXI.Sprite (x=posX, y=posY, scale=scale, zIndex=N in container-local)
```

`getImageContainerWorldTransform(imageId)` returns `{ a, b, c, d, tx, ty }` — the full affine matrix of `sprite.parent` in canvas space. Converting canvas-space delta → container-local delta requires inverting the 2×2 linear part: `localDX = (d*dx - c*dy) / det; localDY = (-b*dx + a*dy) / det`. Guard: `|det| < 1e-10 → return`.

### Store State

```
activeImageId: ref<string | null>   — global singleton: one active image at a time across all slots
setActiveImage(id)                  — set or clear
updateImageTransform(slotId, phName, imageId, posX, posY, scale) — mutates PHImageEntry live
toggleImageSync(slotId, phName, imageId) — flips syncEnabled; posX/posY/scale unchanged
cloneImage(slotId, phName, imageId) — creates independent copy at (0,0) with same scale
reorderImages(slotId, phName, orderedIds) — reorders array + pushes 'reorder' action
moveImage(srcSlotId, srcPhName, imageId, dstSlotId, dstPhName) — reparents entry + pushes 'move' action
getImageContext(imageId) → { slotId, phName, entry } | null — lookup by id across all slots/phs
peekActions() → readonly PHImageAction[] — read queue without draining (used in slot switch pre-processing)
```

`addImage` sets defaults: `syncEnabled: true, posX: 0, posY: 0, scale: 1`.
`removeImage` clears `activeImageId` if the removed imageId matches.
`moveImage` clears `activeImageId` if the moved imageId matches.

### Canvas Interaction (`PreviewStage.vue`)

`PanTarget` extended to `'global' | 'background' | 'slot' | 'image'`.

**`onPanStart` unified hit-test block (updated 2026-04-25):**

All canvas hit-tests are consolidated under one `if (!e.shiftKey && _hitRect)` block that runs after `isPanning = true`. Canvas coordinates `(_hitCx, _hitCy)` are computed once.

**Priority order inside the block:**

**P1 — desynced image on the ACTIVE slot** (fall-through, no early return):
```ts
let _imageHitOnActiveSlot = false
const hitId = spineAdapter?.getImageAtCanvasPoint(_hitCx, _hitCy)
if (hitId) {
  const hitCtx = placeholderImagesStore.getImageContext(hitId)
  if (hitCtx && !hitCtx.entry.syncEnabled && hitCtx.slotId === activeSlotId) {
    placeholderImagesStore.setActiveImage(hitId)
    _imageHitOnActiveSlot = true   // guards panTarget='image' below
  }
}
```

**P2 — desynced image on a NON-ACTIVE mounted slot** (early return):
```ts
for (const [slotId, adapter] of mountedAdapters) {
  if (slotId === activeSlotId) continue
  if (!slotHasTracks(slotId)) continue            // only slots with animation tracks
  const hitId = adapter.getImageAtCanvasPoint(_hitCx, _hitCy)
  if (!hitId) continue
  const hitCtx = placeholderImagesStore.getImageContext(hitId)
  if (!hitCtx || hitCtx.entry.syncEnabled) continue
  const matrix = adapter.getImageContainerWorldTransform(hitId)  // captured BEFORE setActiveSlot
  loaderStore.setActiveSlot(slotId)
  placeholderImagesStore.setActiveImage(hitId)
  panTarget = 'image'
  panStart = { ..., px: hitCtx.entry.posX, py: hitCtx.entry.posY, imageId: hitId, imageMatrix: matrix }
  return
}
```
Transform is captured before `setActiveSlot` because the async watcher hasn't swapped `spineAdapter` yet. By the time the first `mousemove` fires, `spineAdapter` is already the new adapter (path 5a reuse) and `setImageTransform` operates correctly.

**P3 — spine bounds of a NON-ACTIVE slot** (early return, clears active image):
```ts
for (const [slotId, obj] of mountedSpineObjects) {
  if (slotId === activeSlotId) continue
  if (!slotHasTracks(slotId)) continue            // only slots with animation tracks
  const b = (obj as any).getBounds()
  if (/* point inside b */) {
    placeholderImagesStore.setActiveImage(null)   // spine-body click clears active image
    loaderStore.setActiveSlot(slotId)
    const hitSlot = loaderStore.activeSlot
    panTarget = hitSlot?.syncEnabled === false ? 'slot' : 'global'
    panStart = { ... }
    return
  }
}
```

**Pan-target block** (runs when no early return):
```
shiftKey          → 'global'
background active + desynced → 'background'
_imageHitOnActiveSlot && image desynced → 'image'   // ONLY if THIS click hit the sprite
activeSlot desynced → 'slot'
else              → 'global'
```

`_imageHitOnActiveSlot` is the key guard: without it, any click on the spine body would drag the previously-active image instead of the slot.

**`onPanMove` — `'image'` case:** inverse-matrix delta using `panStart.imageMatrix`, `updateImageTransform` (store) + `setImageTransform` (adapter) directly — no action queue.

**`onWheel`:**
- `shiftKey` → always global zoom (added 2026-04-25; mirrors shift+drag → global pan)
- Background active + desynced → background zoom
- Active desynced image → anchor-to-cursor image scale `[0.05, 20]`
- Active slot desynced → anchor-to-cursor slot zoom
- else → global zoom

**Slot switch watcher:** `placeholderImagesStore.setActiveImage(null)`.

**Canvas spine activation — `slotHasTracks(slotId)` guard:**
Only pinned non-active spine slots that have at least one animation track set (even paused) can be activated via canvas click. Check:
- For non-active slots: `savedState.selectedAnimation !== null` OR any `trackPlaylists` entry is non-empty
Active-slot is excluded from both P2 and P3 (it's already active).

### Pending Activation (inactive slot)

Clicking a thumbnail in an **inactive** slot:
1. `SpinesPanel.onImageThumbClick` saves imageId in `pendingImageToActivate` (local `ref`)
2. Calls `loaderStore.setActiveSlot(slotId)` + expands tree
3. `watch(activeSlotId)` in SpinesPanel fires → verifies imageId still exists → `setActiveImage(pending)`

---

## State Save / Restore on Slot Switch

**Save** (`watch(activeSlotId)` — before adapter is parked/destroyed):
```ts
loaderStore.saveSlotState(oldId, {
  ...existingFields,
  placeholderImages: placeholderImagesStore.getSlotImages(oldId),
})
```

**Pre-move sprite removal** (added 2026-04-24):
Before parking/destroying the old adapter, the slot switch watcher calls `peekActions()` to eagerly remove sprites for any pending `'move'` actions sourced from the old slot:
```ts
for (const action of placeholderImagesStore.peekActions()) {
  if (action.type === 'move' && action.slotId === oldId && action.imageId) {
    spineAdapter.removeImageFromPlaceholder(action.phName, action.imageId)
  }
}
```
This handles the race where the drain watcher fires after `activeSlotId` changed but before the adapter is parked, causing `mountedAdapters.get(srcSlotId)` to miss the parked adapter.

**`patchSlotPlaceholderImages` (useLoaderStore):**
Updates `savedState.placeholderImages` for any slot (active or not) that already has a savedState. Called by SpinesPanel on both src and dst slots immediately after `moveImage`:
- Src patch: prevents returning to srcSlot and seeing the moved image restored from stale savedState
- Dst patch: ensures `restoreState` sees the moved image if `setActiveSlot` triggers path 5b before the drain runs

**Restore (normal path — path 5b):**
```ts
await loadSpine(slot.fileSet, newId, false)
restoreState(slot.savedState)
// Fallback: create sprites for images moved here before this slot had savedState
if (!slot.savedState) {
  const liveImages = placeholderImagesStore.getSlotImages(newId)
  for (const [phName, entries] of Object.entries(liveImages))
    for (const entry of entries) {
      spineAdapter?.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
      spineAdapter?.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
    }
}
applySkins()
applyPlaceholderLabels()
drainPlaceholderActions()  // flush any actions stuck during the async switch
```

**Restore (path 5a — pinned re-mount):** same block; ends with `drainPlaceholderActions()`.

**Restore (pinned non-active mount — pin watcher):** same image block; ends with `drainPlaceholderActions()`.

**`restoreState(s)` inner block:**
```ts
if (s.placeholderImages) {
  placeholderImagesStore.setSlotImages(slot.id, s.placeholderImages)
  for (const [phName, entries] of Object.entries(s.placeholderImages))
    for (const entry of entries) {
      spineAdapter.addImageToPlaceholder(phName, entry.dataURL, entry.imageId)
      spineAdapter.setImageTransform(entry.imageId, entry.posX ?? 0, entry.posY ?? 0, entry.scale ?? 1)
    }
} else {
  placeholderImagesStore.clearSlotImages(slot.id)
}
```

---

## Placeholder Tree in SpinesPanel

`slot.placeholders` is populated by `PreviewStage` after spine load. Pre-scan on slot add via `scanPlaceholderSlots()`.

**`ph-image-entry` structure:**
```
[drag handle ⠿] [thumbnail] [filename] [sync-btn 🔗] [clone-btn] [remove ×]
```
- **Row** — `draggable="true"` on the whole `div.ph-image-entry`; `@dragstart` sets `application/x-ph-image` data `{imageId, srcSlotId, srcPhName}`; `@dragover.prevent` + `@drop` receive ph-image drops for reorder/reparent; `cursor: grab` on the entire row
- **Drag handle** — visual-only `<span>` (dots icon); `pointer-events: none`, shown on hover; no longer the drag source
- **`ph-drop-zone`** — receives both file drops and ph-image drops (ph-image checked first via `dataTransfer.getData('application/x-ph-image')`)

**Drag state refs:** `draggingPhImageId`, `dragOverPhImageId` — CSS classes `ph-image-entry--dragging` (opacity 0.4) and `ph-image-entry--drag-over` (dashed outline).

**Drop logic:**
- Same placeholder: reorder via `reorderImages` (insert src at original dstIdx)
- Different placeholder (same or different spine): `moveImage` + `patchSlotPlaceholderImages(src)` + conditionally `patchSlotPlaceholderImages(dst)` + `setActiveSlot(dst)` if dst non-active non-pinned

---

## Spines Panel Global Toolbar (added 2026-04-25)

A compact toolbar sits above `.spines-list` in `SpinesPanel.vue` with three global action buttons: **Expand · Sync · Pin**.

### State

```ts
// Local to SpinesPanel.vue
const globalPinEnabled    = ref(false)        // explicit pin intent — NOT derived from slot state
const globalSyncEnabled   = ref(true)         // explicit sync intent — NOT derived from slot state
const globalExpandEnabled = ref(false)        // explicit expand intent — NOT derived from slot state
const validSlots          = computed(...)     // spineSlots without error/validationErrors
const slotsWithTracks     = computed(...)     // validSlots filtered by slotHasTracks()
const hasAnyPlaceholders  = computed(...)     // any validSlot has kind==='slot' placeholders
```

### `slotHasTracks(slot)`

```ts
function slotHasTracks(slot: SpineSlot): boolean {
  if (slot.id === loaderStore.activeSlotId) return animationStore.tracks.length > 0
  const s = slot.savedState
  if (!s) return false
  if (s.selectedAnimation) return true
  return Object.values(s.trackPlaylists).some(pl => pl.length > 0)
}
```

Active slot → live `animationStore.tracks`; non-active → `savedState`.

### Button Behaviour

| Button | Active state | Click action |
|--------|-------------|--------------|
| **Expand** | `globalExpandEnabled` | toggles `globalExpandEnabled`; expands or collapses all slots that have placeholders; disabled if none |
| **Sync** | `!globalSyncEnabled` (amber) | toggles `globalSyncEnabled`; syncs or desyncs all `validSlots` to match the new value |
| **Pin** | `globalPinEnabled` (green) | toggles `globalPinEnabled`; pins/unpins only `slotsWithTracks` |

All three buttons carry **explicit intent refs** — local slot states are synchronized TO the global ref value on click, not the other way around. This means returning to the Spines tab after navigating away preserves the global intent; newly added slots inherit it automatically.

**Pin visual states on individual spine rows:**
- `spine-pin-btn--pinned` (bright green) — slot is actually pinned
- `spine-pin-btn--pending` (dim green, 35% opacity) — `globalPinEnabled && !slotHasTracks(slot)` — slot will be auto-pinned when it gets its first animation track

### Auto-Pin on First Track

```ts
watch(() => animationStore.tracks.length, (newLen, oldLen) => {
  if (oldLen === 0 && newLen > 0 && globalPinEnabled.value) {
    loaderStore.setPinned(loaderStore.activeSlotId!, true)
  }
})
```

Fires when the active slot transitions from zero tracks to one or more. Slots already with a savedState that has tracks are handled correctly by `slotsWithTracks` when the global pin button is pressed.

### Inheritance on Drop

When new spines are added via the dropzone, global state is captured before the loop and applied after `addSlot`:

```ts
const inheritDesync = !allSynced.value
const inheritExpand = allExpanded.value
for (const slot of result.slots) {
  loaderStore.addSlot(slot)
  if (!slot.error) {
    if (inheritDesync) loaderStore.setSyncEnabled(slot.id, false)
    if (inheritExpand && slot.placeholders?.some(p => p.kind === 'slot')) {
      expandedSlots.value = new Set([...expandedSlots.value, slot.id])
    }
    // Pin: handled by the auto-pin watch when first animation track is set
  }
}
```

Snapshot before loop prevents the computed values from changing mid-iteration as slots are added.

---

## Adapter Implementation

### BasePixi7Adapter (pixi7 — all Spine versions via inheritance)
```ts
private _phImages: Map<string, PIXI.Sprite> = new Map()  // imageId → Sprite

addImageToPlaceholder(placeholderName, dataURL, imageId) {
  if (this._phImages.has(imageId)) return  // idempotency guard
  // ...
  const img = new Image(); img.src = dataURL
  const sprite = new PIXI.Sprite(new PIXI.Texture(new PIXI.BaseTexture(img)))
  sprite.anchor.set(0.5, 0.5); sprite.x = 0; sprite.y = 0
  ;(sprite as any).__phImage = true
  const target = findDeepestTarget(container)
  target.sortableChildren = true
  sprite.zIndex = target.children.length
  target.addChild(sprite)
  this._phImages.set(imageId, sprite)
}

setImageTransform(imageId, posX, posY, scale) { sprite.x = posX; sprite.y = posY; sprite.scale.set(scale) }
setImageZIndex(imageId, zIndex) { if (sprite) sprite.zIndex = zIndex }
getImageContainerWorldTransform(imageId) { /* returns sprite.parent.worldTransform fields */ }
getImageAtCanvasPoint(x, y) {
  // returns imageId with highest zIndex among sprites where sprite.containsPoint(new PIXI.Point(x, y))
}
```

### Spine42Adapter (pixi8)
```ts
private _phImageSprites: Map<string, PIXI.Sprite> = new Map()
private _phSlotContainers: Map<string, PIXI.Container> = new Map()

addImageToPlaceholder(placeholderName, dataURL, imageId) {
  if (this._phImageSprites.has(imageId)) return
  // one phContainer per placeholder via addSlotObject()
  phContainer.sortableChildren = true
  sprite.zIndex = phContainer.children.length
  phContainer.addChild(sprite)
  // async texture via img.onload
}

setImageZIndex(imageId, zIndex) { if (sprite) sprite.zIndex = zIndex }
getImageAtCanvasPoint(x, y) { /* same logic via _phImageSprites */ }
```

### Spine41Adapter (pixi8 stub)
All placeholder methods are no-ops / return null.

---

## Decision Log

### Full 6-element affine matrix for anchor zoom
`getImageContainerWorldTransform` returns `{ a, b, c, d, tx, ty }`. Simplified (only tx/ty/scaleX/scaleY) fails when slot container has rotation from an animated bone.

### Direct call for drag/scroll transform (no action queue)
`updateImageTransform` (store) + `setImageTransform` (adapter) called directly in `mousemove`/`wheel` — no queue, no throttle. Queuing high-frequency events causes one-tick lag where sprite follows cursor.

### `pendingImageToActivate` in SpinesPanel, not in store
Local `ref` in `SpinesPanel.vue`. No other component needs this state.

### `posX, posY` in container-local space
Direct `sprite.x / sprite.y`. Canvas-space storage would break on global viewport pan/zoom changes.

### Store as action-queue bridge
`usePlaceholderImagesStore` is the message bus. `defineExpose` + prop drilling alternative rejected — deep coupling.

### `imageId` generated in store, not returned by adapter
`crypto.randomUUID()` in `addImage()` before enqueueing. Adapter is a render target; store owns identity.

### `cloneImage` uses action queue, not direct adapter call
Clone is a one-time operation (not high-frequency). Queue ensures correct ordering with other pending actions.

### `reorderImages` + `moveImage` use action queue, operate on any mounted adapter
Unlike `add`/`remove` (active slot only), `reorder` and `move` find adapters via `mountedAdapters.get(slotId)` — they work across pinned non-active slots without requiring a slot switch.

### `drainPlaceholderActions()` called explicitly after slot switch paths
The `hasPendingActions` watcher cannot re-fire on the same `true` value. If drain returns early (`!spineAdapter`) during an async slot switch, `_pendingActions` stays non-empty. Calling `drainPlaceholderActions()` at the end of paths 5a/5b/pin-mount guarantees flush once the new adapter is valid.

### `patchSlotPlaceholderImages` patches savedState for BOTH src and dst on move
If only dst is patched, returning to src after a move (without an intervening slot switch for src) restores the old savedState which still contains the moved image. Always patching src prevents this phantom restore.

### `peekActions()` for pre-park sprite removal
Drain watcher fires after `activeSlotId` changes but before the slot switch watcher parks the old adapter. `mountedAdapters.get(srcSlotId)` returns undefined at that moment. `peekActions()` in the slot switch watcher, called before park/destroy, uses the still-live `spineAdapter` to remove the sprite correctly. Actions remain in `_pendingActions` for the drain to process the dst-add.

### `sortableChildren = true` + incrementing `zIndex`
Pixi only respects `zIndex` when the parent container has `sortableChildren = true`. Set on `target` at every `addImageToPlaceholder` call (idempotent). zIndex = `target.children.length` before `addChild` → first added = 0, each subsequent = +1. Higher = on top.

### `_imageHitOnActiveSlot` flag guards panTarget='image'
Without the flag, any canvas click would drag the previously-active image if `activeImageId` is set. The flag is set only when the current `mousedown` actually hits a desynced image sprite of the active slot. The pan-target block checks the flag, not just `activeImageId`, so clicking on the spine body correctly starts slot/global pan even with an active image.

### Canvas spine activation restricted to slots with animation tracks
Clicking on a pinned non-active spine on the canvas should only activate spines that the user has meaningfully configured (tracks set). Spines without tracks are likely still being set up; activating them on accidental clicks would disrupt workflow. Guard: `slotHasTracks(slotId)` checked before bounds test in P3 and before image hit-test in P2.

### Cross-slot image drag: transform captured before `setActiveSlot`
P2 calls `adapter.getImageContainerWorldTransform(hitId)` on the non-active adapter before calling `setActiveSlot`. By the time the first `mousemove` fires, the async watcher has completed path 5a and swapped `spineAdapter` to the same adapter. The captured `imageMatrix` in `panStart` remains valid throughout the drag.

### Global toolbar buttons use explicit intent refs, not derived computed state
All three global toolbar buttons (`globalPinEnabled`, `globalSyncEnabled`, `globalExpandEnabled`) store their intent in a `ref`, NOT in a computed property derived from the current slot states.

**Why not computed?**
- `allSynced` / `allExpanded` are snapshots of the current slot array. If a user navigates to another panel and returns to Spines, the computed still reflects the live slot state — but the global button value would need to re-agree with it, making the apparent button state non-deterministic and potentially triggering an inversion on click instead of a no-op.
- A computed-based toggle (click when `allSynced` → desync, click when `!allSynced` → sync) inverts locals based on their aggregate state at click-time. If one slot was manually changed, the aggregate state changed too, and the next click goes the "wrong" direction.
- `globalPinEnabled` / `globalSyncEnabled` / `globalExpandEnabled` are durable intents: the refs persist in the component instance across tab switches. Local states are set TO the ref value on click, not read FROM the slots to derive the ref.

**Panels return fix:** before this change, switching away from Spines and returning caused local sync/expand states to appear desynced from the global button because the computed flipped to match the (potentially changed) slot state. With explicit refs, the global button retains its state and locals are re-applied on next click if needed.

### Drag on entire `ph-image-entry` row, not just handle
`draggable="true"` was moved from `<span class="ph-image-drag-handle">` to `<div class="ph-image-entry">`. The handle is now `pointer-events: none` — purely visual. Whole-row drag is more discoverable and matches how users expect list items to behave.

### Global scrollbar in `themes.css`
All scrollbar styles were consolidated into a single `*::-webkit-scrollbar` / `scrollbar-width: thin` rule in `themes.css` using `--c-scroll` / `--c-scroll-hov` tokens. Per-component scrollbar CSS was removed from 7 panel files (~60 lines total). New scrollable areas (e.g. SpinesPanel) get styled automatically without per-component rules.

### Shift+scroll always zooms global scene
`onWheel` gained a `shiftKey` early branch that routes directly to global zoom — mirroring the existing `shiftKey` branch in `onPanStart` that routes to global pan. Consistent modifier semantics: Shift = global viewport, always.

---

## Dependency Map

```mermaid
flowchart TD
    subgraph Types
        FileSet["FileSet.ts\nPHImageEntry + syncEnabled/posX/posY/scale\nSpineSlot.placeholders\nSpineSlotSavedState.placeholderImages"]
        IAdapter["ISpineAdapter.ts\naddImageToPlaceholder()\nremoveImageFromPlaceholder()\nsetImageTransform()\ngetImageContainerWorldTransform()\ngetImageAtCanvasPoint()\nsetImageZIndex()"]
    end
    subgraph Store
        PHStore["usePlaceholderImagesStore\nimages: slotId→phName→PHImageEntry[]\n_pendingActions: add|remove|reorder|move\nhasPendingActions · peekActions()\nactiveImageId · setActiveImage()\nupdateImageTransform() · toggleImageSync()\ncloneImage() · reorderImages() · moveImage()\ngetImageContext()"]
        LoaderStore["useLoaderStore\nsetSlotPlaceholders()\nscanPlaceholderSlots()\npatchSlotPlaceholderImages()\nPH_PENDING_SENTINEL"]
    end
    subgraph Adapters
        Base["BasePixi7Adapter\n_phImages: Map(id→Sprite)\nsetImageTransform ✅\ngetContainerWorldTransform ✅\ngetImageAtCanvasPoint ✅\nsetImageZIndex ✅\nsortableChildren+zIndex on addImage"]
        Sp42["Spine42Adapter\n_phImageSprites: Map(id→Sprite)\n_phSlotContainers: Map(phName→Container)\nsetImageTransform ✅\ngetContainerWorldTransform ✅\ngetImageAtCanvasPoint ✅\nsetImageZIndex ✅"]
        Sp41["Spine41Adapter (pixi8)\nno-op stubs"]
    end
    subgraph Components
        SpinesPanel["SpinesPanel.vue\nph-image-entry: full-row draggable\nonPhImageDragStart / onPhImageEntryDrop\nonPhDrop: ph-image reparent + file drop\ncloneImage / reorderImages / moveImage\npatchSlotPlaceholderImages(src+dst)\nsetActiveSlot if dst non-active non-pinned\nph-image-sync-btn · ph-image-clone-btn\nglobalPinEnabled · globalSyncEnabled · globalExpandEnabled\nslotHasTracks() · slotsWithTracks\nauto-pin watch (animationStore.tracks)\ninheritDesync/inheritExpand on drop"]
        PreviewStage["PreviewStage.vue\ndrainPlaceholderActions() (named fn)\nwatcher hasPendingActions → drain\nslot switch: peekActions() pre-remove\nslot switch end → drainPlaceholderActions()\nPanTarget: 'image'\nonPanStart: _imageHitOnActiveSlot flag\nP1 active-slot image hit-test\nP2 non-active slot image hit-test + drag\nP3 spine bounds → activate + clear image\nonPanMove → inverse matrix delta\nonWheel: shiftKey→global, else per-target\nrestoreState → setImageTransform\nnull-savedState fallback for move targets"]
    end

    FileSet -->|PHImageEntry type| PHStore
    FileSet -->|PHImageEntry type| IAdapter
    IAdapter -->|implemented by| Base
    IAdapter -->|implemented by| Sp42
    IAdapter -->|implemented by| Sp41

    SpinesPanel -->|reads slot.placeholders| LoaderStore
    SpinesPanel -->|addImage / removeImage / cloneImage| PHStore
    SpinesPanel -->|reorderImages / moveImage| PHStore
    SpinesPanel -->|getPlaceholderImages / getSlotImages| PHStore
    SpinesPanel -- "setActiveImage\ntoggleImageSync" --> PHStore
    SpinesPanel -->|patchSlotPlaceholderImages| LoaderStore
    SpinesPanel -->|setActiveSlot| LoaderStore

    PreviewStage -->|watches hasPendingActions| PHStore
    PreviewStage -->|drainActions / peekActions| PHStore
    PreviewStage -->|setSlotImages / clearSlotImages / getSlotImages| PHStore
    PreviewStage -- "getImageContext\nupdateImageTransform\nsetActiveImage" --> PHStore
    PreviewStage -->|addImageToPlaceholder / removeImageFromPlaceholder| IAdapter
    PreviewStage -- "setImageTransform\ngetImageContainerWorldTransform\ngetImageAtCanvasPoint\nsetImageZIndex" --> IAdapter
    PreviewStage -->|setSlotPlaceholders\nsaveSlotState| LoaderStore

    Base -->|PIXI.Texture + Sprite| Pixi7["Pixi.js v7"]
    Sp42 -->|PIXI.Texture + Sprite| Pixi8["Pixi.js v8"]
```

---

## Adapter Implementation Notes

### Spine 4.2 / Pixi8 — `addSlotObject` API

`spine-pixi-v8` має **не** `slotContainers[]`, а `addSlotObject(slotRef, container)` API:

```ts
// slotRef can be: string (name), number (index), or Slot object
spine.addSlotObject(placeholderName, container)
// → container follows bone transform each frame automatically
// → container.includeInBuild = false (excluded from batch renderer)
```

`Spine42Adapter` кешує контейнери у `_phSlotContainers: Map<string, PIXI.Container>` — один контейнер на placeholder, спрайти додаються як дочірні. `findDeepestContainerTarget` видалено (Pixi7-only helper).

**Версії:** Spine 3.8, 4.0, 4.1 (всі через `BasePixi7Adapter` / Pixi7) — ✅; Spine 4.2 (Pixi8) — ✅.

---

## Bug History

### Bug 1 — New images nested inside previous images in the same placeholder
_Fixed: 2026-04-23_

`findDeepestTarget` descended into previously-added user sprites (`PIXI.Sprite` has `.children[]`). Fix: mark user sprites with `__phImage = true`; filter skips `__phImage` nodes.

### Bug 2 — Sprite duplicated after switching away from and back to a slot
_Fixed: 2026-04-23_

Pinned adapter reuse + re-calling `addImageToPlaceholder` created a second sprite for the same imageId. Fix: idempotency guard `if (_phImages.has(imageId)) return`.

### Bug 3 — Activation click only worked on the thumbnail image
_Fixed: 2026-04-23_

`@click.stop` was on `<img>` only. Fix: moved to the parent `<div class="ph-image-entry">`.

### Bug 4 — Crash after adding image to sp2, switching between pinned sp1 and sp2
_Fixed: 2026-04-23_

`PIXI.Texture.from(dataURL)` shared global cache — destroying sp2's texture nulled sp1's BaseTexture. Fix: `new PIXI.BaseTexture(new Image())` per call — unique cache key per adapter per image.

### Bug 5 — Placeholder images not restored after pinning an inactive spine
_Fixed: 2026-04-24_

Pin watcher mounted the adapter and restored animations but did not restore placeholder images. Fix: added the `placeholderImages` restore block (matching path 5b) inside the pin watcher's mount loop, followed by `drainPlaceholderActions()`.

### Bug 6 — Clone image did not apply scale immediately
_Fixed: 2026-04-24_

`drainPlaceholderActions` called `addImageToPlaceholder` (creates sprite at scale=1) but did not call `setImageTransform` for entries with non-default scale. Fix: after `addImageToPlaceholder`, check store context and call `setImageTransform` if `posX !== 0 || posY !== 0 || scale !== 1`.

### Bug 7 — Move sprite remained in source spine after reparenting
_Fixed: 2026-04-24_

**Root cause:** drain watcher fired after `activeSlotId` changed to dstSlotId but before the slot switch watcher ran. `mountedAdapters.get(srcSlotId)` returned undefined (adapter not yet parked). For pinned src, adapter was later parked (not destroyed) — sprite persisted.

**Fix:** `peekActions()` in slot switch watcher (before park/destroy) eagerly removes sprites for pending `'move'` src actions using the still-live `spineAdapter`. Drain later processes dst-add (idempotency guards prevent double-add).

### Bug 8 — Second move from same source had no effect on canvas
_Fixed: 2026-04-24_

Drain watcher returned early when `!spineAdapter` (during async slot switch) WITHOUT calling `drainActions()`. `_pendingActions` stayed non-empty; `hasPendingActions` stayed `true` with no value change → watcher never re-fired. Second `moveImage` added another action but watcher still didn't fire (value unchanged).

**Fix:** Extracted drain logic into `drainPlaceholderActions()` called explicitly at end of paths 5a/5b/pin-mount. After slot switch completes (`spineAdapter` valid), all stuck actions are processed.

### Bug 9 — Moved image restored to source spine on next activation
_Fixed: 2026-04-24_

When dst was already active (no slot switch), src's `savedState.placeholderImages` was never updated — it still held the moved image. On returning to src, `restoreState` would recreate the sprite.

**Fix:** `patchSlotPlaceholderImages(srcSlotId, getSlotImages(srcSlotId))` called immediately after `moveImage` in SpinesPanel, for both drop handlers. Patches savedState with the post-move (empty) state before any slot switch.

### Bug 10 — Reorder within same placeholder had no effect (forward drag) or wrong result
_Fixed: 2026-04-24_

`entries.indexOf(dstImageId)` was called AFTER `entries.splice(srcIdx, 1)`, giving the shifted (post-removal) index. For forward moves (srcIdx < dstIdx), this inserted src BEFORE dst instead of AT dst's original position, producing no visible change (1→2) or wrong index (1→3 gave index 2).

**Fix:** Capture `dstIdx = entries.indexOf(dstImageId)` before splice, then `entries.splice(dstIdx, 0, srcImageId)` — src lands at the original position of dst in all cases.
