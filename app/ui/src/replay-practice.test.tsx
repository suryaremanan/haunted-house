// Practice mode in the static replay (Spec 10, practice-house): a visitor
// makes each of the owner's decisions by keyboard, the house answers against
// the recording, and the only request is the recording. Mounted as the
// replay build mounts it, with the SDK mapped to the replay stand-in (setup
// as in replay-guide.test.tsx).
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import { PRACTICE_NOTE } from './core/practice'
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
/** Enter on a focused native button, as the keyboard would press it. */
const enter = async (button: HTMLElement) => {
  button.focus()
  expect(button).toHaveFocus()
  await act(async () => {
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.click(button)
  })
}

describe('practice mode in a recording', () => {
  it('states the run in numbers from the log, stops at each of the six decisions, answers against the recording, and asks for nothing but the recording', async () => {
    const container = await mountReplay()
    await knock('Ada')
    await press('Watch demo-mansion get built')
    await screen.findByRole('region', { name: 'Mansion demo-mansion' })
    await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))

    const board = screen.getByRole('region', { name: 'Practice' })
    expect(board.querySelector('[data-log-numbers]')!.textContent).toMatch(/^This recording holds 91 events from 7 ghosts\. The house stopped and waited for a person \d+ times\.$/)
    const toggle = board.querySelector<HTMLElement>('[data-practice-toggle]')!
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await enter(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(board.querySelector('[data-practice-note]')!.textContent).toBe(PRACTICE_NOTE)

    // Play on the replay's own clock, faked from here so the test runs it quickly.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const until = async (done: () => boolean) => {
      for (let step = 0; step < 2_000 && !done(); step += 1) await act(async () => vi.advanceTimersByTimeAsync(250))
      expect(done()).toBe(true)
    }
    // The recording stops before each decision and asks.
    await enter(screen.getByRole('button', { name: /^(Play|Resume)$/ }))
    const asked: string[] = []
    for (let decision = 0; decision < 6; decision += 1) {
      await until(() => board.querySelector('[data-practice-question]') !== null)
      const question = board.querySelector('.hh-ui-practice-question')!.textContent!
      asked.push(question)
      // Always refuse: the answer says what that means and what the owner chose.
      await enter(board.querySelector<HTMLElement>('[data-practice-choice="rejected"]')!)
      const answer = board.querySelector('[data-practice-answer]')!
      expect(answer.textContent).toContain('In the recording, the owner chose: ')
      await enter(board.querySelector<HTMLElement>('[data-practice-go-on]')!)
    }
    expect(asked[2]).toBe('Tinker 2 wants to run "bun test". Do you let it?')
    expect(asked[4]).toBe('Tinker 2 wants to run "bun test lantern.test.ts". Do you let it?')
    await until(() => (board.textContent ?? '').includes('You have made every decision in this recording.'))
    expect(requested).toHaveLength(1)
    expect(requested[0]).toMatch(/fixture\.jsonl$/)
    vi.useRealTimers()
  })
})
