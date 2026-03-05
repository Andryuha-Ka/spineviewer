import type { CascaderOption } from 'naive-ui'

/**
 * Converts a flat animation name list into a recursive NCascader option tree.
 *
 * Names are split by '/':
 *   "idle"                  → leaf
 *   "walk/forward"          → group "walk" → leaf "forward"
 *   "combat/attack/heavy"   → group "combat" → group "attack" → leaf "heavy"
 *
 * Each leaf's `value` is always the FULL original animation name so it can
 * be passed directly to adapter.setAnimation().
 * Groups are disabled (not selectable), only leaves are.
 */
export function buildCascaderOptions(animations: string[]): CascaderOption[] {
  return buildLevel(animations, '')
}

function buildLevel(animations: string[], prefix: string): CascaderOption[] {
  const leaves: CascaderOption[]         = []
  const groupMap = new Map<string, string[]>()

  for (const name of animations) {
    const relative = prefix ? name.slice(prefix.length + 1) : name
    const slashIdx = relative.indexOf('/')

    if (slashIdx === -1) {
      leaves.push({ label: relative, value: name })
    } else {
      const groupName = relative.slice(0, slashIdx)
      if (!groupMap.has(groupName)) groupMap.set(groupName, [])
      groupMap.get(groupName)!.push(name)
    }
  }

  const groups: CascaderOption[] = []
  for (const [groupName, children] of groupMap) {
    const groupPrefix = prefix ? `${prefix}/${groupName}` : groupName
    groups.push({
      label:    groupName,
      value:    `__group__${groupPrefix}`,
      children: buildLevel(children, groupPrefix),
    })
  }

  // Leaves first, then groups — matches typical Spine naming conventions
  return [...leaves, ...groups]
}
