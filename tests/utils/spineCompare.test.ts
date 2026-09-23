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
