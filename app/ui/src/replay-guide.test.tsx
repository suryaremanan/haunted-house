// The Warden in the static replay (Spec 8, Requirements 3.10, 10.10 and 14.2).
// The replay entry is mounted with the SDK mapped to the replay stand-in, as
// the replay build maps it. It shows the Gate, the Warden and his balloon,
// Quiet Mode, the labels and the Word Book, and it asks the network for one
// thing only: the recording. In a recording he offers nothing that starts,
// decides or asks for a change.
//
// That he says the same in a recording as in the live house it was made from
// is Property 4 (core/house-guide-parity.property.test.ts) and, in the DOM,
// house-live-replay.test.tsx.
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import { GATE_STATUS } from './core/first-visit'
import { BUILT_TEXT } from './core/house-guide'
import { TERMS } from './core/house-words'
import { BUILT_TITLE } from './rooms/foyer/BuiltPage'
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

const says = () => document.querySelector<HTMLElement>('[data-guide-text]')?.textContent ?? null
const pose = () => document.querySelector<HTMLElement>('[data-guide-pose]')
const offers = () => Array.from(document.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (label) => label.textContent)
const press = async (name: string | RegExp) => act(async () => fireEvent.click(screen.getByRole('button', { name })))
const sheet = () => document.querySelector<HTMLElement>('.hh-ui-panel')

/** From the Gate into the recorded mansion, on what the Warden offers. */
async function enterRecording(container: HTMLElement) {
  await knock('Ada')
  await press('Watch demo-mansion get built')
  await screen.findByRole('region', { name: 'Mansion demo-mansion' })
  await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
}

/** Every choice of every room, the long list included: the room and the kind of each. */
async function everyChoiceOfEveryRoom(container: HTMLElement): Promise<string[]> {
  if (screen.getByRole('button', { name: 'Something else…' }).getAttribute('aria-expanded') !== 'true') await press('Something else…')
  const seen: string[] = []
  for (const room of Array.from(container.querySelectorAll<HTMLElement>('[data-room-control]'))) {
    await act(async () => fireEvent.click(room))
    for (const button of container.querySelectorAll('.hh-ui [data-guide-option]')) seen.push(`${room.getAttribute('data-room-control')}:${button.getAttribute('data-kind')}`)
    fireEvent.keyDown(document.body, { key: 'Escape' })
  }
  return seen
}

describe('the Warden in a recording', () => {
  it('stands at the Gate, greets by name in the hall, and leads into the recording, asking the network for the recording only', async () => {
    const container = await mountReplay()
    await screen.findByRole('button', { name: 'Knock' })
    // The Gate: the Warden, his words, how he stands.
    expect(says()).toBe(GATE_STATUS)
    expect(pose()!.textContent).toBe('The Warden is watching.')
    expect(container.querySelector('.hh-paint-warden')).toHaveAttribute('data-pose', 'watching')
    expect(container.querySelector('[data-guide-balloon]')).not.toBeNull()

    await knock('Ada')
    // A recording has nothing to build: no idea is asked for, and watching it is the first thing offered.
    expect(says()).toBe('Come in, Ada. This house holds a recording of demo-mansion being built.')
    expect(offers()).toEqual(['Watch demo-mansion get built', 'Step outside'])
    expect(container.querySelector('[data-idea-step]')).toBeNull()

    await press('Watch demo-mansion get built')
    await screen.findByRole('region', { name: 'Mansion demo-mansion' })
    await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-mode', 'replay')
    // Inside: the Warden in the room, with his words and how he stands in words.
    expect(container.querySelector('.hh-ui [data-guide-balloon]')).not.toBeNull()
    expect(says()).not.toBeNull()
    expect(pose()!.textContent).toMatch(/^The Warden /)
    // One request in all: the recording.
    expect(requested).toHaveLength(1)
    expect(requested[0]).toMatch(/fixture\.jsonl$/)
  })

  it('steps back and returns, shows Kiro’s words, labels what can be pressed and opens the Word Book, with no further request', async () => {
    const container = await mountReplay()
    await enterRecording(container)

    await press('Step back')
    expect(container.querySelector('.hh-ui [data-guide-balloon]')).toBeNull()
    expect(pose()!.textContent).toBe('The Warden has stepped back.')
    await press('Call the Warden')
    expect(container.querySelector('.hh-ui [data-guide-balloon]')).not.toBeNull()

    await press("Show Kiro's words: off")
    expect(screen.getByRole('button', { name: "Show Kiro's words: on" })).toHaveAttribute('aria-pressed', 'true')

    await press('Show me what I can press: off')
    const labels = container.querySelector<HTMLElement>('[data-object-labels]')!
    expect(labels.querySelectorAll('button').length).toBeGreaterThan(1)
    // A label opens what its object opens: the ledger is the room's sheet.
    await act(async () => fireEvent.click(labels.querySelector<HTMLElement>('[data-kind="ledger"]')!))
    expect(sheet()).not.toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })

    await press('Something else…')
    const book = container.querySelector<HTMLElement>('[data-word-book]')!
    expect(book.querySelectorAll('[data-term]')).toHaveLength(TERMS.length)
    for (const entry of TERMS) {
      const row = book.querySelector(`[data-term="${entry.id}"]`)!
      expect(row.textContent).toContain(entry.plain)
      expect(row.textContent).toContain(entry.kiro)
      expect(row.textContent).toContain(entry.about[0])
      expect(row.textContent).toContain(entry.about[1])
    }
    expect(requested).toHaveLength(1)
  })

  it('offers nothing that starts, decides or asks for a change, at the start, in the middle and at the end of the recording', async () => {
    const container = await mountReplay()
    await enterRecording(container)
    const mutating = (seen: readonly string[]) => seen.filter((entry) => /:(start|decide|ask)$/.test(entry))

    // At the start the first things offered are the recording's own playback, pressed on its own bar.
    expect(offers().slice(0, 2)).toEqual(['Play or pause the recording', 'Play it from the start'])
    expect(Array.from(container.querySelectorAll('[data-guide-primary] [data-guide-option]'), (button) => button.getAttribute('data-presses')).slice(0, 2)).toEqual(['replay:toggle', 'replay:restart'])
    const atStart = await everyChoiceOfEveryRoom(container)
    expect(atStart.length).toBeGreaterThan(20)
    expect(mutating(atStart)).toEqual([])

    // Step the recording forward through the Attic's own control, and look again; then to its end.
    const step = async (times: number) => {
      await act(async () => fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="attic"]')!))
      await waitFor(() => expect(container.querySelector('[data-guide-control="attic:next"]')).not.toBeNull())
      for (let turn = 0; turn < times; turn += 1) {
        const next = container.querySelector<HTMLElement>('[data-guide-control="attic:next"]')!
        if (next.getAttribute('aria-disabled') === 'true' || next.hasAttribute('disabled')) break
        await act(async () => fireEvent.click(next))
      }
      fireEvent.keyDown(document.body, { key: 'Escape' })
    }
    await step(25)
    expect(container.querySelector('.hh-ui-map [data-ghost-control]')).not.toBeNull()
    expect(mutating(await everyChoiceOfEveryRoom(container))).toEqual([])
    await step(200)
    expect(mutating(await everyChoiceOfEveryRoom(container))).toEqual([])
    // Still the one request.
    expect(requested).toHaveLength(1)
  })

  it('plays to the end of the story: the refused run, the narrower one released, every Door open and what was made', async () => {
    const container = await mountReplay()
    await enterRecording(container)
    // Step to the end through the Attic's own control.
    await act(async () => fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="attic"]')!))
    await waitFor(() => expect(container.querySelector('[data-guide-control="attic:next"]')).not.toBeNull())
    for (let turn = 0; turn < 200; turn += 1) {
      const next = container.querySelector<HTMLElement>('[data-guide-control="attic:next"]')!
      if (next.getAttribute('aria-disabled') === 'true' || next.hasAttribute('disabled')) break
      await act(async () => fireEvent.click(next))
    }
    fireEvent.keyDown(document.body, { key: 'Escape' })
    // Every Door on the map is open.
    const doors = Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map [data-door-control]'), (door) => door.getAttribute('data-door'))
    expect(doors.length).toBeGreaterThan(0)
    expect(new Set(doors)).toEqual(new Set(['open']))
    // The Warden says so, and offers what was made; pressing it shows the page.
    await act(async () => fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="study"]')!))
    expect(says()).toBe(BUILT_TEXT)
    await press('See what was made')
    const built = await waitFor(() => {
      const section = container.querySelector<HTMLElement>('[data-section="built"]')
      expect(section).not.toBeNull()
      return section!
    })
    expect(built).toHaveTextContent(BUILT_TITLE)
    expect(built).toHaveTextContent('requirements.md')
    expect(built).toHaveTextContent('design.md')
    expect(built).toHaveTextContent('tasks.md')
    expect(requested).toHaveLength(1)
  })
})
