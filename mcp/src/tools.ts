/**
 * @file tools.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import * as z from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { callApi } from './session.js'
import { toContent, type Runner } from './runner.js'

const PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const
const num = z.number()
const str = z.string().min(1)
const track = z.number().int().min(0).max(11)
const time = z.number().min(0)
const transform = z.strictObject(Object.fromEntries(PROPS.map(k => [k, num.optional()])) as Record<typeof PROPS[number], z.ZodOptional<z.ZodNumber>>)
  .refine(t => Object.values(t).some(v => v !== undefined), { message: `needs at least one of ${PROPS.join(', ')}` })
  .describe('Local transform: skeleton units, degrees, y up')
const bones = z.record(z.string(), transform).refine(b => Object.keys(b).length > 0, { message: 'needs at least one bone' })
  .describe('Bone name → transform')
const keyType = z.enum(['rotate', 'translate', 'scale', 'shear', 'translatex', 'translatey', 'scalex', 'scaley', 'shearx', 'sheary'])
const easing = z.union([z.enum(['linear', 'stepped']), z.tuple([num, num, num, num])]).describe('"linear", "stepped" or bezier [cx1, cy1, cx2, cy2]')
const keyValue = z.strictObject(Object.fromEntries(PROPS.map(k => [k, num.optional()])) as Record<typeof PROPS[number], z.ZodOptional<z.ZodNumber>>)
  .describe('{ rotation } | { x, y } | { scaleX, scaleY } | { shearX, shearY }, or one field for a separate-axis type')
const mode = z.enum(['add', 'replace'])
const strings = z.array(z.string())

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ToolDef {
  name: string
  description: string
  schema: z.ZodType<any>
  run(r: Runner, args: any): Promise<CallToolResult>
}

const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
const tool = (name: string, description: string, shape: z.ZodRawShape, run: ToolDef['run'], refine?: (s: z.ZodObject<any>) => z.ZodType<any>): ToolDef => {
  const obj = z.strictObject(shape)
  return { name, description, schema: refine ? refine(obj) : obj, run }
}
/** Tool passing its arguments object to one window.svp method. */
const passthrough = (name: string, description: string, method: string, shape: z.ZodRawShape = {}): ToolDef =>
  tool(name, description, shape, (r, a) => Object.keys(shape).length ? r.svp(method, strip(a)) : r.svp(method))

export const definitions: ToolDef[] = [
  tool('svp_open', 'Open (or reopen at another allowed URL) the viewer page in the server\'s Chrome and return info(). Optional: other tools open it themselves.',
    { url: str.optional() },
    async (r, a) => {
      const { page, notes } = await r.viewer(a.url)
      return toContent({ ...(await callApi(page, 'svp', 'info')) as object, url: r.session.viewerUrl, headless: !r.session.config.headed }, notes)
    }),
  passthrough('svp_session', 'Session info: API and app version, page, runtime, slot count, active slot.', 'info'),
  passthrough('svp_methods', 'List every window.svp method with arguments and result shape (help()).', 'help'),
  tool('svp_call', 'Call any window.svp method with positional arguments; read svp_methods first.',
    { method: str, args: z.array(z.unknown()).optional() },
    (r, a) => r.svp(a.method, ...(a.args ?? []))),
  tool('svp_load', 'Load Spine files, folders (recursive) and .zip archives from disk. mode "add" (default) adds to the session, "replace" starts a new one. The first new valid skeleton becomes active unless activate is false.',
    { paths: z.array(str).min(1), mode: mode.optional(), activate: z.boolean().default(true), discardEdits: z.boolean().optional() },
    (r, a) => r.load(a.paths, strip({ mode: a.mode, activate: a.activate, discardEdits: a.discardEdits }))),
  passthrough('svp_reset', 'Discard the session and return to the version picker (UNSAVED_EDITS unless discardEdits).', 'reset', { discardEdits: z.boolean().optional() }),
  passthrough('svp_slots', 'List skeleton slots: top-level in list order, then child spines.', 'listSlots'),
  tool('svp_select_slot', 'Make a skeleton active by slot id or name; resolves once it is loaded.',
    { slotId: str }, (r, a) => r.svp('selectSlot', a.slotId)),
  passthrough('svp_skeleton', 'Active skeleton: bones, slots, animations with durations, skins, events.', 'getSkeleton'),
  tool('svp_set_animation', 'Set an animation on a track (default 0), or queue it with queue: true. loop defaults to true.',
    { animation: str, track: track.optional(), loop: z.boolean().optional(), queue: z.boolean().optional() },
    (r, a) => r.svp(a.queue ? 'addAnimation' : 'setAnimation', strip({ animation: a.animation, track: a.track, loop: a.loop }))),
  tool('svp_clear_tracks', 'Clear one track, or every track (setup pose) when track is omitted.',
    { track: track.optional() },
    (r, a) => a.track === undefined ? r.svp('clearTracks') : r.svp('clearTrack', { track: a.track })),
  passthrough('svp_seek', 'Move a track (default 0) to a time in seconds.', 'seek', { time, track: track.optional() }),
  tool('svp_playback', 'Play or pause, and/or set the playback speed (0–3).',
    { playing: z.boolean().optional(), speed: z.number().min(0).max(3).optional() },
    async (r, a) => {
      if (a.speed !== undefined) await r.svp('setSpeed', a.speed)
      return a.playing === undefined ? toContent({ ok: true }) : r.svp(a.playing ? 'play' : 'pause')
    },
    s => s.refine(a => a.playing !== undefined || a.speed !== undefined, { message: 'needs playing or speed' })),
  passthrough('svp_track_options', 'Track loop, crossfade (mixDuration, seconds) and Spine 4.3 additive / mixInterpolation.', 'setTrackOptions',
    { track, loop: z.boolean().optional(), mixDuration: z.number().min(0).optional(), additive: z.boolean().optional(), mixInterpolation: str.optional() }),
  passthrough('svp_tracks', 'Running tracks with animation, time, duration, loop, mix and queue.', 'getTracks'),
  tool('svp_set_skins', 'Apply one skin, or compose several.', { skins: z.array(str).min(1) }, (r, a) => r.svp('setSkins', a.skins)),
  passthrough('svp_get_skins', 'Available and applied skins.', 'getSkins'),
  tool('svp_get_bones', 'Bone transforms (local, applied, world, setup) and overrides; all bones when omitted.',
    { bones: strings.optional() }, (r, a) => a.bones === undefined ? r.svp('getBones') : r.svp('getBones', a.bones)),
  passthrough('svp_apply_pose', 'Hold local bone values over animations (live overrides, all or none).', 'applyPose', { bones }),
  passthrough('svp_release_pose', 'Release overrides: all bones / all properties when omitted.', 'releaseOverride',
    { bones: strings.optional(), properties: z.array(z.enum(PROPS)).min(1).optional() }),
  passthrough('svp_overrides', 'Held bone overrides.', 'getOverrides'),
  passthrough('svp_set_setup_pose', 'Write local values into the setup pose (a data edit).', 'setSetupPose', { bones }),
  passthrough('svp_apply_to_setup_pose', 'Bake overrides (or the live pose of the given bones) into the setup pose.', 'applyOverridesToSetupPose', { bones: strings.optional() }),
  passthrough('svp_create_animation', 'Create an empty animation.', 'createAnimation', { name: str }),
  passthrough('svp_build_animation', 'Apply many bone keys to one animation as a single edit (one undo step); creates it when missing; replace: true drops its bone timelines first.', 'buildAnimation',
    { name: str, keys: z.array(z.strictObject({ bone: str, type: keyType, time, value: keyValue, easing: easing.optional() })).min(1).max(10_000), replace: z.boolean().optional() }),
  passthrough('svp_get_keys', 'Bone timelines of an animation, optionally of one bone.', 'getKeys', { animation: str, bone: str.optional() }),
  passthrough('svp_key_bone', 'Create or update one key.', 'setKey',
    { animation: str, bone: str, type: keyType, time, value: keyValue, easing: easing.optional() }),
  passthrough('svp_key_pose', 'Key the live pose (all overridden bones, or the given bones) at a time (default: the track time) and release those overrides.', 'keyCurrentPose',
    { animation: str, bones: strings.optional(), time: time.optional() }),
  passthrough('svp_delete_key', 'Delete a key.', 'deleteKey', { animation: str, bone: str, type: keyType, time }),
  passthrough('svp_set_key_easing', 'Change a key\'s easing.', 'setKeyEasing', { animation: str, bone: str, type: keyType, time, easing }),
  passthrough('svp_revert', 'Revert a skeleton (default: the active one) to its source data.', 'revertToSource', { slotId: str.optional() }),
  passthrough('svp_undo', 'Undo the last data edit.', 'undo'),
  passthrough('svp_redo', 'Redo an undone edit.', 'redo'),
  passthrough('svp_edit_state', 'Edit state of the active skeleton: edited, unsaved, overrides, warnings, canUndo, canRedo.', 'getEditState'),
  passthrough('svp_capture', 'The current frame as a PNG image (Export tab scale and background).', 'capturePng'),
  passthrough('svp_pose', 'World pose JSON, as the Export tab saves it.', 'getPose'),
  tool('svp_screenshot', 'Screenshot of the whole viewer page.', {}, r => r.screenshot()),
  tool('svp_export', 'Export the active skeleton (zip by default, or Spine JSON) into the export folder without overwriting; unpacked: true also unpacks the zip into a sibling folder.',
    { format: z.enum(['zip', 'json']).optional(), unpacked: z.boolean().optional() },
    (r, a) => r.exportSkeleton(a.format ?? 'zip', a.unpacked ?? false),
    s => s.refine(a => !(a.unpacked && a.format === 'json'), { message: 'unpacked needs the zip format' })),
  tool('svp_keyframe_open', 'Open the keyframe.it editor in a second page, wait for its window.keyframe API and describe it.',
    { url: str.optional() },
    async (r, a) => {
      const page = await r.session.keyframePage(a.url)
      return toContent(await callApi(page, 'keyframe', 'describe'))
    }),
  tool('svp_keyframe_call', 'Call any keyframe.it window.keyframe method with positional arguments (help() lists them).',
    { method: str, args: z.array(z.unknown()).optional() },
    async (r, a) => toContent(await r.keyframe(a.method, a.args ?? []))),
  tool('svp_keyframe_to_viewer', 'Export the open keyframe.it project as a Spine zip (4.2 by default, or 3.8; binary: true for a 4.2 .skel), write it to the export folder and load it into the viewer as the active skeleton.',
    { version: z.enum(['4.2', '3.8']).optional(), binary: z.boolean().optional(), mode: mode.optional() },
    (r, a) => r.keyframeToViewer(a.version ?? '4.2', a.binary, a.mode ?? 'add')),
  tool('svp_viewer_to_keyframe', 'Export the active skeleton as an unpacked zip and (import, default true) try to load its JSON, atlas and images into keyframe.it through "Import Spine…"; a failed import does not fail the export.',
    { import: z.boolean().optional() },
    (r, a) => r.viewerToKeyframe(a.import ?? true)),
]
