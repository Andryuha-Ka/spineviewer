import { describe, it, expect } from 'vitest'
import { compareSpines, type SpineRuntimeData } from '@/core/utils/spineCompare'
import type { AnimationEventMarker, BoneInfo, EventInfo, SlotInfo } from '@/core/types/ISpineAdapter'
import { diffSeverity } from '@/core/utils/compare/diffSeverity'
import { makeFakeAdapter, slider, withSpine43 } from '../../helpers/fakeAdapter'

interface RuntimeFixture {
  bones: BoneInfo[]
  slots: SlotInfo[]
  skins: string[]
  animations: string[]
  events: EventInfo[]
  freeBones: string[]
  durations: Record<string, number | null>
  animEvents: Record<string, AnimationEventMarker[]>
}

const runtime = (f: RuntimeFixture): SpineRuntimeData => {
  const adapter = Object.assign(makeFakeAdapter([], f.animations), {
    bones: f.bones,
    slots: f.slots,
    skins: f.skins,
    events: f.events,
    getFreeBones: () => f.freeBones,
    getAnimationDuration: (name: string) => f.durations[name] ?? null,
    getAnimationEvents: (name: string) => f.animEvents[name] ?? [],
  })
  return { source: 'runtime', adapter }
}

const sideA = runtime({
  bones: [
    { name: 'root', parent: null },
    { name: 'body', parent: 'root' },
    { name: 'arm', parent: 'body' },
    { name: 'placeholder_hat', parent: 'root' },
    { name: 'gone', parent: 'root' },
  ],
  slots: [
    { name: 'body', bone: 'body', blendMode: 0 },
    { name: 'arm', bone: 'arm', blendMode: 1 },
    { name: 'placeholder_slot', bone: 'root', blendMode: 0 },
  ],
  skins: ['default', 'red'],
  animations: ['idle', 'run', 'win'],
  events: [
    { name: 'hit', intValue: 1, floatValue: 0.5, stringValue: 'a' },
    { name: 'same', intValue: 0, floatValue: 0, stringValue: '' },
    { name: 'only_a', intValue: 0, floatValue: 0, stringValue: '' },
  ],
  freeBones: ['root', 'arm', 'placeholder_hat'],
  durations: { idle: 1, run: 2, win: 3 },
  animEvents: {
    run: [{ name: 'hit', time: 0.2 }],
    win: [{ name: 'hit', time: 0.5 }, { name: 'hit', time: 1 }, { name: 'same', time: 0.3 }],
  },
})

const sideB = runtime({
  bones: [
    { name: 'root', parent: null },
    { name: 'body', parent: 'root' },
    { name: 'arm', parent: 'root' },
    { name: 'placeholder_hat', parent: 'root' },
    { name: 'extra', parent: 'root' },
  ],
  slots: [
    { name: 'body', bone: 'body', blendMode: 2 },
    { name: 'arm', bone: 'body', blendMode: 1 },
    { name: 'placeholder_new', bone: 'root', blendMode: 0 },
  ],
  skins: ['default', 'blue'],
  animations: ['idle', 'win', 'dance'],
  events: [
    { name: 'hit', intValue: 2, floatValue: 0.5, stringValue: 'b' },
    { name: 'same', intValue: 0, floatValue: 0, stringValue: '' },
    { name: 'only_b', intValue: 0, floatValue: 0, stringValue: '' },
  ],
  freeBones: ['root', 'extra'],
  durations: { idle: 1, win: 3.5, dance: null },
  animEvents: {
    win: [{ name: 'hit', time: 0.75 }, { name: 'same', time: 0.3 }],
    dance: [{ name: 'hit', time: 0.1 }],
  },
})

describe('compareSpines (runtime-partial)', () => {
  it('matches the captured diff', async () => {
    const diff = await compareSpines(sideA, sideB)
    expect(diff).toEqual({
      source: 'runtime-partial',
      summary: { added: 5, removed: 5, changed: 9, equal: 7 },
      animTable: [
        { name: 'idle', durA: 1, durB: 1, status: 'ok' },
        { name: 'run', durA: 2, durB: null, status: 'only-a' },
        { name: 'win', durA: 3, durB: 3.5, status: 'delta' },
        { name: 'dance', durA: null, durB: null, status: 'only-b' },
      ],
      skinTable: [
        { name: 'default', status: 'ok' },
        { name: 'red', status: 'only-a' },
        { name: 'blue', status: 'only-b' },
      ],
      globalEvents: [
        { name: 'hit', status: 'ok' },
        { name: 'same', status: 'ok' },
        { name: 'only_a', status: 'only-a' },
        { name: 'only_b', status: 'only-b' },
      ],
      animEvents: [
        {
          animName: 'dance',
          animStatus: 'only-b',
          events: [
            { eventName: 'hit', idx: 0, timeA: null, timeB: 0.1, status: 'only-b' },
          ],
          hasChanges: true,
        },
        {
          animName: 'run',
          animStatus: 'only-a',
          events: [
            { eventName: 'hit', idx: 0, timeA: 0.2, timeB: null, status: 'only-a' },
          ],
          hasChanges: true,
        },
        {
          animName: 'win',
          animStatus: 'ok',
          events: [
            { eventName: 'same', idx: 0, timeA: 0.3, timeB: 0.3, status: 'ok' },
            { eventName: 'hit', idx: 0, timeA: 0.5, timeB: 0.75, status: 'delta' },
            { eventName: 'hit', idx: 1, timeA: 1, timeB: null, status: 'only-a' },
          ],
          hasChanges: true,
        },
      ],
      constraintTable: [],
      sliderTable: [],
      freeBoneTable: [
        { name: 'arm', status: 'only-a' },
        { name: 'extra', status: 'only-b' },
        { name: 'placeholder_hat', status: 'only-a' },
        { name: 'root', status: 'ok' },
      ],
      placeholders: [
        { name: 'placeholder_hat', kind: 'bone', status: 'equal' },
        { name: 'placeholder_slot', kind: 'slot', status: 'removed' },
        { name: 'placeholder_new', kind: 'slot', status: 'added' },
      ],
      sections: [
        {
          id: 'bones',
          label: 'Bones',
          status: 'changed',
          counts: { a: 5, b: 5 },
          items: [
            { key: 'root', status: 'equal' },
            { key: 'body', status: 'equal' },
            {
              key: 'arm',
              status: 'changed',
              children: [
                { key: 'parent', status: 'changed', valueA: 'body', valueB: 'root' },
              ],
            },
            { key: 'placeholder_hat', status: 'equal' },
            { key: 'gone', status: 'removed' },
            { key: 'extra', status: 'added' },
          ],
        },
        {
          id: 'slots',
          label: 'Slots',
          status: 'changed',
          counts: { a: 3, b: 3 },
          items: [
            {
              key: 'body',
              status: 'changed',
              children: [
                { key: 'blend', status: 'changed', valueA: 'Normal', valueB: 'Multiply' },
              ],
            },
            {
              key: 'arm',
              status: 'changed',
              children: [
                { key: 'bone', status: 'changed', valueA: 'arm', valueB: 'body' },
              ],
            },
            { key: 'placeholder_slot', status: 'removed' },
            { key: 'placeholder_new', status: 'added' },
          ],
        },
        {
          id: 'skins',
          label: 'Skins',
          status: 'changed',
          counts: { a: 2, b: 2 },
          items: [
            { key: 'red', status: 'removed' },
            { key: 'blue', status: 'added' },
            { key: 'default', status: 'equal' },
          ],
        },
        {
          id: 'animations',
          label: 'Animations',
          status: 'changed',
          counts: { a: 3, b: 3 },
          items: [
            { key: 'run', status: 'removed' },
            { key: 'dance', status: 'added' },
            { key: 'idle', status: 'equal' },
            { key: 'win', status: 'equal' },
          ],
        },
        {
          id: 'events',
          label: 'Events',
          status: 'changed',
          counts: { a: 3, b: 3 },
          items: [
            {
              key: 'hit',
              status: 'changed',
              children: [
                { key: 'int', status: 'changed', valueA: '1', valueB: '2' },
                { key: 'string', status: 'changed', valueA: 'a', valueB: 'b' },
              ],
            },
            { key: 'same', status: 'equal' },
            { key: 'only_a', status: 'removed' },
            { key: 'only_b', status: 'added' },
          ],
        },
      ],
    })
  })
})

describe('compareSpines (runtime) free bones across 4.2 and 4.3', () => {
  it('counts a bone a 4.3 slider drives as free on the 4.2 side only', async () => {
    const empty = { bones: [], slots: [], skins: [], animations: [], events: [], durations: {}, animEvents: {} }
    const diff = await compareSpines(
      runtime({ ...empty, freeBones: ['root', 'gem'] }),
      { source: 'runtime', adapter: withSpine43(runtime({ ...empty, freeBones: ['root'] }).adapter as ReturnType<typeof makeFakeAdapter>, [slider('spin')]) },
    )
    expect(diff.freeBoneTable).toEqual([{ name: 'gem', status: 'only-a' }, { name: 'root', status: 'ok' }])
    expect(diff.sliderTable).toEqual([])
    expect(diffSeverity(diff)).toMatchObject({ freeBone: 1, warn: 1, critical: 0 })
  })
})
