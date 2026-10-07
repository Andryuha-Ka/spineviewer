# spine-viewer-pro-mcp

MCP server (stdio) for [Spine Viewer Pro](https://andryuha-ka.github.io/spineviewer/). It launches the installed
Google Chrome with its own profile, opens the hosted viewer and drives its `window.svp` API: load skeletons from
disk, play animations, pose and key bones, export edited skeletons to disk, and move skeletons to and from the
[keyframe.it](https://www.keyframe.it.com/) editor as files.

It never attaches to your own browser or tabs. The browser starts on the first tool call that needs a page
and is closed when the server exits.

Full guide (console API, all client configs, recipes, troubleshooting):
[API and MCP guide](https://github.com/Andryuha-Ka/spineviewer/blob/master/docs/api-and-mcp.md).

## Quick start

Requires Node.js ≥ 20 and Google Chrome. Your MCP client runs:

```bash
npx -y spine-viewer-pro-mcp --headed
```

`--headed` shows the Chrome window; `-y` skips npx's install prompt, which a stdio client cannot answer. The first
run downloads the package.

## Client configuration

Claude Code:

```bash
claude mcp add svp -- npx -y spine-viewer-pro-mcp --headed
```

Claude Desktop, Cursor, Gemini CLI, Windsurf and most other clients (`mcpServers` JSON):

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

VS Code / GitHub Copilot uses `"servers"` with `"type": "stdio"`; Codex CLI uses `[mcp_servers.svp]` in
`~/.codex/config.toml`. File locations and every client's snippet:
[guide → Install & connect](https://github.com/Andryuha-Ka/spineviewer/blob/master/docs/api-and-mcp.md#install--connect).

Then ask the agent to call `svp_session`: Chrome opens on the viewer and the client lists the `svp_*` tools.

## Options

Add them after `--headed`. The command-line option wins over the environment variable.

| Option | Environment | Default | Meaning |
|--------|-------------|---------|---------|
| `--url <url>` | `SVP_URL` | `https://andryuha-ka.github.io/spineviewer/` | Point it at another viewer address |
| `--headed` | `SVP_HEADED=1` | headless | Show the browser window |
| `--profile <dir>` | `SVP_PROFILE_DIR` | `~/.svp-mcp/profile` | Chrome profile folder |
| `--export-dir <dir>` | `SVP_EXPORT_DIR` | `~/.svp-mcp/exports` | Where exports are written |
| `--keyframe-url <url>` | `SVP_KEYFRAME_URL` | `https://www.keyframe.it.com/?editor=1` | keyframe.it editor address |
| — | `SVP_CHROME_PATH` | installed Chrome | Chrome binary to use instead of the installed channel |

URLs must be `https:`, or `http:` on `localhost` / `127.0.0.1`; any other value stops the server with an error naming the option.

## Tools

Units are the viewer API's: skeleton units, degrees, seconds, y up. `transform` = one or more of
`x, y, rotation, scaleX, scaleY, shearX, shearY`; `bones` = bone name → `transform`. Every tool rejects
properties it does not define. Calls run one at a time in arrival order.

| Tool | Does |
|------|------|
| `svp_open {url?}` | Open or reopen the viewer page (optionally at another allowed URL), return `info()` |
| `svp_session {}` / `svp_methods {}` | `info()` / `help()` |
| `svp_call {method, args?}` | Any `window.svp` method with an argument array |
| `svp_load {paths, mode?, activate?, discardEdits?}` | Files, folders (recursive) and zips from disk; `mode` `"add"` (default) or `"replace"`; `activate` defaults to `true` |
| `svp_reset {discardEdits?}` | Back to the picker |
| `svp_slots {}` / `svp_select_slot {slotId}` / `svp_skeleton {}` | Slots, activate one (id or name), active skeleton metadata |
| `svp_set_animation {animation, track?, loop?, queue?}` | Set, or with `queue: true` queue, an animation |
| `svp_clear_tracks {track?}` | Clear one track, or all |
| `svp_seek {time, track?}` / `svp_playback {playing?, speed?}` | Seek; play / pause / speed |
| `svp_track_options {track, loop?, mixDuration?, additive?, mixInterpolation?}` / `svp_tracks {}` | Track options; running tracks |
| `svp_set_skins {skins}` / `svp_get_skins {}` | Skins |
| `svp_get_bones {bones?}` | Local, applied, world and setup transforms plus overrides |
| `svp_apply_pose {bones}` / `svp_release_pose {bones?, properties?}` / `svp_overrides {}` | Live overrides |
| `svp_set_setup_pose {bones}` / `svp_apply_to_setup_pose {bones?}` | Setup pose edits |
| `svp_create_animation {name}` / `svp_build_animation {name, keys, replace?}` | New animation; many keys as one edit |
| `svp_get_keys {animation, bone?}` / `svp_key_bone {animation, bone, type, time, value, easing?}` | Read / write keys |
| `svp_key_pose {animation, bones?, time?}` | Key the live pose |
| `svp_delete_key {animation, bone, type, time}` / `svp_set_key_easing {animation, bone, type, time, easing}` | Key edits |
| `svp_revert {slotId?}` / `svp_undo {}` / `svp_redo {}` / `svp_edit_state {}` | Edit history |
| `svp_capture {}` | Current frame as an inline PNG |
| `svp_pose {}` | World pose JSON |
| `svp_screenshot {}` | Screenshot of the whole viewer page (inline) |
| `svp_export {format?, unpacked?}` | Export the active skeleton (zip by default, or JSON) into the export folder; `unpacked: true` also unpacks the zip into a sibling folder |
| `svp_keyframe_open {url?}` | Open keyframe.it in a second page and describe its API |
| `svp_keyframe_call {method, args?}` | Any `window.keyframe` method |
| `svp_keyframe_to_viewer {version?, binary?, mode?}` | keyframe.it Spine export (4.2 default, or 3.8) → zip on disk → loaded and activated in the viewer |
| `svp_viewer_to_keyframe {import?}` | Unpacked export of the active skeleton, then (default) a best-effort "Import Spine…" in keyframe.it |

Results: JSON as text plus `structuredContent` (arrays and scalars as `{ result }`); images as image content;
files as absolute paths plus `resource_link`s, readable with `resources/read` during the session. Exports never
overwrite: an existing name gets `-1`, `-2`, …. A rejected API call is a tool error with
`{ ok: false, code, error }`. When the viewer page was closed or crashed, the next call reopens it and its result
notes that the previous session and its edits were lost.

## keyframe.it round trip

- keyframe.it → viewer: `svp_keyframe_to_viewer` calls keyframe.it's `exportArtifact({ format: "spine", version, binary })`,
  writes the zip into the export folder and loads it. keyframe.it bakes motion into linear keys at the project fps.
  A 3.8 export loads on Pixi 7 / Spine 3.8 when the session is new or on Pixi 7; over a Pixi 8 (4.2) session pass
  `mode: "replace"`, otherwise it is listed as a version-mismatch error row.
- Viewer → keyframe.it: `svp_viewer_to_keyframe` writes `<name>.zip` plus the unpacked `<name>/` folder, then clicks
  "Import Spine…" and answers its file chooser; when that menu item cannot be driven it sets the files on
  keyframe.it's hidden Spine import input. Success is detected from keyframe.it's `sessionInfo()` or its import
  message; on failure the result has `imported: false`, the reason and a manual step. keyframe.it imports Spine
  3.8 / 4.x JSON with atlas and pages, not binary `.skel`.
- Spine 4.3 import result (live QA 2026-10-07): an edited 4.3 skeleton imports (`imported: true`); keyframe.it
  reports that bounding boxes are skipped and animated IK softness is unsupported.

Step-by-step round trip with `svp_keyframe_call` examples: [guide](https://github.com/Andryuha-Ka/spineviewer/blob/master/docs/api-and-mcp.md#round-trip-with-keyframeit-mcp).

Only keyframe.it's public `window.keyframe` API and its page UI are used. When keyframe.it cannot be reached,
keyframe tools fail with "keyframe.it is not available: …" and viewer tools keep working.

## Disclaimer

Spine is a registered trademark of Esoteric Software. This project is not affiliated with or endorsed by Esoteric
Software. keyframe.it is a third-party service. The Spine Runtimes are not bundled in `spine-viewer-pro-mcp`: the
package drives the hosted viewer in Chrome.

## Licence

MIT, see `LICENSE` (includes the MIT notice of keyframe-mcp, whose structure this package follows).

## For contributors

### Build from source

```bash
cd mcp
npm install
npm run build      # tsc → dist/
npm test           # node --test, fake browser objects; no Chrome needed
```

The package is not part of the viewer: the root lint, tests, build and CI ignore `mcp/`.

Against the local dev server (`npm run dev` in the repository root), with `<repo>` the absolute path of the clone:

```bash
claude mcp add svp -- node <repo>/mcp/dist/server.js --url http://localhost:5173/spineviewer/ --headed
```

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

Driving your own browser tab through the PixiJS Devtool Pro extension instead:
[guide → For contributors](https://github.com/Andryuha-Ka/spineviewer/blob/master/docs/api-and-mcp.md#advanced-pixijs-devtool-pro).

### Large-file transport (design D11)

`svp_load` and `svp_keyframe_to_viewer` hand files on disk to `window.svp.load` through variant **B**: the server adds a
hidden `<input type=file data-svp-api>` to the viewer page itself, sets the disk paths on it with Playwright
`setInputFiles` (Chrome reads the files directly), and the page reads them as data URLs and calls `svp.load`.
The viewer needs no change for this.

Files from a folder carry `path`, their directory relative to the folder's parent with forward slashes
(`comp1/FortuneLuck`), so same-named files in sibling folders stay apart; files passed one by one carry none.

Variant **A** (every file as `{ name, text }` or `{ name, base64 }` through `page.evaluate`) is kept only in the
benchmark script. Criterion: keep A unless it fails or is more than 2× slower than B on a ≈ 50 MB set. Measure with:

```bash
node scripts/bench-transport.mjs http://localhost:5173/spineviewer/ <folder or files of ~50 MB> --runs 3
```

Measured (task 8.9, local dev server, headless Chrome):

| Set | A | B |
|-----|---|---|
| 50 MB | 7.13 s | 5.98 s |
| 37 MB, 43 files | 5.90 s | 4.15 s |
| 80 MB | page crashes ("Target page, context or browser has been closed") | 10.6 s |

A fails at ≈ 80 MB, so B is the only transport.
