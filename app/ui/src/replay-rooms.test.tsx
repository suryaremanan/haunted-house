// Replay of the artifact-first room panels (Spec 5 tasks 9.6 and 9.7). The
// house is mounted on the replay stand-in exactly as the replay build maps it.
// The rooms must show what the recording records about each document, offer no
// mutation and no session navigation, and reach nothing but the recording.
// **Validates: Requirements 10.6, 10.7, 11.1, 11.3, 11.5**
import { act, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import demoWorkflow from '../../../fixtures/replay/demo.workflow.json'
import { parseWorkflowProjection, type WorkflowProjection } from './core/workflow-projection'

const FIXTURE_URL = './fixture.jsonl'
const MANSION = 'demo-mansion'

let unexpected: string[] = []

const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url !== FIXTURE_URL) {
    unexpected.push(`fetch ${url}`)
    throw new TypeError(`The replay must not request ${url}.`)
  }
  return new Response(demo, { status: 200 })
})

function blocked(name: string) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The replay must not open a ${name}.`)
    }
  }
}

beforeEach(() => {
  // Same mapping as the replay build; registered per test so each gets a fresh stand-in.
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  unexpected = []
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

async function mountReplayHouse() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const shim = await import('./adapters/sdk-shim')
  const adapter = await import('./adapters/sdk')
  expect(adapter.useAppApi).toBe(shim.useAppApi)
  const { House } = await import('./rooms/house/House')
  const announcements: string[] = []
  // The page passes the Mansion's Project_Spec, which is the Mansion's own name.
  const view = render(<House mansionId={MANSION} specName={MANSION} onAnnounce={(message) => announcements.push(message)} />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  const playAll = async () => {
    for (let step = 0; step < 12; step += 1) await advance(20_000)
  }
  const open = async (name: string) => {
    const button = within(view.container).getByRole('button', { name: new RegExp(`^${name}\\.`) })
    fireEvent.click(button)
    await advance(500)
    return within(view.container).getByRole('region', { name })
  }
  return { view, shim, announcements, advance, playAll, open }
}

function backendFinal(): WorkflowProjection {
  const parsed = parseWorkflowProjection((demoWorkflow.steps as { workflow: unknown }[]).at(-1)!.workflow, MANSION)
  if (!parsed.ok) throw new Error(`backend projection refused at ${parsed.path}`)
  return parsed.projection
}

describe('replay rooms', () => {
  it('shows each document first with the path, revision and digest the recording holds, and no invented text', async () => {
    const { view, playAll, open } = await mountReplayHouse()
    await playAll()
    const final = backendFinal()

    for (const [room, title, index] of [
      ['Study', 'Requirements document', 0],
      ['Drafting Room', 'Design document', 1],
    ] as const) {
      const panel = await open(room)
      const proposal = final.phases[index].door.proposal!
      const artifact = within(panel).getByRole('article', { name: title })
      // The first thing in the room after its heading row is the document.
      expect(panel.querySelector('.hh-room-panel-head + *')?.contains(artifact)).toBe(true)
      expect(artifact).toHaveTextContent(proposal.documentPath)
      expect(artifact).toHaveTextContent(`Revision ${proposal.artifactRevision.revision} (${proposal.artifactRevision.sizeBytes.toLocaleString('en-US')} bytes)`)
      expect(artifact.querySelector('[data-digest]')).toHaveTextContent(proposal.artifactRevision.sha256)
      expect(artifact.querySelector('[data-content="none"]')).toHaveTextContent('this recording has no text to show')
      expect(within(artifact).queryByRole('region')).toBeNull()
      expect(artifact).toHaveTextContent('Not checked here')
      // The room answer was read (from the recording), so there is no "could not be read" note.
      expect(panel.querySelector('[data-output-note]')).toBeNull()
      // Ghost and Door state follow the document.
      const door = within(panel).getByText(/^Open door:/)
      expect(artifact.compareDocumentPosition(door) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }

    // The task plan was written but never proposed at its Door: the recording names no revision for it.
    const workshop = await open('Workshop')
    const plan = within(workshop).getByRole('article', { name: 'Task plan' })
    expect(plan).toHaveTextContent('Not written yet')
    // Its place is the spec folder the recorded Door proposals name, not a guess from the mansion name.
    expect(plan).toHaveTextContent('.kiro/specs/demo/tasks.md')
    expect(plan).not.toHaveTextContent('.kiro/specs/demo-mansion/')
    expect(within(workshop).queryByRole('region', { name: 'Task board' })).toBeNull()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
    view.unmount()
  })

  it('offers no mutation and no session navigation, and sends nothing when pressed anyway', async () => {
    const { view, shim, playAll, open } = await mountReplayHouse()
    await playAll()
    for (const room of ['Study', 'Drafting Room', 'Workshop']) {
      const panel = await open(room)
      // No revision request, no Workshop start, no cancel, no retry, nothing to type.
      expect(within(panel).queryByRole('button', { name: /Ask for a revision|selected task|^Cancel |^Retry /i })).toBeNull()
      expect(panel.querySelectorAll('textarea, input')).toHaveLength(0)
      // The recording carries no session capability, so there is no session link to follow.
      expect(panel.querySelectorAll('[data-session-link="on"]')).toHaveLength(0)
      // Every control that could change something is off; pressing it does nothing.
      for (const button of within(panel).getAllByRole('button')) {
        if (button.textContent?.includes('Close room')) continue
        expect(button, button.textContent ?? '').toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(button)
      }
    }
    expect(shim.replayChatLauncherCalls).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('announces nothing about room output: a recording interrupts nobody beyond what the house already says', async () => {
    const { view, announcements, playAll, open } = await mountReplayHouse()
    await playAll()
    const before = announcements.length
    await open('Study')
    await open('Workshop')
    expect(announcements).toHaveLength(before)
    expect(announcements.join(' ')).not.toMatch(/room's output|recording has no text/i)
    view.unmount()
  })
})
