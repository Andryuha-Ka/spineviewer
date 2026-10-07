import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import HelpModal from '@/components/ui/HelpModal.vue'
import { SVP_API_VERSION } from '@/core/api/svpApi'

function apiSection(): HTMLElement {
  const title = [...document.body.querySelectorAll('.sec-title')].find(h => h.textContent === 'API & MCP')
  expect(title).toBeDefined()
  return title!.closest('section') as HTMLElement
}

describe('HelpModal — API & MCP', () => {
  let wrapper: VueWrapper

  async function open() {
    wrapper = mount(HelpModal, { attachTo: document.body })
    await wrapper.find('.help-btn').trigger('click')
    await nextTick()
    return apiSection()
  }

  afterEach(() => {
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('shows the API version and the svp-mcp start command', async () => {
    const section = await open()
    expect(section.querySelector('.api-ver')?.textContent).toBe(SVP_API_VERSION)
    expect(section.textContent).toMatch(/npx -y spine-viewer-pro-mcp --headed/)
  })

  it('shows install & connect with an npx config per client', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const section = await open()

    const tabs = [...section.querySelectorAll('.client-tabs .n-tabs-tab')].map(t => t.textContent?.trim())
    expect(tabs).toEqual(['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code', 'Codex CLI', 'Gemini CLI', 'Windsurf', 'Other (stdio)'])

    const panes = [...section.querySelectorAll<HTMLElement>('.client-tabs .n-tab-pane')]
    expect(panes).toHaveLength(8)
    for (const pane of panes) {
      const snippet = pane.querySelector('.snippet')!
      const code = snippet.querySelector('code')!.textContent ?? ''
      expect(code).toContain('spine-viewer-pro-mcp')
      expect(code).toContain('--headed')
      expect(code).not.toContain('<repo>')
      writeText.mockClear()
      ;(snippet.querySelector('.copy-btn') as HTMLButtonElement).click()
      expect(writeText).toHaveBeenCalledWith(code)
    }
    expect(panes[0].textContent).toContain('claude mcp add svp -- npx -y spine-viewer-pro-mcp --headed')
    expect(panes[0].textContent).toMatch(/local[\s\S]*project[\s\S]*user/)
    expect(panes[1].textContent).toContain('"command": "npx"')
    expect(panes[1].textContent).toContain('"args": ["-y", "spine-viewer-pro-mcp", "--headed"]')
    expect(panes[3].textContent).toContain('"servers"')
    expect(panes[3].textContent).toContain('"type": "stdio"')
    expect(panes[3].textContent).toContain('.vscode/mcp.json')
    expect(panes[4].textContent).toContain('[mcp_servers.svp]')

    const text = section.textContent ?? ''
    expect(text).toContain('svp_session')
    expect(text).toContain('nothing to install')
  })

  it('shows no build-from-source or extension setup anywhere in the modal', async () => {
    await open()
    const text = document.body.querySelector('.help-body')!.textContent ?? ''
    for (const s of ['npm run build', 'mcp/dist/server.js', '<repo>', 'pixi-inspector-mcp', 'Use this tab for MCP', 'npx svp-mcp']) {
      expect(text).not.toContain(s)
    }
  })

  it('shows copyable console snippets for the quick start', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const section = await open()

    const snippets = [...section.querySelectorAll('.snippets .snippet')]
    const code = snippets.map(s => s.querySelector('code')!.textContent ?? '').join('\n')
    for (const call of ['svp.info()', 'svp.help()', 'setBoneOverride', 'applyOverridesToSetupPose', 'setKey', 'exportSkeleton']) {
      expect(code).toContain(call)
    }

    for (const s of snippets) {
      expect(s.querySelector('.copy-btn')).not.toBeNull()
    }
    const info = snippets.find(s => s.textContent?.includes('svp.info()'))!
    ;(info.querySelector('.copy-btn') as HTMLButtonElement).click()
    expect(writeText).toHaveBeenCalledWith(info.querySelector('code')!.textContent)
  })

  it('lists the keyframe.it round trip in order, then the replace-mode note', async () => {
    const section = await open()
    const steps = [...section.querySelectorAll('.round-trip li')].map(li => li.querySelector('code')?.textContent ?? '')
    expect(steps.map(s => s.split(' ')[0])).toEqual(['svp_viewer_to_keyframe', 'svp_keyframe_call', 'svp_keyframe_to_viewer'])

    const text = section.textContent ?? ''
    expect(text.indexOf("mode: 'replace'")).toBeGreaterThan(text.indexOf('svp_keyframe_to_viewer'))
    expect(text).toMatch(/3\.8 export over a 4\.2/)
    expect(section.querySelector('a[href$="docs/api-and-mcp.md"]')).not.toBeNull()
  })
})

function section(title: string): HTMLElement {
  const h = [...document.body.querySelectorAll('.sec-title')].find(e => e.textContent === title)
  expect(h).toBeDefined()
  return h!.closest('section') as HTMLElement
}

function setNum(el: Element, prop: string, value: number) {
  Object.defineProperty(el, prop, { configurable: true, value })
}

describe('HelpModal — navigation and structure', () => {
  let wrapper: VueWrapper

  async function open() {
    wrapper = mount(HelpModal, { attachTo: document.body })
    await wrapper.find('.help-btn').trigger('click')
    await nextTick()
  }

  const navButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>('.help-nav button')]
  const current = () => navButtons().filter(b => b.getAttribute('aria-current') === 'true').map(b => b.title)
  const activeTitles = () => navButtons().filter(b => b.classList.contains('active')).map(b => b.title)

  afterEach(() => {
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('lists one nav button per section, in heading order, with the first current', async () => {
    await open()
    const headings = [...document.body.querySelectorAll('.sec-title')].map(h => h.textContent)
    expect(headings).toHaveLength(11)
    expect(navButtons().map(b => b.title)).toEqual(headings)
    expect(navButtons().every(b => b.type === 'button')).toBe(true)
    expect(current()).toEqual(['File Loading'])
  })

  it('jumps to a section, focuses its heading and moves the current marker', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    await open()
    const target = section('Keyboard Shortcuts')
    const heading = target.querySelector('.sec-title') as HTMLElement
    const focus = vi.spyOn(heading, 'focus')

    navButtons().find(b => b.textContent === 'Shortcuts')!.click()
    await nextTick()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(target)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(current()).toEqual(['Keyboard Shortcuts'])
    expect(activeTitles()).toEqual(['Keyboard Shortcuts'])
  })

  it('follows scrolling and marks the last section at the end', async () => {
    await open()
    const body = document.body.querySelector('.help-body') as HTMLElement
    const secs = [...body.querySelectorAll('[data-sec]')]
    secs.forEach((s, i) => setNum(s, 'offsetTop', i * 500))
    setNum(document.body.querySelector('.help-nav')!, 'offsetHeight', 30)
    setNum(body, 'clientHeight', 400)
    setNum(body, 'scrollHeight', 6000)

    // Compare Mode (index 4) top at 2000, line = scrollTop + 30 + 8
    setNum(body, 'scrollTop', 1970)
    body.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(current()).toEqual(['Compare Mode'])
    expect(activeTitles()).toEqual(['Compare Mode'])

    setNum(body, 'scrollTop', 5600)
    body.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(current()).toEqual(['About'])
  })

  it('shows the side panel tabs and keyboard shortcuts as tables', async () => {
    await open()
    const tabs = section('Side Panel Tabs').querySelector('table')!
    const firstCells = [...tabs.querySelectorAll('tbody tr')].map(r => r.querySelector('td')!.textContent!.trim())
    expect(firstCells).toEqual(['Spines', 'Anim', 'Insp', 'Bones', 'Atlas', 'Perf', 'Compl', 'Export'])
    const insp = [...tabs.querySelectorAll('tbody tr')][2].textContent!
    expect(insp).toContain('dimmed')
    expect(insp).toContain('grey')

    const keys = section('Keyboard Shortcuts').querySelector('table')!
    expect([...keys.querySelectorAll('thead th')].map(th => th.textContent)).toEqual(['Key', 'Action'])
    const rows = [...keys.querySelectorAll('tbody tr')].map(r => r.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim())
    for (const k of ['Space', 'R', 'L', 'Shift + L', '0 – 9']) expect(rows).toContain(k)
  })
})
