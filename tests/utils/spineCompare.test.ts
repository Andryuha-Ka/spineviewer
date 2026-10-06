import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { compareSpines, type SpineJsonData } from '@/core/utils/spineCompare'
import { constraintTarget, getJsonConstraints } from '@/core/utils/compare/jsonAccess'

const json = (raw: Record<string, unknown>): SpineJsonData => ({ source: 'json', raw })

const base = {
  skeleton: { spine: '4.1.24' },
  bones: [{ name: 'root' }, { name: 'body', parent: 'root' }],
  slots: [{ name: 'body', bone: 'body', attachment: 'body' }],
  skins: [{ name: 'default', attachments: { body: { body: { width: 10, height: 10 } } } }],
  events: { hit: {} },
  animations: {
    idle: { bones: { body: { rotate: [{ time: 0 }, { time: 1 }] } } },
    win:  { events: [{ time: 0.5, name: 'hit' }], bones: { body: { rotate: [{ time: 0 }, { time: 2 }] } } },
  },
}

describe('compareSpines (JSON)', () => {
  it('reports identical skeletons as equal', async () => {
    const diff = await compareSpines(json(base), json(structuredClone(base)))
    expect(diff.source).toBe('json-full')
    expect(diff.summary.added + diff.summary.removed + diff.summary.changed).toBe(0)
    expect(diff.animTable.every(r => r.status === 'ok')).toBe(true)
  })

  it('finds added bones, missing animations, duration and event timing deltas', async () => {
    const b: Record<string, unknown> & { bones: typeof base.bones } = structuredClone(base)
    b.bones.push({ name: 'extra', parent: 'root' })
    b.animations = {
      win: { events: [{ time: 0.75, name: 'hit' }], bones: { body: { rotate: [{ time: 0 }, { time: 3 }] } } },
    }
    const diff = await compareSpines(json(base), json(b))

    expect(diff.summary.added).toBeGreaterThan(0)
    expect(diff.sections.find(s => s.id === 'bones')?.status).toBe('changed')
    const rows = Object.fromEntries(diff.animTable.map(r => [r.name, r]))
    expect(rows.idle.status).toBe('only-a')
    expect(rows.win).toMatchObject({ status: 'delta', durA: 2, durB: 3 })
    const win = diff.animEvents.find(g => g.animName === 'win')!
    expect(win.events[0]).toMatchObject({ eventName: 'hit', timeA: 0.5, timeB: 0.75, status: 'delta' })
  })

  it('rejects mixing JSON and runtime sources', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(compareSpines(json(base), { source: 'runtime', adapter: {} as any })).rejects.toThrow()
  })
})

describe('compareSpines JSON duration', () => {
  const durOf = async (anim: Record<string, unknown>) => {
    const raw = { ...base, animations: { a: anim } }
    const diff = await compareSpines(json(raw), json(raw))
    return diff.animTable[0].durA
  }
  const frames = (t: number) => [{ time: 0 }, { time: t }]

  it('counts every timeline type', async () => {
    expect(await durOf({ drawOrder: frames(1.5) })).toBe(1.5)
    expect(await durOf({ ik: { leg: frames(1.25) } })).toBe(1.25)
    expect(await durOf({ physics: { hair: { wind: frames(1.75) } } })).toBe(1.75)
    expect(await durOf({ deform: { default: { body: { body: frames(2.2) } } } })).toBe(2.2)
    expect(await durOf({ attachments: { default: { body: { body: { deform: frames(2.3) } } } } })).toBe(2.3)
    expect(await durOf({ attachments: { default: { body: { body: { sequence: frames(2.4) } } } } })).toBe(2.4)
  })

  it('takes a later draw-order key over earlier bone keys', async () => {
    expect(await durOf({ bones: { body: { rotate: frames(1) } }, drawOrder: frames(2.5) })).toBe(2.5)
  })
})

describe('compareSpines placeholders', () => {
  it('compares by name only', async () => {
    const a = structuredClone(base) as Record<string, unknown> & typeof base
    a.bones.push({ name: 'placeholder_bone', parent: 'root' })
    a.slots.push({ name: 'x', bone: 'root' } as never, { name: 'placeholder_hat', bone: 'root' } as never, { name: 'placeholder_bag', bone: 'root' } as never)
    const b = structuredClone(base) as Record<string, unknown> & typeof base
    b.bones.push({ name: 'placeholder_bone', parent: 'body' })
    b.slots.push({ name: 'placeholder_hat', bone: 'body', blend: 'additive' } as never, { name: 'placeholder_cape', bone: 'root' } as never)
    const diff = await compareSpines(json(a), json(b))

    const byName = Object.fromEntries(diff.placeholders.map(p => [p.name, p]))
    expect(byName.placeholder_bone).toEqual({ name: 'placeholder_bone', kind: 'bone', status: 'equal' })
    expect(byName.placeholder_hat).toEqual({ name: 'placeholder_hat', kind: 'slot', status: 'equal' })
    expect(byName.placeholder_bag.status).toBe('removed')
    expect(byName.placeholder_cape.status).toBe('added')
    expect(diff.placeholders.filter(p => p.status !== 'equal')).toHaveLength(2)
  })

  it('ignores attachment blend', async () => {
    const withAtt = (blend: string) => ({
      ...base,
      skins: [{ name: 'default', attachments: { body: { placeholder_att: { blend } } } }],
    })
    const diff = await compareSpines(json(withAtt('normal')), json(withAtt('additive')))
    expect(diff.placeholders).toEqual([{ name: 'placeholder_att', kind: 'attachment', status: 'equal', slot: 'body' }])
  })

  it('keeps same-named attachments in different slots apart', async () => {
    const withSlots = (...slots: string[]) => ({
      ...base,
      skins: [{ name: 'default', attachments: Object.fromEntries(slots.map(s => [s, { placeholder_gem: {} }])) }],
    })
    const diff = await compareSpines(json(withSlots('hand_l', 'hand_r')), json(withSlots('hand_l')))
    const atts = diff.placeholders.filter(p => p.kind === 'attachment')
    expect(atts).toEqual([
      { name: 'placeholder_gem', kind: 'attachment', status: 'equal', slot: 'hand_l' },
      { name: 'placeholder_gem', kind: 'attachment', status: 'removed', slot: 'hand_r' },
    ])
    expect(diff.placeholders.filter(p => p.status !== 'equal')).toHaveLength(1)
  })
})

describe('compareSpines slot draw order', () => {
  const withSlots = (...names: string[]) => ({ ...base, slots: names.map(name => ({ name, bone: 'root' })) })
  const flagged = async (a: string[], b: string[]) => {
    const diff = await compareSpines(json(withSlots(...a)), json(withSlots(...b)))
    return diff.sections.find(s => s.id === 'slots')!.items
      .filter(i => i.children?.some(c => c.key === 'drawOrder'))
      .map(i => i.key)
  }

  it('ignores an inserted slot', async () => {
    expect(await flagged(['a', 'b', 'c', 'd'], ['a', 'x', 'b', 'c', 'd'])).toEqual([])
  })

  it('ignores a removed slot', async () => {
    expect(await flagged(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toEqual([])
  })

  it('flags only a moved slot', async () => {
    expect(await flagged(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'])).toEqual(['a'])
  })

  it('flags one slot of an adjacent swap', async () => {
    const res = await flagged(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd'])
    expect(res).toHaveLength(1)
    expect(['b', 'c']).toContain(res[0])
  })
})

// ── Spine 4.3 JSON layout ─────────────────────────────────────────────────────

type Raw = Record<string, unknown>
type C = Record<string, unknown>

const layout42 = (): Raw & { ik: C[]; transform: C[]; path: C[] } => ({
  ...structuredClone(base),
  skeleton: { spine: '4.2.43' },
  slots: [...base.slots, { name: 'rail', bone: 'root' }],
  ik:        [{ name: 'leg', bones: ['body'], target: 'root', bendPositive: false, mix: 0.8 }],
  transform: [{ name: 'tc', bones: ['body'], target: 'root', mixRotate: 0.5 }],
  path:      [{ name: 'pc', bones: ['body'], target: 'rail', rotateMode: 'chainScale' }],
})

/** Re-exports a 4.2-layout skeleton in the 4.3 layout: one constraints list, transform source, path slot. */
const to43 = (raw: Raw & { ik: C[]; transform: C[]; path: C[] }, extra: C[] = []): Raw => {
  const { ik, transform, path, ...rest } = raw
  return {
    ...rest,
    skeleton: { spine: '4.3.13' },
    constraints: [
      ...ik.map(c => ({ type: 'ik', ...c })),
      ...transform.map(({ target, ...c }) => ({ type: 'transform', ...c, source: target })),
      ...path.map(({ target, ...c }) => ({ type: 'path', ...c, slot: target })),
      ...extra,
    ],
  }
}

const sliderDef = (name: string, over: C = {}): C => ({ type: 'slider', name, animation: name, ...over })

describe('getJsonConstraints / constraintTarget', () => {
  it('reads the per-type 4.2 lists and the single 4.3 list alike', () => {
    const r42 = layout42()
    const r43 = to43(r42, [sliderDef('blink')])
    for (const type of ['ik', 'transform', 'path'] as const) {
      expect(getJsonConstraints(r42, type).map(c => c.name)).toEqual(getJsonConstraints(r43, type).map(c => c.name))
      expect(getJsonConstraints(r42, type).map(constraintTarget)).toEqual(getJsonConstraints(r43, type).map(constraintTarget))
    }
    expect(getJsonConstraints(r42, 'transform').map(constraintTarget)).toEqual(['root'])
    expect(getJsonConstraints(r43, 'path').map(constraintTarget)).toEqual(['rail'])
    expect(getJsonConstraints(r42, 'slider')).toEqual([])
    expect(getJsonConstraints(r43, 'slider').map(c => c.name)).toEqual(['blink'])
  })
})

describe('compareSpines constraints across layouts', () => {
  const changed = () => {
    const b = layout42()
    b.ik[0].mix = 0.5
    b.transform[0].target = 'body'
    b.path = []
    b.ik.push({ name: 'arm', bones: ['body'], target: 'root' })
    return b
  }

  it('gives 4.3 pairs the same constraint rows and section as the equivalent 4.2 pair', async () => {
    const d42 = await compareSpines(json(layout42()), json(changed()))
    const d43 = await compareSpines(json(to43(layout42())), json(to43(changed())))
    expect(d43.constraintTable).toEqual(d42.constraintTable)
    expect(d43.constraintTable.map(r => [r.name, r.status])).toEqual([
      ['arm', 'only-b'], ['leg', 'changed'], ['pc', 'only-a'], ['tc', 'changed'],
    ])
    const sec = (d: typeof d42) => d.sections.find(s => s.id === 'constraints')
    expect(sec(d43)).toEqual(sec(d42))
  })

  it('flags a 4.x transform mix change as params in both layouts', async () => {
    const b = layout42()
    b.transform[0].mixRotate = 0.25
    for (const [a, bb] of [[layout42(), b], [to43(layout42()), to43(b)]]) {
      const row = (await compareSpines(json(a), json(bb))).constraintTable.find(r => r.name === 'tc')
      expect(row).toMatchObject({ status: 'changed', bonesChanged: false, targetChanged: false, paramsChanged: true })
    }
  })

  it('treats a 4.2 and a 4.3 export of the same skeleton as equal, except the spine version', async () => {
    const diff = await compareSpines(json(layout42()), json(to43(layout42())))
    expect(diff.constraintTable).toHaveLength(3)
    for (const r of diff.constraintTable)
      expect(r).toMatchObject({ status: 'ok', bonesChanged: false, targetChanged: false, paramsChanged: false })
    const skeleton = diff.sections.find(s => s.id === 'skeleton')!
    expect(skeleton.items.find(i => i.key === 'spine')).toMatchObject({ status: 'changed', valueA: '4.2.43', valueB: '4.3.13' })
    expect(diff.sections.filter(s => s.status !== 'equal').map(s => s.id)).toEqual(['skeleton'])
  })
})

describe('compareSpines 4.3 durations', () => {
  const durOf = async (anim: Record<string, unknown>) => {
    const raw = { ...base, animations: { a: anim } }
    const diff = await compareSpines(json(raw), json(raw))
    return diff.animTable[0].durA
  }

  it('takes a trailing slider key', async () => {
    expect(await durOf({
      bones: { body: { rotate: [{ value: 0 }, { time: 1, value: 10 }] } },
      slider: { s: { mix: [{}, { time: 1.75, value: 0.5 }] } },
    })).toBe(1.75)
  })

  it('reaches draw-order folder keys', async () => {
    expect(await durOf({
      bones: { body: { rotate: [{ value: 0 }, { time: 1, value: 10 }] } },
      drawOrderFolder: [{ slots: ['body'], keys: [{}, { time: 2.25, offsets: [{ slot: 'body', offset: 0 }] }] }],
    })).toBe(2.25)
  })
})

describe('compareSpines slider table', () => {
  const r43 = (...sliders: C[]) => to43(layout42(), sliders)

  it('lists a slider present on one side only', async () => {
    const diff = await compareSpines(json(r43()), json(r43(sliderDef('blink'))))
    expect(diff.sliderTable).toEqual([{ name: 'blink', status: 'only-b', changes: [] }])
  })

  it('reports changed setup values with JSON defaults applied', async () => {
    const diff = await compareSpines(
      json(r43(sliderDef('smile'), sliderDef('wink', { loop: false, mix: 1 }))),
      json(r43(sliderDef('smile', { time: 0.5 }), sliderDef('wink'))),
    )
    expect(diff.sliderTable).toEqual([
      { name: 'smile', status: 'changed', changes: [{ key: 'time', a: '0', b: '0.5' }] },
      { name: 'wink', status: 'ok', changes: [] },
    ])
  })

  it('puts issues first, then sorts by name', async () => {
    const diff = await compareSpines(
      json(r43(sliderDef('a'), sliderDef('c'))),
      json(r43(sliderDef('a'), sliderDef('b'), sliderDef('c', { bone: 'body', property: 'rotate' }))),
    )
    expect(diff.sliderTable.map(r => [r.name, r.status])).toEqual([['b', 'only-b'], ['c', 'changed'], ['a', 'ok']])
    expect(diff.sliderTable[1].changes).toEqual([{ key: 'bone', a: '—', b: 'body' }, { key: 'property', a: '—', b: 'rotate' }])
  })

  it('lists both sliders of a 4.3 skeleton as B only against its 4.2 export', async () => {
    const diff = await compareSpines(json(layout42()), json(r43(sliderDef('blink'), sliderDef('smile'))))
    expect(diff.sliderTable.map(r => [r.name, r.status])).toEqual([['blink', 'only-b'], ['smile', 'only-b']])
  })

  it('is empty when neither side has sliders', async () => {
    expect((await compareSpines(json(r43()), json(layout42()))).sliderTable).toEqual([])
  })
})

// ── Official 4.3 samples (example/ is gitignored, so these run locally only) ──

const SAMPLES = 'example/4.3'
const sample = (p: string): Raw => JSON.parse(readFileSync(`${SAMPLES}/${p}`, 'utf-8'))

/** Animation durations as spine-core 4.3.13 SkeletonJson computes them, rounded to 1 ms. */
const RUNTIME_DURATIONS: Record<string, Record<string, number>> = {
  'celestial-circus/celestial-circus-pro.json': { 'eyeblink': 0.333, 'eyeblink-long': 4.7, 'stars': 0.733, 'swing': 2.2, 'wind-idle': 9.633, 'wing-flap': 2.3, 'wings-and-feet': 2.3 },
  'cloud-pot/cloud-pot.json': { 'playing-in-the-rain': 4.667, 'pot-moving-followed-by-rain': 3.267, 'rain': 0.467 },
  'diamond/diamond-pro.json': { 'appear': 4.3, 'disappear': 1.067, 'idle-rotating': 2, 'idle-rotating-alt-shape': 2, 'idle-still': 3, 'rotation': 2, 'size-changing-rotation': 6, 'size-changing-rotation-perspective': 6 },
  'mix-and-match/mix-and-match-pro.json': { 'aware': 1.067, 'blink': 1.032, 'dance': 0.5, 'dress-up': 2.767, 'idle': 1.167, 'walk': 0.667 },
  'spineboy/spineboy-ess.json': { 'aim': 0, 'death': 4.933, 'hit': 0.333, 'idle': 1.667, 'jump': 1.333, 'run': 0.667, 'shoot': 0.4, 'walk': 1 },
  'spineboy/spineboy-pro.json': { 'aim': 0, 'death': 4.933, 'hoverboard': 1, 'idle': 1.667, 'idle-turn': 0.267, 'jump': 1.333, 'portal': 3.167, 'run': 0.667, 'run-to-idle': 0.267, 'shoot': 0.633, 'walk': 1 },
  'stretchyman/stretchyman-pro.json': { 'idle': 2, 'sneak': 1.8 },
  'tank/tank-pro.json': { 'drive': 5.7, 'shoot': 1.067 },
  'vine/vine-pro.json': { 'grow': 11.433 },
}

describe.skipIf(!existsSync(SAMPLES))('compareSpines on the official 4.3 samples', () => {
  it('matches the runtime animation durations', async () => {
    for (const [file, expected] of Object.entries(RUNTIME_DURATIONS)) {
      const raw = sample(file)
      const diff = await compareSpines(json(raw), json(raw))
      expect(Object.fromEntries(diff.animTable.map(r => [r.name, r.durA])), file).toEqual(expected)
    }
  })

  it('reads every IK, transform and path constraint and reports a self-compare as equal', async () => {
    const counts: Record<string, number> = {
      'mix-and-match/mix-and-match-pro.json': 23, 'stretchyman/stretchyman-pro.json': 10, 'tank/tank-pro.json': 9,
      'vine/vine-pro.json': 1, 'spineboy/spineboy-pro.json': 14, 'celestial-circus/celestial-circus-pro.json': 3,
    }
    for (const [file, n] of Object.entries(counts)) {
      const raw = sample(file)
      const diff = await compareSpines(json(raw), json(structuredClone(raw)))
      expect(diff.constraintTable.filter(r => r.status === 'ok'), file).toHaveLength(n)
      expect(diff.sections.every(s => s.status === 'equal'), file).toBe(true)
    }
  })

  it('lists the diamond slider as A only against spineboy-pro', async () => {
    const diff = await compareSpines(json(sample('diamond/diamond-pro.json')), json(sample('spineboy/spineboy-pro.json')))
    expect(diff.sliderTable).toEqual([{ name: 'rotation', status: 'only-a', changes: [] }])
  })
})
