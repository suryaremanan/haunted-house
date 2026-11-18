// Bring your own séance in the static replay (Spec 11, own-seance): a
// visitor opens a séance log from their own computer in the Attic; a whole log
// replaces the recording and the page starts again on it, a broken file is
// refused in one sentence. The file is read in the page: the only request is
// the bundled recording. Setup as in replay-guide.test.tsx.
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import vectors from '../../../fixtures/seance/workflow-vectors.json'
import { OWN_SEANCE_NOT_A_LOG, checkOwnSeance } from './core/own-seance'
import { knock } from './test/first-visit-kit'

vi.setConfig({ testTimeout: 30_000 })

// replay/main.tsx does not export its root; this pass-through keeps each root so a test can unmount it.
const roots = vi.hoisted(() => [] as Root[])
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      roots.push(root)
      return root
    },
  }
})

/** Every request the page made. The recording is the only one a replay may make. */
let requested: string[]

beforeEach(() => {
  requested = []
  vi.resetModules()
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requested.push(url)
      if (!url.endsWith('fixture.jsonl')) throw new TypeError(`The replay must not request ${url}.`)
      return new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    }),
  )
  for (const transport of ['WebSocket', 'EventSource', 'XMLHttpRequest'] as const) {
    vi.stubGlobal(
      transport,
      class {
        constructor() {
          throw new TypeError(`The replay must not open a ${transport}.`)
        }
      },
    )
  }
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.getElementById('root')?.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

async function mountReplay(): Promise<HTMLElement> {
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  await act(async () => {
    await import('../replay/main')
  })
  return container
}


const press = async (name: string | RegExp) => act(async () => fireEvent.click(screen.getByRole('button', { name })))

async function openFile(text: string, name: string) {
  const input = await waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('[data-own-seance-input]')
    expect(found).not.toBeNull()
    return found!
  })
  const file = new File([text], name, { type: 'application/x-ndjson' })
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

describe('replay your own séance', () => {
  it('refuses a file that is not a séance log, then replays a whole log of another run, asking the network for nothing new', async () => {
    const container = await mountReplay()
    await knock('Ada')
    await press('Watch demo-mansion get built')
    await screen.findByRole('region', { name: 'Mansion demo-mansion' })
    await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
    await act(async () => fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="attic"]')!))

    await openFile('{"hello": "world"}\nnot an event\n', 'notes.jsonl')
    await waitFor(() => expect(document.querySelector('[data-own-seance-refusal]')?.textContent).toBe(OWN_SEANCE_NOT_A_LOG))
    expect(screen.getByRole('region', { name: 'Mansion demo-mansion' })).toBeInTheDocument()

    const other = (vectors.events as unknown[]).map((raw) => JSON.stringify(raw)).join('\n') + '\n'
    await openFile(other, 'vector-run.jsonl')
    // The page starts again on the opened log: back at the Gate, and its mansion is the one to watch.
    await screen.findByRole('button', { name: 'Knock' })
    await knock('Ada')
    await press(/Watch vector-mansion/)
    await screen.findByRole('region', { name: 'Mansion vector-mansion' })
    await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
    // The scrubber now spans the opened log's records of that mansion, not the 91 of the demo.
    const opened = checkOwnSeance(other, other.length)
    expect(opened.ok).toBe(true)
    const ofMansion = opened.ok ? opened.records.filter((event) => event.scope.mansion_id === 'vector-mansion').length : 0
    expect(document.querySelector('.hh-ui-replay-range')).toHaveAttribute('max', String(ofMansion))
    expect(requested).toHaveLength(1)
    expect(requested[0]).toMatch(/fixture\.jsonl$/)
    expect(demo.length).toBeGreaterThan(0)
  })
})
