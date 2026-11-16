// @vitest-environment jsdom
// Smoke test of the built bundles (Spec 6 task 10.1): the committed live
// module and, when it has been built, the static replay page are loaded as
// built files and must render the same house. This proves the build output,
// not the sources: nothing here imports from src/ except test fixtures.
// **Validates: Requirements 1.1, 1.2, 1.3, 9.3, 9.4, 9.5, 10.9**
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(UI, '../..')
const LIVE = path.join(UI, 'dist/index.mjs')
const REPLAY_DIR = path.join(UI, 'dist-replay')
const MANSION = 'demo-mansion'
const API = '/apps/haunted-house/api'
const ROOM_ORDER = ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room']

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await wait(20)
  }
  throw new Error(`timed out waiting for ${what}`)
}

function click(element: Element | null | undefined): void {
  if (element == null) throw new Error('nothing to click')
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

async function openMansion(): Promise<void> {
  await until(() => document.querySelector(`input[type="radio"][value="${MANSION}"]`) !== null, 'the Foyer list')
  click(document.querySelector(`input[type="radio"][value="${MANSION}"]`))
  await until(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes(`Open ${MANSION}`)), 'the Open control')
  click(Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(`Open ${MANSION}`)))
  await until(() => document.querySelector('nav[aria-label="Mansion rooms"]') !== null, 'the House Map')
}

function assertHouse(mode: 'live' | 'replay'): void {
  const shell = document.querySelector('.hh-ui')!
  expect(shell.getAttribute('data-mode')).toBe(mode)
  expect(Array.from(shell.querySelectorAll('.hh-ui-rooms > li'), (item) => item.getAttribute('data-room'))).toEqual(ROOM_ORDER)
  expect(shell.querySelector('[data-room-control="study"]')?.getAttribute('aria-label')).toMatch(/^Study\. Phase: requirements\. Door: \w+\. Ghost: [\w ]+\.$/)
  expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
  expect(document.querySelectorAll('main')).toHaveLength(1)
  expect(shell.querySelector('style')?.textContent).toContain('.hh-ui-room-cell')
  for (const svg of Array.from(shell.querySelectorAll('svg'))) expect(svg.getAttribute('aria-hidden')).toBe('true')
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

describe('committed live bundle', () => {
  it('exports the page component and renders the Foyer, then the house of an opened Mansion', async () => {
    const descriptor = { name: MANSION, projectSpec: MANSION, displayPath: `~/workspace/haunted-house/mansions/${MANSION}`, status: 'ready' }
    const { initialWorkflowProjection, workflowProjectionToJson } = await import('../src/core/workflow-projection')
    const requests: string[] = []
    const notFound = () => Object.assign(new Error('API 404'), { status: 404, body: '{}' })
    vi.doMock('@kirocrew/app-sdk', () => ({
      useAppApi: () => ({
        async get(route: string): Promise<unknown> {
          requests.push(`GET ${route}`)
          if (route === `${API}/whoami`) return { backend: 'ok', gateway: { version: '0.12.2' } }
          if (route === `${API}/mansions`) return { schemaVersion: 1, mansions: [descriptor] }
          if (route.startsWith(`${API}/mansions/${MANSION}/seance/events`)) return { events: [], highest_sequence: 0, diagnostics: [] }
          if (route === `${API}/mansions/${MANSION}/workflow`) return JSON.parse(JSON.stringify(workflowProjectionToJson(initialWorkflowProjection(MANSION))))
          throw notFound()
        },
        async post(route: string): Promise<unknown> {
          requests.push(`POST ${route}`)
          if (route === `${API}/mansions/open`) return { mansion: descriptor }
          throw notFound()
        },
        put: async () => Promise.reject(notFound()),
        patch: async () => Promise.reject(notFound()),
        del: async () => Promise.reject(notFound()),
      }),
      useAppEvents: () => () => {},
      useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
      useNotify: () => () => {},
      useNavBadge: () => () => {},
      useChatLauncher: () => ({ openChat: () => {} }),
    }))
    vi.stubGlobal('fetch', () => {
      throw new Error('The live bundle must not call fetch itself.')
    })

    const bundle = (await import(/* @vite-ignore */ pathToFileURL(LIVE).href)) as { default: unknown }
    expect(Object.keys(bundle)).toEqual(['default'])
    expect(typeof bundle.default).toBe('function')

    const { createElement } = await import('react')
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(createElement(bundle.default as () => null))
    await openMansion()
    assertHouse('live')
    // Every write was the one explicit open; nothing was decided by rendering.
    expect(requests.filter((line) => line.startsWith('POST'))).toEqual([`POST ${API}/mansions/open`])
    root.unmount()
  })
})

describe('static replay build', () => {
  const built = existsSync(path.join(REPLAY_DIR, 'index.html'))

  it.skipIf(!built)('loads from its own files, requests only ./fixture.jsonl, and renders the same house read-only', async () => {
    const html = readFileSync(path.join(REPLAY_DIR, 'index.html'), 'utf8')
    const entry = /<script type="module"[^>]* src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
    expect(entry).toBeDefined()
    expect(readdirSync(path.join(REPLAY_DIR, 'assets'))).toContain(path.basename(entry!))
    const fixture = readFileSync(path.join(REPLAY_DIR, 'fixture.jsonl'), 'utf8')
    expect(fixture).toBe(readFileSync(path.join(REPO, 'fixtures/replay/demo.jsonl'), 'utf8'))

    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requested.push(url)
      if (url !== './fixture.jsonl') throw new TypeError(`The replay must not request ${url}.`)
      return new Response(fixture, { status: 200 })
    })
    for (const name of ['WebSocket', 'XMLHttpRequest', 'EventSource']) {
      vi.stubGlobal(
        name,
        class {
          constructor() {
            requested.push(name)
            throw new Error(`The replay must not open a ${name}.`)
          }
        },
      )
    }
    document.body.innerHTML = '<div id="root"></div>'
    await import(/* @vite-ignore */ pathToFileURL(path.join(REPLAY_DIR, entry!)).href)
    await openMansion()
    assertHouse('replay')
    expect(document.querySelector('[data-replay-start]')).not.toBeNull()
    expect(new Set(requested)).toEqual(new Set(['./fixture.jsonl']))
  })
})
