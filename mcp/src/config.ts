/**
 * @file config.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export interface Config {
  url: string
  headed: boolean
  profile: string
  exportDir: string
  keyframeUrl: string
  /** internal: Chrome binary instead of the installed channel */
  chromePath?: string
}

export const DEFAULT_URL = 'https://andryuha-ka.github.io/spineviewer/'
export const DEFAULT_KEYFRAME_URL = 'https://www.keyframe.it.com/?editor=1'

const LOCAL_HOSTS = ['localhost', '127.0.0.1']

/** Accepts https:, or http: on localhost / 127.0.0.1; the error names the option. */
export function allowedUrl(value: string, option: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`${option}: not a valid URL: ${value}`) }
  const ok = !url.username && !url.password
    && (url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname)))
  if (!ok) throw new Error(`${option}: use https:, or http: on localhost or 127.0.0.1 (got ${value})`)
  return url.href
}

/** CLI options win over environment variables, which win over the defaults. */
export function parseConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): Config {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      headed: { type: 'boolean' },
      profile: { type: 'string' },
      'export-dir': { type: 'string' },
      'keyframe-url': { type: 'string' },
    },
    strict: true,
  })
  const home = join(homedir(), '.svp-mcp')
  return {
    url: allowedUrl(values.url ?? env.SVP_URL ?? DEFAULT_URL, values.url ? '--url' : env.SVP_URL ? 'SVP_URL (--url)' : '--url'),
    headed: values.headed ?? env.SVP_HEADED === '1',
    profile: resolve(values.profile ?? env.SVP_PROFILE_DIR ?? join(home, 'profile')),
    exportDir: resolve(values['export-dir'] ?? env.SVP_EXPORT_DIR ?? join(home, 'exports')),
    keyframeUrl: allowedUrl(
      values['keyframe-url'] ?? env.SVP_KEYFRAME_URL ?? DEFAULT_KEYFRAME_URL,
      values['keyframe-url'] ? '--keyframe-url' : env.SVP_KEYFRAME_URL ? 'SVP_KEYFRAME_URL (--keyframe-url)' : '--keyframe-url',
    ),
    chromePath: env.SVP_CHROME_PATH || undefined,
  }
}
