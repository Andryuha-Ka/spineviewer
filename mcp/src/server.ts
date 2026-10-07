#!/usr/bin/env node
/**
 * @file server.ts
 * @project Spine Viewer Pro
 * @author Andrii Karpus <andryuha.ka@gmail.com>
 * @copyright 2026 Andrii Karpus
 * @built-with Claude Code (https://claude.ai/claude-code)
 */

import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { BrowserType } from 'playwright-core'
import { parseConfig, type Config } from './config.js'
import { Session } from './session.js'
import { Runner } from './runner.js'
import { definitions } from './tools.js'

const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

export function createServer(config: Config, chromium: Pick<BrowserType, 'launchPersistentContext'>) {
  const session = new Session(chromium, config)
  const server = new McpServer({ name: 'spine-viewer-pro-mcp', version }, { capabilities: { resources: { listChanged: true } } })
  const runner = new Runner(session, () => { if (server.isConnected()) void server.server.sendResourceListChanged() })
  for (const def of definitions) {
    server.registerTool(def.name, { description: def.description, inputSchema: def.schema }, args => runner.run(() => def.run(runner, args)))
  }
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [...runner.written.values()].map(w => ({ uri: w.uri, name: w.name, mimeType: w.mimeType, size: w.size })),
  }))
  server.server.setRequestHandler(ReadResourceRequestSchema, req => runner.readResource(req.params.uri))
  return { server, runner, session }
}

async function main() {
  let config: Config
  try {
    config = parseConfig(process.argv.slice(2))
  } catch (e) {
    console.error(`svp-mcp: ${(e as Error).message}`)
    process.exit(1)
  }
  const { chromium } = await import('playwright-core')
  const { server, runner, session } = createServer(config, chromium)
  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    try { await runner.idle(); await session.close() } finally { await server.close(); process.exit(0) }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.stdin.on('end', shutdown)
  await server.connect(new StdioServerTransport())
}

const entry = process.argv[1] ? realpathSync(process.argv[1]) : ''
if (entry && entry === realpathSync(fileURLToPath(import.meta.url))) await main()
