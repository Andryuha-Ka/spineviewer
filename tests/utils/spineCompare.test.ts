import { describe, it, expect } from 'vitest'
import { compareSpines, type SpineJsonData } from '@/core/utils/spineCompare'

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
