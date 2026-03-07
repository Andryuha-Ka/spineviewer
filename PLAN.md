# Spine Viewer Pro — Implementation Plan

> **Stack:** Vite 5 · Vue 3 · TypeScript · Pinia · Naive UI · Pixi.js 7 або 8 (вибір користувача)
> **Принцип:** все спільне — з одного джерела (`src/core/`), все версійно-специфічне — в `src/adapters/pixi{7,8}/spine{38,40,41,42}/`
> **Кожен крок** завершується видимим, робочим результатом у браузері.

---

## Структура адаптерів (архітектурне рішення)

```
src/
├── core/                        # SHARED — не залежить від версії Pixi/Spine
│   ├── types/
│   │   ├── ISpineAdapter.ts     # контракт для всіх Spine-адаптерів
│   │   ├── IPixiApp.ts          # контракт для Pixi7App / Pixi8App
│   │   └── FileSet.ts           # структура завантажених файлів
│   ├── utils/
│   │   ├── fileLoader.ts        # читання файлів, підтримка avif/webp/png/jpg
│   │   ├── versionDetector.ts   # визначення версії Spine з .json / .skel
│   │   └── atlasTextParser.ts   # парсинг .atlas текстового формату
│   └── stores/
│       ├── useVersionStore.ts   # вибрана версія Pixi + Spine
│       ├── useViewerStore.ts    # zoom, pos, bg, renderType
│       ├── useAnimationStore.ts # треки, play/pause, speed, loop
│       ├── useSkeletonStore.ts  # кістки, слоти, скіни, attachments
│       ├── useEventsStore.ts    # event log, фільтри
│       └── useProfilerStore.ts  # fps, draw calls, frame log
│
├── adapters/                    # VERSION-SPECIFIC
│   ├── pixi7/
│   │   ├── Pixi7App.ts          # ініціалізація PIXI.Application v7
│   │   ├── spine38/
│   │   │   └── Spine38Adapter.ts   # @pixi-spine/all-3.8
│   │   ├── spine40/
│   │   │   └── Spine40Adapter.ts   # @pixi-spine/all-4.0
│   │   └── spine41/
│   │       └── Spine41Adapter.ts   # @pixi-spine/all-4.1
│   └── pixi8/
│       ├── Pixi8App.ts          # ініціалізація PIXI.Application v8
│       ├── spine41/
│       │   └── Spine41Adapter.ts   # @esotericsoftware/spine-pixi-v8 (4.1 runtime)
│       └── spine42/
│           └── Spine42Adapter.ts   # @esotericsoftware/spine-pixi-v8 (4.2 runtime)
│
└── components/                  # SHARED Vue компоненти
    ├── pages/
    │   ├── VersionPickerPage.vue
    │   └── ViewerPage.vue
    ├── panels/
    │   ├── LoaderPanel.vue
    │   ├── AnimationPanel.vue
    │   ├── SkinsPanel.vue
    │   ├── SkeletonPanel.vue       # Step 7 — Inspector: кістки + активні attachments
    │   ├── EventsPanel.vue
    │   ├── AtlasInspector.vue
    │   ├── ProfilerPanel.vue
    │   ├── ComplexityPanel.vue
    │   └── ExportPanel.vue
    ├── stage/
    │   ├── PreviewStage.vue
    │   ├── OverlayControls.vue
    │   └── Timeline.vue
    └── ui/
        ├── SettingsPopover.vue     # Перемикач теми Dark/Light + шрифт S/M/L (реалізовано між Step 7 і 8)
        ├── SplitLayout.vue
        └── ResizablePanel.vue
```

### Контракт адаптера (незмінний для всіх версій)

```typescript
// src/core/types/ISpineAdapter.ts

export interface ISpineAdapter {
  readonly animations: string[];
  readonly skins: string[];
  readonly bones: BoneInfo[];
  readonly slots: SlotInfo[];
  readonly events: EventInfo[];
  readonly detectedVersion: string;

  load(files: FileSet): Promise<void>;
  mount(container: PIXI.Container): void;
  destroy(): void;

  // Animation
  setAnimation(track: number, name: string, loop: boolean): void;
  addAnimation(track: number, name: string, loop: boolean, delay?: number): void;
  clearTrack(track: number): void;
  clearTracks(): void;
  setTimeScale(scale: number): void;
  setTrackTimeScale(track: number, scale: number): void;  // per-track freeze/resume
  setTrackLoop(track: number, loop: boolean): void;
  removeQueueEntry(track: number, index: number): void;   // removes entry from TrackEntry.next chain
  seekTo(track: number, time: number): void;

  // Skeleton
  setSkin(name: string): void;
  setSkins(names: string[]): void;        // compose multiple skins
  setToSetupPose(): void;
  setBonesToSetupPose(): void;
  setSlotsToSetupPose(): void;

  // Live data (called each frame by ticker)
  getTrackStates(): TrackState[];         // TrackState includes queue: TrackQueueEntry[]
  getBoneTransforms(): BoneTransform[];
  getActiveAttachments(): AttachmentInfo[];

  // Event listener
  onEvent(cb: (e: SpineEvent) => void): () => void;  // returns unsubscribe
}
```

---

## Step 0 — Environment Setup

**Видимий результат:** `http://localhost:5173` показує заглушку "Spine Viewer Pro" на темному фоні.

### Задачі

- [ ] Ініціалізувати проєкт: `npm create vite@latest spine-viewer-pro -- --template vue-ts`
- [ ] Встановити залежності:
  ```
  # Core
  npm i pinia naive-ui @vueuse/core

  # Pixi 7 (та spine-пакети для нього)
  npm i pixi.js@^7.4.3
  npm i @pixi-spine/all-3.8@^4.0.6
  npm i @pixi-spine/all-4.0@^4.0.6
  npm i @pixi-spine/all-4.1@^4.0.6

  # Pixi 8 (та офіційний spine-пакет)
  npm i pixi.js@npm:pixi.js-v8@^8.x         # або через alias у vite.config
  npm i @esotericsoftware/spine-pixi-v8@^4.2.x

  # Dev
  npm i -D @types/node unplugin-auto-import unplugin-vue-components
  ```
  > Pixi 7 і Pixi 8 встановлюються через Vite aliases (`resolve.alias`):
  > `'pixi7' → node_modules/pixi.js@7`, `'pixi8' → node_modules/pixi.js@8`

- [ ] Налаштувати `vite.config.ts`:
  - aliases для pixi7 / pixi8
  - auto-import для Vue composables і Pinia
  - auto-import компонентів Naive UI

- [ ] Налаштувати `tsconfig.json` (strict mode)
- [ ] Налаштувати ESLint + Prettier
- [ ] Базова структура папок (`src/core/`, `src/adapters/`, `src/components/`)
- [ ] Глобальний CSS reset, темна тема Naive UI
- [ ] `App.vue` → `<router-view>` або одна сторінка-заглушка

### Claude Code — Агенти та скіли

> Налаштовуються один раз, використовуються на кожному наступному кроці.

#### Агенти (вбудовані, не потребують встановлення)

| Агент | Коли використовувати |
|-------|----------------------|
| **Plan** | Перед реалізацією кожного кроку — читає код, проєктує підхід, виявляє конфлікти |
| **Explore** | Швидкий пошук по кодовій базі: "де використовується X", "які файли відповідають за Y" |
| **general-purpose** | Складні дослідницькі задачі, що потребують кількох раундів пошуку |

**Рекомендований workflow для кожного кроку:**
```
/next-step → Plan агент (проєктування) → реалізація → /check
```

#### Локальні скіли (`.claude/commands/`)

Файли зберігаються в `.claude/commands/` — автоматично доступні як `/команда` в цьому проєкті.

| Команда | Файл | Призначення |
|---------|------|-------------|
| `/check` | `check.md` | `vue-tsc --noEmit` + `vite build` — звіт про всі TS та білд помилки |
| `/next-step` | `next-step.md` | Знаходить наступний `⬜` крок у PLAN.md, запускає Plan агента, реалізує після підтвердження |
| `/dev` | `dev.md` | Запускає `vite` dev сервер та виводить локальний URL |

- [ ] Створити `.claude/commands/check.md`
- [ ] Створити `.claude/commands/next-step.md`
- [ ] Створити `.claude/commands/dev.md`
- [ ] Додати необхідні дозволи в `.claude/settings.local.json`

---

## Step 1 — Version Picker Page

**Видимий результат:** сторінка з двома великими картками (Pixi 7 / Pixi 8), при кліку на кожну — розгортається список версій Spine. Вибір зберігається, кнопка "Open Viewer" стає активною.

### UI

```
┌──────────────────────────────────────────────────────┐
│              Spine Viewer Pro                        │
│                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │     Pixi.js 7       │  │     Pixi.js 8       │   │
│  │                     │  │   (recommended)     │   │
│  │  Spine versions:    │  │  Spine versions:    │   │
│  │  ○ 3.8              │  │  ○ 4.1              │   │
│  │  ○ 4.0              │  │  ● 4.2              │   │
│  │  ● 4.1              │  │                     │   │
│  └─────────────────────┘  └─────────────────────┘   │
│                                                      │
│              [ Open Viewer ]                         │
└──────────────────────────────────────────────────────┘
```

### Задачі

- [ ] `src/core/stores/useVersionStore.ts`:
  ```typescript
  export const useVersionStore = defineStore('version', () => {
    const pixiVersion = ref<7 | 8 | null>(null);
    const spineVersion = ref<'3.8' | '4.0' | '4.1' | '4.2' | null>(null);

    const spineOptionsMap = {
      7: ['3.8', '4.0', '4.1'],
      8: ['4.1', '4.2'],
    };

    const isReady = computed(() => pixiVersion.value !== null && spineVersion.value !== null);

    return { pixiVersion, spineVersion, spineOptionsMap, isReady };
  });
  ```
- [ ] `src/components/pages/VersionPickerPage.vue` — картки, радіо-кнопки, кнопка
- [ ] При підтвердженні — перехід до ViewerPage (router або умовний render)
- [ ] Зберігати вибір у `localStorage` (відновлення при перезавантаженні)

---

## Step 2 — Adapter Factory + Порожній Canvas

**Видимий результат:** після вибору версій відкривається сторінка з темним canvas і кольоровим фоном — Pixi application запущений, ticker працює, FPS відображається.

### Задачі

- [ ] `src/core/types/ISpineAdapter.ts` — повний інтерфейс (див. вище)
- [ ] `src/core/types/IPixiApp.ts`:
  ```typescript
  export interface IPixiApp {
    readonly renderer: unknown;   // PIXI.Renderer (v7 або v8, incompatible types)
    readonly stage: unknown;      // PIXI.Container
    readonly ticker: { FPS: number; add(fn: (dt: number) => void): void };
    resize(w: number, h: number): void;
    destroy(): void;
    setBackground(color: number): void;
  }
  ```
- [ ] `src/adapters/pixi7/Pixi7App.ts` — реалізує `IPixiApp` через Pixi 7
- [ ] `src/adapters/pixi8/Pixi8App.ts` — реалізує `IPixiApp` через Pixi 8
- [ ] `src/core/AdapterFactory.ts`:
  ```typescript
  export async function createPixiApp(pixiVersion: 7 | 8): Promise<IPixiApp> {
    if (pixiVersion === 7) {
      const { Pixi7App } = await import('./adapters/pixi7/Pixi7App');
      return new Pixi7App();
    }
    const { Pixi8App } = await import('./adapters/pixi8/Pixi8App');
    return new Pixi8App();
  }

  export async function createSpineAdapter(
    pixiVersion: 7 | 8,
    spineVersion: string
  ): Promise<ISpineAdapter> {
    const key = `${pixiVersion}-${spineVersion}`;
    const map: Record<string, () => Promise<{ default: new () => ISpineAdapter }>> = {
      '7-3.8': () => import('./adapters/pixi7/spine38/Spine38Adapter'),
      '7-4.0': () => import('./adapters/pixi7/spine40/Spine40Adapter'),
      '7-4.1': () => import('./adapters/pixi7/spine41/Spine41Adapter'),
      '8-4.1': () => import('./adapters/pixi8/spine41/Spine41Adapter'),
      '8-4.2': () => import('./adapters/pixi8/spine42/Spine42Adapter'),
    };
    const mod = await map[key]();
    return new mod.default();
  }
  ```
- [ ] `src/components/stage/PreviewStage.vue` — монтує canvas, ініціалізує `IPixiApp`
- [ ] `src/core/stores/useViewerStore.ts` — `bgColor`, `zoom`, `posX`, `posY`
- [ ] FPS counter у куті canvas (з `IPixiApp.ticker.FPS`)

---

## Step 3 — File Loader (shared)

**Видимий результат:** drag-and-drop зона, можна скинути папку або файли; видно список завантажених файлів з іконками типу; з'являється кнопка "Load". Якщо файлів не вистачає — виводиться помилка.

### Формати зображень

Підтримуються: `.png` · `.jpg` · `.webp` · **`.avif`**
Визначення через `filename.match(/\.(png|jpe?g|webp|avif)$/i)`.
Завантаження через `FileReader.readAsDataURL()` — браузер декодує AVIF нативно (Chrome 85+, Firefox 93+, Safari 16+).

### Задачі

- [ ] `src/core/types/FileSet.ts`:
  ```typescript
  export interface SpineFile {
    filename: string;         // оригінальна назва
    fileBody: string | ArrayBuffer; // DataURL для зображень, text для json/atlas, ArrayBuffer для skel
    type: 'skeleton-json' | 'skeleton-skel' | 'atlas' | 'image';
    mimeType: string;
  }

  export interface FileSet {
    skeleton: SpineFile;      // .json або .skel
    atlas: SpineFile;         // .atlas
    images: SpineFile[];      // .png / .jpg / .webp / .avif
  }
  ```
- [ ] `src/core/utils/fileLoader.ts`:
  - `readFileAsText(file: File): Promise<string>`
  - `readFileAsDataURL(file: File): Promise<string>` — для зображень (включно avif)
  - `readFileAsArrayBuffer(file: File): Promise<ArrayBuffer>` — для .skel
  - `classifyFiles(files: File[]): FileSet | ValidationError`
  - Валідація: є хоча б один .json або .skel; є .atlas; є хоча б одне зображення
- [ ] `src/core/utils/versionDetector.ts`:
  - `detectSpineVersion(jsonText: string): string` — читає `json.spine` поле, повертає `'3.8'`, `'4.0'`, `'4.1'`, `'4.2'`, `'unknown'`
  - `isCompatible(detected: string, selected: string): boolean`
- [ ] `src/components/panels/LoaderPanel.vue`:
  - Drag-and-drop зона (або вибір файлів / папки)
  - Список файлів з іконками типу та розміром
  - Попередження якщо виявлена версія Spine не відповідає обраній
  - Кнопка "Load" та "Clear"

---

## Step 4 — Spine Rendering (shared UI, per-version adapter)

**Видимий результат:** завантажений Spine рендериться на canvas, грає першу анімацію за замовчуванням.

### Задачі

**Спільна частина (core):**
- [ ] `src/core/utils/atlasTextParser.ts` — парсинг .atlas для передачі в адаптер
- [ ] `src/core/stores/useSkeletonStore.ts` — `animations[]`, `skins[]`, `bones[]`, `slots[]`
- [ ] `PreviewStage.vue` — викликає `adapter.load(fileSet)`, потім `adapter.mount(stage)`
- [ ] Після mount — заповнює `useSkeletonStore` даними з `adapter`

**Pixi 7 адаптери** (кожен реалізує `ISpineAdapter`):
- [ ] `Spine38Adapter.ts`:
  - `import * as spine38 from '@pixi-spine/all-3.8'`
  - Побудова `TextureAtlas` через власний `imageResolver` (не `imageLoaderAdapter`)
  - `imageResolver` підтримує avif: `fileSet.images.find(img => img.filename === name)`
  - Повертає клас-обгортку над `spine38.Spine`
- [ ] `Spine40Adapter.ts` — аналогічно з `@pixi-spine/all-4.0`
- [ ] `Spine41Adapter.ts` — аналогічно з `@pixi-spine/all-4.1`

**Pixi 8 адаптери:**
- [ ] `Spine41Adapter.ts`:
  - `import { SpineFromAtlas } from '@esotericsoftware/spine-pixi-v8'`
  - Pixi 8 Assets pipeline або ручне завантаження текстур
  - Підтримка avif через `PIXI.Assets.load` з правильним `loadParser`
- [ ] `Spine42Adapter.ts` — аналогічно, runtime Spine 4.2

**Спільний imageResolver для avif (core/utils):**
```typescript
// src/core/utils/buildImageResolver.ts
export function buildImageResolver(images: SpineFile[]) {
  const textureMap = new Map<string, PIXI.Texture>();

  for (const img of images) {
    // DataURL підтримує avif нативно — браузер декодує
    const texture = PIXI.Texture.from(img.fileBody as string);
    textureMap.set(img.filename, texture);
  }

  return (path: string, callback: (tex: PIXI.Texture | null) => void) => {
    const name = path.split('/').pop() ?? path;
    const key = [...textureMap.keys()].find(k => k === name || k.endsWith(`/${name}`));
    callback(key ? textureMap.get(key)! : null);
  };
}
```
> Ця функція використовується в УСІХ адаптерах — імпортується з `core/utils`.

---

## Step 5 — Animation Controls

**Видимий результат:** панель з анімаціями, треками 0–11, play/pause, speed, loop, shift ±frame.

### Задачі

- [x] `src/core/stores/useAnimationStore.ts`:
  ```typescript
  const tracks        = ref<TrackState[]>([])           // live state per track (updated each tick)
  const speed         = ref(1)                          // 0.0–3.0
  const loop          = ref(false)                      // default loop for cascader selections
  const currentTrack  = ref(0)                          // selected track (0–11)
  const isPlaying     = ref(false)
  const isPaused      = ref(false)                      // true = frozen mid-animation
  const trackEnabled  = ref<Record<number, boolean>>({}) // absent/true = enabled, false = disabled
  const trackPlaylists = ref<Record<number, TrackQueueEntry[]>>({}) // master playlist per track

  // Actions: play(), pause(), stop(), setTrackEnabled(), isTrackEnabled()
  // Playlist: setTrackPlaylist(), appendToTrackPlaylist(), removeFromTrackPlaylist(),
  //           clearTrackPlaylist(), clearAllTrackPlaylists()
  ```
  **Play/Pause/Stop state machine:**
  - `play()` → якщо не isPaused: відновлює послідовності з trackPlaylists у Spine; якщо isPaused: лише знімає timeScale=0
  - `pause()` → timeScale=0, isPaused=true
  - `stop()` → timeScale=0, isPaused=false (авто: всі треки завершились без loop/queue; або clearTracks)

- [x] `AnimationPanel.vue`:
  - Cascader з анімаціями (групування за `/` в назві)
  - Треки 0–11 (сітка 6×2): зелений = active, синій = running
  - **Add mode** toggle — OFF: setAnimation, ON: addAnimation (додає в чергу)
  - Play / ⏸ Pause / ▶ Resume (один елемент, три стани)
  - ← 1f / 1f → — seek ±1/60s для **всіх активних треків одразу**
  - Loop (global default для cascader), Speed 0–3×
  - **Active tracks** — блочний список:
    - Хедер блоку: enabled checkbox, loop checkbox (per-track), #N, ✕ (clearTrack)
    - Поточна анімація: ▶ + назва (без прогрес-бару в HTML)
    - Черга: ⏭ + назва + ✕ (removeQueueEntry)
    - Clear All поруч із заголовком секції → clearTracks + setToSetupPose
  - Прогрес анімацій **не в HTML** — відображається в Pixi overlay (див. нижче)

- [x] `PreviewStage.vue` — ticker:
  - Читає `adapter.getTrackStates()` → `animationStore.setTracks()`
  - Заморожує disabled looped треки через `setTrackTimeScale(track, 0)`
  - Авто-стоп: `!hasLoop && !hasQueue && all tracks at end`
  - `setToSetupPose()` при clearTracks (і clearTrack якщо останній трек)

- [ ] **Pixi track overlay** (`PreviewStage.vue` ticker, `PIXI.Text`):
  - Лівий нижній кут canvas, моноширинний шрифт ~12px
  - Один рядок на трек: `#N  <назва>  <time>s / <duration>s  [████░░]  [loop]`
  - Вимкнений трек: знижена яскравість / мітка `[paused]`
  - Оновлюється прямо в tickerFn без Vue — 100% синхронно з рендером

---

## Step 6 — Skins Panel + Skin Composer ✅

**Видимий результат:** секція Skins вбудована в AnimationPanel — список скінів з вибором, Skin Composer для комбінування.

> **Примітка:** окремий `SkinsPanel.vue` не створювався — функціональність об'єднана з `AnimationPanel.vue` для компактності UI.

### Реалізовано

- [x] Секція **Skins** у `AnimationPanel.vue` (рядки 107–149):
  - Список скінів з radio-кнопками (single mode) або чекбоксами (Composer mode)
  - Кнопка **Composer** вмикає мультивибір; toggle автоматично переносить поточний скін у composerSkins
  - Кнопка **⎘ Copy name** з'являється при hover на рядку скіну
  - Клік по рядку → `emit('setSkins', [skin])` або toggle в composer
- [x] `adapter.setSkins(names)` — реалізовано в BasePixi7Adapter і Spine42Adapter (compose через `Skin.addSkin`, потім `setSlotsToSetupPose`)
- [x] `ViewerPage.vue` → `onSetSkins` → `stageRef.value?.setSkins(names)`

---

## Step 7 — Skeleton Inspector ✅

**Видимий результат:** вкладка "Inspector" поруч з Files і Animation — список кісток з live x/y/rotation і список активних attachments з колірними badge-ами типу.

### Реалізовано

- [x] `src/core/stores/useInspectorStore.ts` — Pinia store з `shallowRef<BoneTransform[]>` і `shallowRef<AttachmentInfo[]>`, методи `update()` / `clear()`
- [x] `src/components/panels/SkeletonPanel.vue` — два розділи:
  - **Bones** — flat list з depth-indent (parent-before-child порядок, один прохід); searchable; live x, y, rotation
  - **Attachments** — активні attachments: slotName + attachmentName + type badge (region/mesh/clipping/path, кольорові)
- [x] `PreviewStage.vue` — throttle в тікері: кожні 6 кадрів (`~10fps`) оновлює `inspectorStore.update(getBoneTransforms(), getActiveAttachments())`; `clear()` при unload та unmount
- [x] `ViewerPage.vue` — додана вкладка `Inspector`

---

## Step 8 — Events Panel ✅

**Видимий результат:** вкладка "Events" — live-лог подій з фільтром, таймлайном, статистикою та кнопкою копіювання назви.

### Реалізовано

- [x] `src/core/stores/useEventsStore.ts` — `log: ref<SpineEvent[]>` (max 500), `filter`, `paused`, `filteredLog` (фільтр + reversed), `eventStats` (sorted by count); `push()` / `clear()`
- [x] `src/components/panels/EventsPanel.vue`:
  - Контроли: filter input + Clear + ⏸/▶ Pause
  - **Timeline** — CSS-positioned тіки (кольорові за хешем назви), плейхед, hover tooltip (name + time + values), click → emit `seek`
  - **Log table** — newest first; колонки Tr / Time / Event / Int / Float / Str; кнопка `⎘` копіює назву в буфер
  - **Statistics** — кольорова крапка, назва, `⎘`, ×count; sorted by count desc
  - Hint якщо в скелеті немає визначених подій
- [x] `PreviewStage.vue` — `spineAdapter.onEvent(e => eventsStore.push(e))` після load; `eventsStore.clear()` при заміні скелету та unmount; `seekTo(track, time)` додано в `defineExpose`
- [x] `ViewerPage.vue` — вкладка Events, `onSeekTo` handler

## Step 8.5 — UX-покращення тулбару і вкладок ✅

### Реалізовано

- [x] **Скорочені мітки вкладок**: "Animation" → "Anim", "Inspector" → "Insp" — всі 4 вкладки влазять без переповнення
- [x] **▶ Play у тулбарі** — дублює логіку AnimationPanel; показує ⏸ / ▶ Resume / ▶ Play; мінімальна ширина 80px
- [x] **Disabled без активних треків** — кнопки ▶ Play, ← 1f, 1f → (і в AnimationPanel, і в тулбарі) відключені при `animationStore.tracks.length === 0`

---

## Step 9 — Atlas Inspector ✅

**Видимий результат:** вкладка "Atlas" — зображення атласу з SVG overlay регіонів; hover tooltip; список регіонів; статистика використання; zoom/pan.

### Реалізовано

- [x] `src/core/utils/atlasTextParser.ts` — парсер Spine atlas text format (3.x: xy/size/orig/offset; 4.x: bounds/offsets); підтримка мультисторінкових атласів
- [x] `src/core/stores/useAtlasStore.ts` — `pages: AtlasPage[]`, `imageUrls: Record<string, string>`, `seenRegions: Set<string>`; методи `load()`, `markSeen()`, `clear()`
- [x] `src/components/panels/AtlasInspector.vue`:
  - **Atlas viewer** — `<img>` + `<svg>` overlay (168px, overflow hidden); zoom (wheel) + pan (drag); `vector-effect: non-scaling-stroke` для чітких меж регіонів незалежно від масштабу
  - **Region rects** — зелені якщо seen, сірі якщо unseen; виділення при click в списку (blue); `Fit` кнопка → `resetZoom()`; клік у списку → `panToRegion()` центрує регіон
  - **Page tabs** — з'являються тільки при мультисторінковому атласі
  - **Hover bar** — назва, координати, розмір, теги `rot`/`used`/`unseen` при наведенні на SVG rect
  - **Stats row** — кількість регіонів, кількість seen, % утилізації (сума площ регіонів / площа атласу)
  - **Region list** — фільтр, алфавітне сортування, кольорова крапка (зелена/сіра), назва, розмір
- [x] `PreviewStage.vue` — `atlasStore.load(atlas, images)` після load скелету; `atlasStore.markSeen()` в throttle-тікері (~10fps) для region/mesh attachments; `atlasStore.clear()` при destroy та unmount
- [x] `ViewerPage.vue` — вкладка "Atlas" (`AtlasInspector`)

---

## Step 10 — Performance Profiler ✅

**Видимий результат:** вкладка "Perf" — FPS-графік (canvas, 120 барів), stats grid, список slow frames.

### Реалізовано

- [x] `src/core/types/IPixiApp.ts` — інтерфейс `RendererStats { drawCalls: number | null }` + метод `getStats()` в `IPixiApp`
- [x] `Pixi7App.ts` / `Pixi8App.ts` — реалізація `getStats()` (повертає `{ drawCalls: null }` — Pixi 7/8 не мають публічного лічильника draw calls)
- [x] `src/core/stores/useProfilerStore.ts`:
  - `fpsHistory: ref<number[]>` — ringbuffer 120 значень; `recordFrame(fps, ms)` — кожен кадр
  - `drawCalls`, `clippingCount`, `meshCount` — `updateStats()` кожні 6 кадрів (разом з inspector throttle)
  - `slowFrames: ref<FrameSnapshot[]>` — кадри де fps < 30, max 50; `clearSlowFrames()`
  - `clear()` при destroy адаптера та unmount
- [x] `src/components/panels/ProfilerPanel.vue`:
  - **FPS Graph** — canvas 2D, 64px, 120 барів; рефреш через rAF loop; горизонтальні мітки 30/60 fps; кольори: зелений ≥55, жовтий ≥30, червоний <30
  - **Stats grid** (3×2): FPS (кольоровий), Frame ms, Draw calls (або —), Clipping (жовтий/червоний при ≥1/≥3), Meshes, VRAM (з `atlasStore.pages`)
  - **Slow Frames log** — newest-first, max 50; показує fps, ms, clipping, mesh; кнопка Clear
- [x] `PreviewStage.vue` — `profilerStore.recordFrame()` кожен кадр; `profilerStore.updateStats()` кожні 6 кадрів; `profilerStore.clear()` при destroy і unmount
- [x] `ViewerPage.vue` — 6-та вкладка "Perf" → `<ProfilerPanel />`

---

## Step 11 — Complexity Analyzer

**Видимий результат:** таблиця метрик зі статусами OK/Warning/Critical та автоматичні рекомендації.

### Задачі

- [ ] `src/core/utils/complexityAnalyzer.ts` — чиста функція, не залежить від Pixi:
  ```typescript
  export function analyzeComplexity(adapter: ISpineAdapter, fileSet: FileSet): ComplexityReport {
    return {
      metrics: [
        { name: 'Bones', value: adapter.bones.length, threshold: { warn: 50, crit: 100 } },
        { name: 'Slots', value: adapter.slots.length, threshold: { warn: 60, crit: 120 } },
        { name: 'Clipping attachments', value: countClipping(adapter), threshold: { warn: 1, crit: 3 } },
        { name: 'Mesh attachments', value: countMesh(adapter), threshold: { warn: 20, crit: 50 } },
        { name: 'Total mesh vertices', value: totalVertices(adapter), threshold: { warn: 1000, crit: 3000 } },
        { name: 'Atlas size', value: atlasSize(fileSet), threshold: { warn: 1024*1024, crit: 4*1024*1024 } },
        { name: 'Atlas utilization', value: atlasUtil(adapter, fileSet), threshold: { warn: 0.5, crit: 0.3 }, inverse: true },
        { name: 'Skeleton JSON size', value: fileSet.skeleton.fileBody.length, threshold: { warn: 500_000, crit: 2_000_000 } },
      ],
      recommendations: buildRecommendations(adapter, fileSet),
    };
  }
  ```
- [ ] **Keyframe Analyzer**:
  - Для кожної анімації — кількість keyframes та density (kf/s)
  - Виявлення redundant keyframes (два сусідні з однаковим значенням)
  - Виявлення stepped curves де linear могло б зменшити дані
- [ ] `ComplexityPanel.vue`:так 
  - Таблиця метрик з кольоровими індикаторами 🟢🟡🔴
  - Секція "Recommendations" — автоматичні поради
  - Секція "Keyframes" — таблиця анімацій з kf-density

---

## Step 12 — Export Panel

**Видимий результат:** кнопки для скріншоту (PNG), GIF, спрайтшіту; прогрес-бар під час запису.

### Задачі

- [ ] `ExportPanel.vue`:
  - **Screenshot (PNG)** — `renderer.extract.canvas().toBlob(...)`, опція "прозорий фон"
  - **GIF** — `gif.js` у Web Worker, вибір тривалості та FPS
  - **Sprite Sheet** — N кадрів за анімацію в один PNG grid
  - **Pose JSON** — поточний стан кісток у JSON
- [ ] Web Worker для GIF щоб не блокувати UI
- [ ] Прогрес-бар для тривалих операцій

---

## Step 7.5 — Theme & Font Size ✅ (між Step 7 і Step 8)

**Видимий результат:** кнопка ⚙ у toolbar і на VersionPickerPage → попоувер Dark/Light + S/M/L.

### Реалізовано

- [x] `src/assets/themes.css` — CSS custom properties на `html`: `.theme-dark` / `.theme-light` (14 змінних `--c-*`) + `.font-sm` (16px) / `.font-md` (19px) / `.font-lg` (22px)
- [x] `src/core/stores/useSettingsStore.ts` — `theme: 'dark'|'light'`, `fontSize: 'sm'|'md'|'lg'`; localStorage persist (`sv-theme`, `sv-fontsize`); дефолт: dark + sm
- [x] `src/components/ui/SettingsPopover.vue` — `n-popover` trigger=click; кнопки Dark/Light + S/M/L
- [x] `App.vue` — `watchEffect` додає `theme-X` і `font-X` класи на `document.documentElement`; `naiveTheme = computed(...)` → `darkTheme` або `null`; `<n-config-provider :theme="naiveTheme">`
- [x] `main.ts` — `import './assets/themes.css'`
- [x] Всі компоненти (`ViewerPage`, `VersionPickerPage`, `LoaderPanel`, `AnimationPanel`, `SkeletonPanel`, `PreviewStage`) — hardcoded кольори замінені на CSS змінні

---

## Step 13 — Polish & UX

**Видимий результат:** resizable panels, keyboard shortcuts, URL sharing.

### Задачі

- [ ] `SplitLayout.vue` — перетягування роздільника між canvas і панелями
- [ ] `ResizablePanel.vue` — колапс окремих секцій
- [ ] **URL sharing** — encode `{pixiVersion, spineVersion}` у URL query
- [ ] **Keyboard shortcuts**:
  - `Space` — play/pause
  - `←` / `→` — shift animation ±1 frame
  - `R` — reset pose
  - `0–9` — вибір треку
- [ ] `localStorage` — persist: last zoom/pos, panel sizes, bg color
- [x] Тема dark/light + вибір шрифту — реалізовано в Step 7.5

---

## Залежності (повний список)

```json
{
  "dependencies": {
    "vue": "^3.x",
    "pinia": "^2.x",
    "naive-ui": "^2.x",
    "@vueuse/core": "^10.x",
    "pixi.js": "^7.4.3",
    "@pixi-spine/all-3.8": "^4.0.6",
    "@pixi-spine/all-4.0": "^4.0.6",
    "@pixi-spine/all-4.1": "^4.0.6",
    "@esotericsoftware/spine-pixi-v8": "^4.2.x",
    "gif.js": "^0.2.0",
    "uplot": "^1.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-vue": "^5.x",
    "typescript": "^5.x",
    "unplugin-auto-import": "^0.18.x",
    "unplugin-vue-components": "^0.27.x",
    "@types/node": "^20.x"
  }
}
```

> **Pixi 8** встановлюється через Vite alias у `vite.config.ts`:
> ```ts
> resolve: {
>   alias: {
>     'pixi7': path.resolve(__dirname, 'node_modules/pixi.js'),
>     'pixi8': path.resolve(__dirname, 'node_modules/pixi.js-v8'), // або окремий install
>   }
> }
> ```

---

## Ключові принципи

| Правило | Де порушення заборонено |
|---|---|
| `ISpineAdapter` — єдиний контракт | Компоненти не імпортують нічого з `adapters/` напряму |
| `buildImageResolver` — одна функція | Не дублювати логіку avif/png/jpg/webp завантаження |
| `FileSet` — єдина структура файлів | Всі адаптери приймають `FileSet`, не `File[]` |
| `useVersionStore` — єдине джерело вибраної версії | Не передавати версію через props по дереву |
| Адаптери — динамічний import (`await import(...)`) | Не завантажувати всі версії Pixi/Spine одночасно |
.
