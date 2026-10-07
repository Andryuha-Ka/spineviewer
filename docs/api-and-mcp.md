# Spine Viewer Pro — API and MCP guide

How to drive Spine Viewer Pro from the DevTools console, from scripts and from AI agents. Describes viewer API
**1.1.0** (`window.svp.version`) and the `spine-viewer-pro-mcp` MCP server (40 API methods, 42 MCP tools).

- [Two ways in](#two-ways-in)
- [Console quick start](#console-quick-start)
- [Units and editing semantics](#units-and-editing-semantics)
- [Errors](#errors)
- [`window.svp` reference](#windowsvp-reference)
- [Install & connect](#install--connect)
- [MCP server tools](#mcp-server-tools)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [For contributors](#for-contributors)

MCP package page: [`mcp/README.md`](../mcp/README.md). Viewer features: [`README.md`](../README.md).

---

## Two ways in

| Route | Runs in | Files | Use when |
|-------|---------|-------|----------|
| DevTools console | Your tab of the [hosted viewer](https://andryuha-ka.github.io/spineviewer/) — nothing to install | Through the page (`svp.load` with text / base64) | Trying things by hand, one-off scripts |
| MCP server `spine-viewer-pro-mcp` | Its own Chrome with its own profile, launched by the server (`npx -y spine-viewer-pro-mcp`) | Read from and written to disk (`svp_load`, `svp_export`, `~/.svp-mcp/exports`) | An AI agent should load, edit and export skeletons, or round-trip through keyframe.it |

The MCP server never attaches to your browser or tabs.

---

## Console quick start

Works on the hosted viewer — nothing to install. Open <https://andryuha-ka.github.io/spineviewer/>, load your Spine
files (or a `.zip`), then press F12 → Console. Every method returns a Promise; top-level `await` works in
the console.

```js
await svp.info()       // { apiVersion, appVersion, page, runtime, slotCount, activeSlotId }
console.table(await svp.help())   // every method with args, returns, description

const sk = await svp.getSkeleton()
sk.bones.map(b => b.name)
sk.animations          // [{ name, duration }]

await svp.setAnimation({ animation: sk.animations[0].name, loop: true })
```

Hold a bone, then let it go:

```js
await svp.setBoneOverride({ bone: 'head', rotation: 20 })        // one bone
await svp.applyPose({ bones: { head: { rotation: 20 }, root: { x: 50 } } })   // several, all or none
await svp.releaseOverride({ bones: ['head'] })                     // or releaseOverride() for every bone
```

Make an edit permanent, key it, undo, export:

```js
await svp.applyOverridesToSetupPose()      // held overrides → setup pose, overrides released

await svp.createAnimation({ name: 'nod' })
await svp.setKey({ animation: 'nod', bone: 'head', type: 'rotate', time: 0, value: { rotation: 0 } })
await svp.setKey({ animation: 'nod', bone: 'head', type: 'rotate', time: 0.5, value: { rotation: 15 } })
await svp.setKeyEasing({ animation: 'nod', bone: 'head', type: 'rotate', time: 0, easing: [0.25, 0, 0.75, 1] })

await svp.undo()                           // one data edit back; svp.redo() re-applies it

const { artifact, warnings } = await svp.exportSkeleton({ format: 'zip' })
const a = document.createElement('a')
a.href = artifact.dataUrl
a.download = artifact.name
a.click()
```

Replace `head` / `root` with bone names from `getSkeleton()`.

---

## Units and editing semantics

- **Units**: skeleton units, degrees counter-clockwise, seconds, **y up**. Bone values are local to the parent bone.
  Tracks are integers 0–11, playback speed 0–3.
- **Transform properties**: `x`, `y`, `rotation`, `scaleX`, `scaleY`, `shearX`, `shearY`. A partial transform
  needs at least one of them.
- **Overrides are live**: `setBoneOverride` / `applyPose` hold **absolute local values** that win over every
  animation on every frame, also while paused. They are not data: they never reach an export, and they are lost on
  page reload. A new override on a bone merges into the one it already has.
- **Setup pose edits are data**: `setSetupPose` writes explicit values, `applyOverridesToSetupPose` writes the held
  overrides (or, for a named bone without one, its live unconstrained pose) and releases them. Keys stay relative to
  the setup pose, so animations move with it.
- **Keys are offsets from the setup pose**: a `rotate` key `{ rotation: 15 }` means setup rotation + 15°;
  `translate` / `shear` keys are added to setup; **scale keys are factors** (`{ scaleX: 2 }` doubles the setup scale).
  `keyCurrentPose` converts the live pose for you (value − setup, scale value ÷ setup).
- **Key types and values**: `rotate` → `{ rotation }`, `translate` → `{ x, y }`, `scale` → `{ scaleX, scaleY }`,
  `shear` → `{ shearX, shearY }`; separate-axis types `translatex`, `translatey`, `scalex`, `scaley`, `shearx`,
  `sheary` take one field (Spine 4.0+ only). A new two-channel key needs both fields; an update may give one.
- **Easing** is the curve from a key to the next one: `'linear'` (default), `'stepped'` or a bezier
  `[cx1, cy1, cx2, cy2]` with `cx1` and `cx2` in 0–1. Setting a key at an existing time (within 0.001 s) updates it
  and keeps its easing unless one is given.
- **One edit, one undo step**: every data edit (setup pose, key, animation, `buildAnimation` with any number of keys,
  revert) is one step of the undo history (20 steps per skeleton).
- **Unsaved work**: data edits and held overrides count as unsaved until `exportSkeleton`. `load` with
  `mode: 'replace'` and `reset` refuse with `UNSAVED_EDITS` unless `discardEdits: true`.
- **One at a time**: calls are queued and run in arrival order; a call starts after all earlier ones settled.
- **Where**: `info` and `help` work on every page; `load` and `reset` on the picker and the viewer; everything else
  needs the viewer page, most of it an active skeleton.

---

## Errors

Every rejection is an `SvpError` (`name: 'SvpError'`) with a `code`, a message that starts with `"<code>: "` (so the
code survives serialisation) and sometimes `details` (for `buildAnimation`: `{ index }` of the bad key).

| Code | Meaning |
|------|---------|
| `NOT_IN_VIEWER` | The method needs another page (`"<method>() needs the viewer page"`, or the compare page for `load` / `reset`) |
| `NO_SKELETON` | No active skeleton |
| `NOT_FOUND` | Unknown slot, bone, animation, skin, or no animation on the track |
| `INVALID_ARGUMENT` | Wrong argument type, range or shape; the message names the field |
| `INVALID_STATE` | Stage not ready, load timeout, another edit in progress, nothing to undo, animation not playing |
| `UNSAVED_EDITS` | `"Unsaved work would be lost: <slot> (edits and overrides); pass discardEdits: true"` |
| `LOAD_FAILED` | No valid Spine set, unknown or unsupported version, runtime load error |
| `EXPORT_FAILED` | Capture or export failed |
| `UNSUPPORTED` | Feature missing in this Spine version (4.3-only track options, split timelines on 3.8) |

```js
try {
  await svp.seek({ time: 1 })
} catch (e) {
  console.log(e.code, e.message)   // e.g. "NOT_FOUND", "NOT_FOUND: No animation on track 0"
}
```

Over MCP a rejected call is a tool error with `{ ok: false, code, error }`.

---

## `window.svp` reference

Arguments and results as `svp.help()` prints them. `?` marks an optional field.

### Session (7)

| Method | Arguments | Result |
|--------|-----------|--------|
| `info()` | — | `{ apiVersion, appVersion, page, runtime: { pixi, spine } \| null, slotCount, activeSlotId }` |
| `help()` | — | `[{ name, args, returns, description }]` |
| `load(files, options?)` | `files: [{ name, text } \| { name, base64 }]` (each with optional `path`, a relative directory with forward slashes), `{ mode?: 'add' \| 'replace', activate?, discardEdits? }` | `{ slots: [{ id, name, spineVersion, format, valid, errors }], ignored }` |
| `reset(options?)` | `{ discardEdits? }` | `undefined` |
| `listSlots()` | — | `[{ id, name, spineVersion, format, valid, errors, active, pinned, parentId, edited, unsaved }]` |
| `selectSlot(idOrName)` | slot id or name | slot record, once loaded |
| `getSkeleton()` | — | `{ slotId, name, spineVersion, format, bones: [{ name, parent }], slots: [{ name, bone, blend }], animations: [{ name, duration }], skins, events, edited, unsaved }` |

`load` on the picker opens the viewer. On the viewer `mode` defaults to `'add'`; `activate` defaults to `false`
(the MCP `svp_load` defaults it to `true`). Zips load like folders; `base64` may be a `data:` URL.

### Playback & skins (12)

| Method | Arguments | Result |
|--------|-----------|--------|
| `setAnimation(o)` | `{ track?: 0–11, animation, loop?: true }` | `undefined` |
| `addAnimation(o)` | `{ track?: 0–11, animation, loop?: true }` (queues) | `undefined` |
| `clearTrack(o?)` | `{ track?: 0–11 }` | `undefined` |
| `clearTracks()` | — (setup pose) | `undefined` |
| `seek(o)` | `{ track?: 0–11, time }` | `undefined` |
| `play()` / `pause()` | — | `undefined` |
| `setSpeed(speed)` | `0–3` | `undefined` |
| `setTrackOptions(o)` | `{ track?: 0–11, loop?, mixDuration?, additive? (4.3), mixInterpolation? (4.3) }` | `undefined` |
| `getTracks()` | — | `[{ track, animation, time, duration, loop, timeScale, mixDuration, queue }]` |
| `setSkins(names)` | `string[]`, one skin or several composed | `undefined` |
| `getSkins()` | — | `{ available, applied }` |

### Bones (5)

| Method | Arguments | Result |
|--------|-----------|--------|
| `getBones(names?)` | `string[]`, all bones when omitted | `[{ name, parent, local, applied, world, setup, override, effect }]` |
| `setBoneOverride(o)` | `{ bone, x?, y?, rotation?, scaleX?, scaleY?, shearX?, shearY? }` | override map `{ [bone]: partial transform }` |
| `applyPose(o)` | `{ bones: { [bone]: partial transform } }` (all or none) | override map |
| `releaseOverride(o?)` | `{ bones?: string[], properties?: string[] }` (all when omitted) | override map |
| `getOverrides()` | — | override map |

`local` is the bone's local pose this frame, `applied` the pose after constraints, `world` the world transform,
`setup` the setup pose, `override` the held values or `null`.

`effect` (since API 1.1.0) tells whether editing the bone changes anything drawn right now:
`{ visible, reason, keyed, constraints }`. `visible: false` comes with a `reason`: `'inactive'` (the bone is not in
the applied skins), `'hidden'` (its attachments are hidden or transparent in the current frame) or
`'no-attachments'` (nothing drawn hangs on the bone or its children); `reason` is `null` when visible. `keyed` is
`true` when a playing animation keys the bone; `constraints` lists the IK / transform / path constraints (4.3: also
sliders) that drive it — their constrained properties ignore local edits. The bone records returned by
`setSetupPose` and `applyOverridesToSetupPose` carry `effect` too; `applyPose` and `releaseOverride` return the
override map without it. Nothing is blocked: an override on a dimmed bone is still held.

### Editing (13)

| Method | Arguments | Result |
|--------|-----------|--------|
| `setSetupPose(o)` | `{ bones: { [bone]: partial transform } }` | bone records |
| `applyOverridesToSetupPose(o?)` | `{ bones?: string[] }` | bone records |
| `createAnimation(o)` | `{ name }` | `{ name, duration }` |
| `getKeys(o)` | `{ animation, bone? }` | `[{ bone, type, keys: [{ time, value, easing }] }]` |
| `setKey(o)` | `{ animation, bone, type, time, value, easing? }` | `{ bone, type, keys }` |
| `deleteKey(o)` | `{ animation, bone, type, time }` | `{ bone, type, keys }` |
| `setKeyEasing(o)` | `{ animation, bone, type, time, easing }` | `{ bone, type, keys }` |
| `keyCurrentPose(o)` | `{ animation, bones?, time? }` | `[{ bone, type, keys }]` |
| `buildAnimation(o)` | `{ name, keys: [{ bone, type, time, value, easing? }], replace? }` | `{ name, duration, timelines }` |
| `undo()` / `redo()` | — | edit state |
| `getEditState()` | — | `{ edited, unsaved, overrides, warnings, canUndo, canRedo }` |
| `revertToSource(o?)` | `{ slotId? }` (active skeleton by default; undoable, keeps overrides) | `undefined` |

`keyCurrentPose` keys every overridden bone (or the given bones; a given bone without an override keys all its
properties) at `time`, or at the track time of the playing animation, then releases those overrides.
`buildAnimation` creates the animation when missing and applies up to 10 000 keys as one edit; `replace: true`
drops its bone timelines first.

### Export (3)

| Method | Arguments | Result |
|--------|-----------|--------|
| `capturePng()` | — (Export tab scale and background) | `{ artifact: { name, mimeType, dataUrl } }` |
| `getPose()` | — | `{ bones: [{ name, x, y, rotation, scaleX, scaleY, shearY }], timestamp }` (world pose) |
| `exportSkeleton(o)` | `{ format: 'zip' \| 'json' }` | `{ artifact: { name, mimeType, dataUrl }, warnings }` |

`exportSkeleton` counts as saving. The zip holds Spine JSON plus atlas and pages; binary `.skel` skeletons are
converted to JSON.

---

## Install & connect

The MCP server `spine-viewer-pro-mcp` is a stdio server on npm: your AI client starts it with
`npx -y spine-viewer-pro-mcp --headed`. It launches Google Chrome with its own profile, opens the
[hosted viewer](https://andryuha-ka.github.io/spineviewer/) and calls `window.svp` for every tool. `--headed` shows
that Chrome window (recommended: hidden tabs get no animation frames); `-y` skips npx's install prompt, which a stdio
client cannot answer. Client formats checked on 2026-10-07 against the linked docs.

### Prerequisites

- Node.js ≥ 20
- Google Chrome

The first run downloads the package and may take a while.

### Claude Code

Source: <https://code.claude.com/docs/en/mcp>. Syntax `claude mcp add [options] <name> -- <command> [args...]`;
`--` separates Claude's options from the server command. Scopes: `local` (default, stored in `~/.claude.json`, this
project only), `project` (`.mcp.json` in the project root, shared via version control), `user` (`~/.claude.json`,
all projects).

```bash
claude mcp add svp -- npx -y spine-viewer-pro-mcp --headed
```

```bash
claude mcp add --scope user svp -- npx -y spine-viewer-pro-mcp --headed
```

Check with `claude mcp list`.

### Claude Desktop

Source: <https://modelcontextprotocol.io/docs/develop/connect-local-servers>. Settings → Developer → Edit Config
opens `claude_desktop_config.json`: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows
`%APPDATA%\Claude\claude_desktop_config.json`. Fully quit and restart Claude Desktop after saving.

```json
{
  "mcpServers": {
    "svp": {
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}
```

### Cursor

Source: <https://cursor.com/docs/context/mcp>. Project `.cursor/mcp.json` or global `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "svp": {
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}
```

### VS Code / GitHub Copilot

Sources: <https://code.visualstudio.com/docs/copilot/customization/mcp-servers>,
<https://code.visualstudio.com/docs/copilot/reference/mcp-configuration>. Workspace `.vscode/mcp.json`; user profile
via the command "MCP: Open User Configuration". The top-level key is `servers` (not `mcpServers`), and `type` is
required (`"stdio"` for local servers).

```json
{
  "servers": {
    "svp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}
```

### OpenAI Codex CLI

Source: <https://developers.openai.com/codex/mcp>. Global `~/.codex/config.toml`, or project `.codex/config.toml`
for trusted projects; shared by Codex CLI, the IDE extension and the desktop app. `startup_timeout_sec = 60` covers
the first-run download plus the Chrome launch (the docs' example uses 10).

```toml
[mcp_servers.svp]
command = "npx"
args = ["-y", "spine-viewer-pro-mcp", "--headed"]
startup_timeout_sec = 60
```

Or from the command line:

```bash
codex mcp add svp -- npx -y spine-viewer-pro-mcp --headed
```

### Gemini CLI

Source: <https://geminicli.com/docs/tools/mcp-server/>. User `~/.gemini/settings.json`, project
`.gemini/settings.json`.

```json
{
  "mcpServers": {
    "svp": {
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}
```

Or from the command line (`-s user|project` picks the file):

```bash
gemini mcp add svp npx -y spine-viewer-pro-mcp --headed
```

### Windsurf / Devin Desktop

Sources: <https://docs.windsurf.com/windsurf/cascade/mcp> (now redirects to
<https://docs.devin.ai/desktop/cascade/mcp>). Windsurf: `~/.codeium/windsurf/mcp_config.json`; Devin Desktop:
`~/.config/devin/mcp_config.json` (macOS / Linux) or `%APPDATA%\devin\mcp_config.json` (Windows). Either way the
Cascade panel "…" → **Open MCP config file** opens the right one.

```json
{
  "mcpServers": {
    "svp": {
      "command": "npx",
      "args": ["-y", "spine-viewer-pro-mcp", "--headed"]
    }
  }
}
```

### Other stdio clients

Any client that launches a stdio server: command `npx`, args `["-y", "spine-viewer-pro-mcp", "--headed"]`. Most
accept the `mcpServers` JSON above.

### Verify

1. Restart or reload the client.
2. Ask the agent to "call `svp_session`". A Chrome window opens on the viewer, and the client lists the `svp_*`
   tools. In Claude Code, `claude mcp list` shows `svp`. The first run downloads the package and may take a while.
3. If it fails, see [Troubleshooting](#troubleshooting).

### Options

Add them after `--headed` in the args. The command-line option wins over the environment variable.

| Option | Environment | Default | Meaning |
|--------|-------------|---------|---------|
| `--url <url>` | `SVP_URL` | `https://andryuha-ka.github.io/spineviewer/` | Point it at another viewer address |
| `--headed` | `SVP_HEADED=1` | headless | Show the browser window |
| `--profile <dir>` | `SVP_PROFILE_DIR` | `~/.svp-mcp/profile` | Chrome profile folder |
| `--export-dir <dir>` | `SVP_EXPORT_DIR` | `~/.svp-mcp/exports` | Where exports are written |
| `--keyframe-url <url>` | `SVP_KEYFRAME_URL` | `https://www.keyframe.it.com/?editor=1` | keyframe.it editor address |

URLs must be `https:`, or `http:` on `localhost` / `127.0.0.1`.

---

## MCP server tools

42 tools. Every tool rejects properties it does not define; calls run one at a time in arrival order. `transform` = one or
more of `x, y, rotation, scaleX, scaleY, shearX, shearY`; `bones` = bone name → `transform`.

**Session (9)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_open` | `{ url? }` | Open (or reopen at another allowed URL) the viewer page; returns `info()` plus `url` and `headless`. Optional: other tools open it themselves |
| `svp_session` | `{}` | `info()` |
| `svp_methods` | `{}` | `help()` |
| `svp_call` | `{ method, args? }` | Any `window.svp` method with positional arguments |
| `svp_load` | `{ paths, mode?, activate?, discardEdits? }` | Files, folders (recursive) and zips from disk; `mode` `'add'` (default) or `'replace'`; `activate` defaults to `true`; 200 MB limit per call |
| `svp_reset` | `{ discardEdits? }` | Back to the version picker |
| `svp_slots` | `{}` | `listSlots()` |
| `svp_select_slot` | `{ slotId }` | Activate a slot by id or name |
| `svp_skeleton` | `{}` | `getSkeleton()` |

**Playback & skins (8)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_set_animation` | `{ animation, track?, loop?, queue? }` | `setAnimation`, or `addAnimation` with `queue: true` |
| `svp_clear_tracks` | `{ track? }` | One track, or all (setup pose) |
| `svp_seek` | `{ time, track? }` | Move a track to a time |
| `svp_playback` | `{ playing?, speed? }` | Play / pause and / or speed 0–3 (needs one of them) |
| `svp_track_options` | `{ track, loop?, mixDuration?, additive?, mixInterpolation? }` | Track loop, crossfade, 4.3 mix options |
| `svp_tracks` | `{}` | Running tracks |
| `svp_set_skins` | `{ skins }` | Apply one skin or compose several |
| `svp_get_skins` | `{}` | Available and applied skins |

**Bones (4)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_get_bones` | `{ bones? }` | Local, applied, world and setup transforms plus overrides |
| `svp_apply_pose` | `{ bones }` | Hold live overrides (all or none) |
| `svp_release_pose` | `{ bones?, properties? }` | Release overrides; all when omitted |
| `svp_overrides` | `{}` | Held overrides |

**Editing (13)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_set_setup_pose` | `{ bones }` | Write values into the setup pose |
| `svp_apply_to_setup_pose` | `{ bones? }` | Bake overrides (or the live pose of the given bones) into the setup pose |
| `svp_create_animation` | `{ name }` | Empty animation |
| `svp_build_animation` | `{ name, keys, replace? }` | Many keys as one edit (1–10 000), creates the animation when missing |
| `svp_get_keys` | `{ animation, bone? }` | Bone timelines |
| `svp_key_bone` | `{ animation, bone, type, time, value, easing? }` | `setKey` |
| `svp_key_pose` | `{ animation, bones?, time? }` | `keyCurrentPose` |
| `svp_delete_key` | `{ animation, bone, type, time }` | Delete a key |
| `svp_set_key_easing` | `{ animation, bone, type, time, easing }` | Change a key's easing |
| `svp_revert` | `{ slotId? }` | Revert to source data |
| `svp_undo` / `svp_redo` | `{}` | Undo / redo a data edit |
| `svp_edit_state` | `{}` | `getEditState()` |

**Output (4)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_capture` | `{}` | Current frame as an inline PNG |
| `svp_pose` | `{}` | World pose JSON |
| `svp_screenshot` | `{}` | Screenshot of the whole viewer page |
| `svp_export` | `{ format?, unpacked? }` | Active skeleton to the export folder: zip (default) or `'json'`; `unpacked: true` also unpacks the zip into a sibling folder |

**keyframe.it (4)**

| Tool | Arguments | Does |
|------|-----------|------|
| `svp_keyframe_open` | `{ url? }` | Open keyframe.it in a second page, wait for `window.keyframe`, describe its API |
| `svp_keyframe_call` | `{ method, args? }` | Any `window.keyframe` method with positional arguments |
| `svp_keyframe_to_viewer` | `{ version?: '4.2' \| '3.8', binary?, mode?: 'add' \| 'replace' }` | keyframe.it Spine export → zip on disk → loaded and activated in the viewer |
| `svp_viewer_to_keyframe` | `{ import? }` | Unpacked zip export of the active skeleton, then (default) "Import Spine…" in keyframe.it |

### Results and files on disk

- Results are JSON as text plus `structuredContent` (arrays and scalars as `{ result }`); `svp_capture` and
  `svp_screenshot` return images.
- `svp_load` reads paths on the machine running the server (absolute, or relative to its working directory).
  Folders carry their relative directory, so same-named files in sibling folders stay apart.
- `svp_export`, `svp_viewer_to_keyframe` and `svp_keyframe_to_viewer` write into the export folder
  (`~/.svp-mcp/exports` by default) and return absolute `paths` plus `resource_link`s readable with
  `resources/read` during the session. Exports never overwrite: an existing name gets `-1`, `-2`, ….
- When the viewer page was closed or crashed, the next call reopens it and its result carries the note "The viewer
  page was closed or crashed and has been reopened: the previous session and its edits were lost."

Example tool calls (arguments as the agent sends them):

```json
{ "paths": ["D:/art/hero"], "mode": "replace", "discardEdits": true }
```

```json
{ "animation": "walk", "loop": true }
```

```json
{ "format": "zip", "unpacked": true }
```

---

## Recipes

### Explode a skeleton into parts

Spread the direct children of the root bone over a circle as live overrides, look, then put them back. Nothing is
written into the skeleton data.

```js
const bones = await svp.getBones()
const root = bones.find(b => b.parent === null).name
const parts = bones.filter(b => b.parent === root)
const radius = 300
const pose = {}
parts.forEach((b, i) => {
  const angle = (2 * Math.PI * i) / parts.length
  pose[b.name] = {
    x: b.setup.x + radius * Math.cos(angle),
    y: b.setup.y + radius * Math.sin(angle),
  }
})
await svp.applyPose({ bones: pose })

// back to the animation
await svp.releaseOverride({ bones: Object.keys(pose) })

// bones that draw nothing in the current frame, and why
const idle = (await svp.getBones()).filter(b => !b.effect.visible).map(b => `${b.name}: ${b.effect.reason}`)
```

To go one level deeper, filter on `parts.map(p => p.name).includes(b.parent)` instead. To keep the exploded layout,
call `await svp.applyOverridesToSetupPose()` instead of releasing.

Over MCP: `svp_get_bones {}` → compute the map → `svp_apply_pose { "bones": { … } }` → `svp_release_pose {}`.

### Bake a pose into the setup pose

Held overrides become the setup pose and are released:

```js
await svp.applyPose({ bones: { head: { rotation: 10 }, arm_l: { rotation: -30 } } })
await svp.applyOverridesToSetupPose()          // every overridden bone
```

A bone named without an override bakes its **live** (unconstrained) pose, so an animation frame can become the
setup pose:

```js
await svp.setAnimation({ animation: 'idle' })
await svp.pause()
await svp.seek({ time: 0.5 })
await svp.applyOverridesToSetupPose({ bones: ['head', 'arm_l'] })
```

Explicit values without overrides: `await svp.setSetupPose({ bones: { head: { rotation: 10 } } })`. Each call is one
undo step; existing animation keys stay offsets from the new setup pose.

### Key an animation

Key by key, with easing:

```js
await svp.createAnimation({ name: 'wave' })
const k = { animation: 'wave', bone: 'arm_l', type: 'rotate' }
await svp.setKey({ ...k, time: 0, value: { rotation: 0 }, easing: [0.25, 0, 0.75, 1] })
await svp.setKey({ ...k, time: 0.5, value: { rotation: 45 }, easing: 'linear' })
await svp.setKey({ ...k, time: 1, value: { rotation: 0 } })
await svp.setKeyEasing({ ...k, time: 0.5, easing: 'stepped' })
await svp.setAnimation({ animation: 'wave' })
```

Pose by hand, then key the live pose (values are converted to offsets / factors for you):

```js
await svp.setAnimation({ animation: 'wave' })
await svp.pause()
await svp.seek({ time: 0.25 })
await svp.setBoneOverride({ bone: 'arm_l', rotation: 80 })
await svp.keyCurrentPose({ animation: 'wave', time: 0.25 })   // keys arm_l rotate, releases the override
```

Many keys as one undo step (creates the animation when missing):

```js
const keys = []
for (let i = 0; i <= 8; i++) {
  const t = i / 8
  keys.push({ bone: 'head', type: 'rotate', time: t, value: { rotation: 10 * Math.sin(t * 2 * Math.PI) } })
  keys.push({ bone: 'head', type: 'scale', time: t, value: { scaleX: 1, scaleY: 1 + 0.05 * Math.sin(t * 4 * Math.PI) } })
}
await svp.buildAnimation({ name: 'bob', keys, replace: true })
```

Check the result with `await svp.getKeys({ animation: 'bob', bone: 'head' })`; `await svp.undo()` removes the whole
build.

### Round trip with keyframe.it (MCP)

[keyframe.it](https://www.keyframe.it.com/) is a browser animation editor with a `window.keyframe` API. The MCP
server opens it in a second page of its Chrome and moves skeletons as files through the export folder.

1. **Viewer → keyframe.it**: `svp_viewer_to_keyframe {}` writes `<name>.zip` plus the unpacked `<name>/` folder and
   imports the JSON, atlas and pages through keyframe.it's "Import Spine…". The result has `imported: true`, or
   `imported: false` with the `reason` and a `manualStep` (Menu → Import Spine…, select every file in the folder).
2. **Edit in keyframe.it**: `svp_keyframe_call { method, args }` calls `window.keyframe` methods with positional
   arguments. The methods belong to keyframe.it and can change; `{ "method": "help" }` lists the current ones.
   Inspect:

   ```json
   { "method": "describe" }
   ```

   ```json
   { "method": "getBone", "args": ["glowSphere"] }
   ```

   Edit the rig in setup mode — `poseBone(name, { x?, y?, rotation?, scaleX?, scaleY? })` changes the setup pose,
   `applyPose({ [bone]: patch, … })` sets many bones as one undo step:

   ```json
   { "method": "setMode", "args": ["setup"] }
   ```

   ```json
   { "method": "poseBone", "args": ["glowSphere", { "scaleX": 1.6, "scaleY": 1.6 }] }
   ```

   ```json
   { "method": "applyPose", "args": [{ "glowSphere": { "rotation": 15 }, "root": { "y": 20 } }] }
   ```

   Key in animate mode — `poseBone` now keys the pose at the playhead, `applyPose(bones, { time })` moves the
   playhead first, `keyBone(name)` keys the bone's current pose:

   ```json
   { "method": "setMode", "args": ["animate"] }
   ```

   ```json
   { "method": "applyPose", "args": [{ "glowSphere": { "scaleX": 1.2, "scaleY": 1.2 } }, { "time": 0.5 }] }
   ```

   ```json
   { "method": "setPlayhead", "args": [1] }
   ```

   ```json
   { "method": "keyBone", "args": ["glowSphere"] }
   ```

   `{ "method": "getState" }` returns the whole document (bones, slots, animations) to check the result.
3. **keyframe.it → viewer**: `svp_keyframe_to_viewer` exports a Spine zip, writes it to the export folder and loads
   it into the viewer as the active skeleton:

   ```json
   { "version": "4.2" }
   ```

   ```json
   { "version": "4.2", "binary": true }
   ```

   ```json
   { "version": "3.8", "mode": "replace" }
   ```

Notes:

- keyframe.it works **y-down** internally; its importer and exporter flip the signs, so values you give to
  `window.keyframe` methods are in its convention, while the files on both sides are Spine-native y-up.
- keyframe.it's exporter **bakes curves per frame** into linear keys at the project fps; bezier easing from the
  viewer comes back as dense linear keys.
- keyframe.it imports Spine **3.8 and 4.x JSON** with atlas and pages, not binary `.skel` (the viewer's export
  converts `.skel` to JSON). An edited **4.3** skeleton imports too; keyframe.it reports that bounding boxes are
  skipped and animated IK softness is unsupported.
- A **3.8** export loads on a new session or a Pixi 7 session; over a Pixi 8 (4.2) session pass
  **`mode: 'replace'`**, otherwise it is listed as a version-mismatch error row.
- Files land in the export folder, `~/.svp-mcp/exports` by default (`--export-dir`).
- When keyframe.it cannot be reached, keyframe tools fail with "keyframe.it is not available: …" and viewer tools
  keep working.

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `Google Chrome was not found; install Chrome or set its path` | The server uses the installed Google Chrome. Install it, or set `SVP_CHROME_PATH` to a Chrome / Chromium executable in the server's environment (most clients take an `env` object next to `args`) |
| `Unsupported viewer API version <x>; this server supports 1.x` | The viewer at `--url` has a different API major version than the server. Update the package (`npx -y spine-viewer-pro-mcp@latest`), or point `--url` at a matching viewer |
| `Viewer API not available at <url>` | The page did not load or has no `window.svp` within 30 s: check the network and the `--url` |
| `--url: use https:, or http: on localhost or 127.0.0.1 (got …)` | Only `https:` URLs, or `http:` on localhost, are allowed |
| The client reports a start-up timeout on the first run | npx is still downloading the package; retry, or raise the client's start-up timeout (Codex: `startup_timeout_sec`) |
| Animation does not advance, `seek` / `keyCurrentPose` / `getBones` see stale values | Hidden or background tabs get no animation frames. Keep the viewer tab visible, or run the server with `--headed` |
| `UNSAVED_EDITS: Unsaved work would be lost: …; pass discardEdits: true` | `load` with `mode: 'replace'` or `reset` would drop edits or held overrides. Export first, release overrides, or pass `discardEdits: true` |
| A browser "Leave site?" or "Unsaved work will be lost" prompt in your own tab | Same unsaved-work protection in the UI; the MCP server accepts the page's leave prompt on navigation itself |
| `NOT_IN_VIEWER: <method>() needs the viewer page` | Load a skeleton first (`svp.load` / `svp_load` opens the viewer), or leave the compare page |
| `INVALID_STATE: Animation is not playing; give a time` | `keyCurrentPose` without `time` needs the animation on a track; pass `time` |
| `UNSUPPORTED: additive and mixInterpolation need Spine 4.3` | Those track options exist only on the Pixi 8 + Spine 4.3 runtime |
| `keyframe.it is not available: …` | keyframe.it is unreachable or its API did not become ready; check `--keyframe-url` and the network |
| A result notes that the viewer page was reopened | The page was closed or crashed; the session and its edits are gone, load again |

---

## For contributors

Working on the viewer or the server from a clone of the repository.

### Build and run the server from source

Node.js ≥ 20 and Google Chrome, as for users.

```bash
cd mcp
npm install
npm run build      # → mcp/dist/server.js
npm test           # node --test, fake browser objects; no Chrome needed
```

Run it against the local dev server (`npm run dev` in the repository root serves `http://localhost:5173/spineviewer/`):

```bash
claude mcp add svp -- node <repo>/mcp/dist/server.js --url http://localhost:5173/spineviewer/ --headed
```

`<repo>` is the absolute path to your clone; on Windows use forward slashes (`D:/tools/spine_viewer_pro`) or doubled
backslashes in JSON / TOML. Other clients take the same `node` command and args in the shapes of
[Install & connect](#install--connect):

```json
{
  "mcpServers": {
    "svp": {
      "command": "node",
      "args": ["<repo>/mcp/dist/server.js", "--url", "http://localhost:5173/spineviewer/", "--headed"]
    }
  }
}
```

`SVP_CHROME_PATH` points the server at a Chrome / Chromium binary instead of the installed Chrome channel.

### Advanced: PixiJS Devtool Pro

The PixiJS Devtool Pro browser extension ships its own MCP server (`pixi-inspector-mcp`) that acts on a tab of
**your** browser. Since `window.svp` is a plain page global, an agent can drive the viewer you are looking at, with
the skeletons you loaded by hand. The extension is a developer build, loaded unpacked.

1. Load the PixiJS Devtool Pro extension **unpacked** at `chrome://extensions` (Developer mode → Load unpacked).
2. Switch its **MCP connector ON** in the extension popup.
3. Add `pixi-inspector-mcp` (published on npm) to the client:

   ```bash
   claude mcp add pixi-inspector -- npx -y pixi-inspector-mcp
   ```

   ```json
   {
     "mcpServers": {
       "pixi-inspector": {
         "command": "npx",
         "args": ["-y", "pixi-inspector-mcp"]
       }
     }
   }
   ```

   VS Code needs `"servers"` + `"type": "stdio"` here too; Codex uses:

   ```toml
   [mcp_servers.pixi-inspector]
   command = "npx"
   args = ["-y", "pixi-inspector-mcp"]
   ```

   **Windows + nvm**: bare `npx` can fail to resolve the bin. Install it globally and call it directly:

   ```bash
   npm i -g pixi-inspector-mcp
   claude mcp add pixi-inspector -- pixi-inspector-mcp
   ```

   or `"command": "pixi-inspector-mcp"` with no `args` in JSON configs.
4. Open the viewer, load your skeletons, and tick **"Use this tab for MCP"** in the extension popup (or the PixiJS
   Pro DevTools panel).
5. Ask the agent to evaluate JavaScript in that tab, for example `await window.svp.info()` or
   `await window.svp.getBones(['head'])`. Every `svp` method returns a Promise, so the evaluated expression must be
   awaited.

Notes:

- There are no files on disk in this route: `exportSkeleton` returns a `dataUrl` in the page; trigger a download in
  the page (see [Console quick start](#console-quick-start)) to save it.
- Keep the tab visible: background tabs get no animation frames.
- The extension's own tools (scene tree, Spine inspection) also work on the same tab; `window.svp` is the only way to
  make edits the viewer records (undo, unsaved state, export).
- `spine-viewer-pro-mcp` never attaches to your tabs; `pixi-inspector-mcp` never opens a browser of its own.
