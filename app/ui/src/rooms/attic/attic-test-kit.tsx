// Shared harness for the Attic DOM tests: mounts `useAtticReplay` and
// `AtticPanel` on the real SDK boundary, either on the replay stand-in exactly
// as the replay build maps it (one fetch of ./fixture.jsonl, every other way
// out of the page stubbed to throw) or on a live client double that serves the
// Spec 2 read route. Not a test file; imported by tests only.
import { act, render } from '@testing-library/react'
import { expect, vi } from 'vitest'
import demo from '../../../../../fixtures/replay/demo.jsonl?raw'
import type { AtticReplay } from '../../adapters/attic-replay'
import type { EffectiveMotion } from '../../core/motion-policy'
import { appEventToJson } from '../../core/seance-event'
import { parseEventLog } from '../../core/seance-log'

export const DEMO = demo
export const MANSION = 'demo-mansion'
export const FIXTURE_URL = './fixture.jsonl'
export const LOG = parseEventLog(demo).events
export const TOTAL = LOG.length

export interface MountOptions {
  readonly mode: 'replay' | 'live'
  /** The Event_Log text. Default: the committed demo recording. */
  readonly text?: string
  /** Replay: the fixture answers with this status. Live: the read route rejects with it. */
  readonly failWith?: number
  readonly motion?: EffectiveMotion
  readonly mansionId?: string
}

function blocked(name: string, unexpected: string[]) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The Attic must not open a ${name}.`)
    }
  }
}

/** Mounts the Attic. Fake timers are on; call `cleanupAttic` in afterEach. */
export async function mountAttic(options: MountOptions) {
  const text = options.text ?? demo
  const mansionId = options.mansionId ?? MANSION
  const unexpected: string[] = []
  const requests: string[] = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

  const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (options.mode !== 'replay' || url !== FIXTURE_URL) {
      unexpected.push(`fetch ${url}`)
      throw new TypeError(`The Attic must not request ${url}.`)
    }
    return options.failWith === undefined ? new Response(text, { status: 200 }) : new Response('gone', { status: options.failWith })
  })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest', unexpected))
  vi.stubGlobal('WebSocket', blocked('WebSocket', unexpected))
  vi.stubGlobal('EventSource', blocked('EventSource', unexpected))

  const hostCalls: string[] = []
  if (options.mode === 'replay') {
    // Same mapping as the replay build; registered per test so each gets a fresh stand-in.
    vi.doMock('@kirocrew/app-sdk', () => import('../../adapters/sdk-shim'))
  } else {
    const records = parseEventLog(text).events
    const api = {
      async get(path: string): Promise<unknown> {
        requests.push(`GET ${path}`)
        const match = /^\/apps\/haunted-house\/api\/mansions\/([^/]+)\/seance\/events\?after_sequence=(\d+)&limit=\d+$/.exec(path)
        if (match === null) {
          unexpected.push(`GET ${path}`)
          throw new Error(`The Attic must not request ${path}.`)
        }
        if (options.failWith !== undefined) {
          throw Object.assign(new Error('refused'), { status: options.failWith, body: '{"error":{"code":"internal"}}' })
        }
        const after = Number(match[2])
        return {
          events: records.filter((record) => record.sequence > after).map(appEventToJson),
          highest_sequence: records.at(-1)?.sequence ?? 0,
          diagnostics: [],
        }
      },
      post: async (path: string) => {
        unexpected.push(`POST ${path}`)
        throw new Error('The Attic must not write.')
      },
      put: async () => Promise.reject(new Error('no')),
      patch: async () => Promise.reject(new Error('no')),
      del: async () => Promise.reject(new Error('no')),
    }
    const hostHook = (name: string) => () => {
      hostCalls.push(name)
      return () => {}
    }
    vi.doMock('@kirocrew/app-sdk', () => ({
      useAppApi: () => api,
      useAppEvents: hostHook('useAppEvents'),
      useNotify: hostHook('useNotify'),
      useNavBadge: hostHook('useNavBadge'),
      useTheme: () => ({ mode: 'light', accent: '', colorTheme: 'default' }),
    }))
  }

  const { useAtticReplay } = await import('../../adapters/attic-replay')
  const { AtticPanel } = await import('./AtticPanel')
  const announcements: string[] = []
  let latest: AtticReplay | null = null
  function Harness({ open }: { open: boolean }) {
    const replay = useAtticReplay(mansionId)
    latest = replay
    return open ? (
      <AtticPanel replay={replay} motion={options.motion} onAnnounce={(message) => announcements.push(message)} />
    ) : (
      <p>Attic closed</p>
    )
  }
  const view = render(<Harness open />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  // The log is read in promise callbacks: let them settle.
  await advance(0)

  const root = () => view.container.querySelector<HTMLElement>('[data-attic-panel]')!
  const button = (action: string) => root().querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!
  return {
    view,
    root,
    announcements,
    unexpected,
    requests,
    hostCalls,
    fetchSpy,
    advance,
    replay: () => latest!,
    /** The one play control, whatever it is named right now. */
    playButton: () => root().querySelector<HTMLButtonElement>('button[data-variant="primary"]')!,
    button,
    range: () => root().querySelector<HTMLInputElement>('input[type="range"]')!,
    speed: (text: string) =>
      Array.from(root().querySelectorAll<HTMLLabelElement>('.hh-attic-speed label')).find((label) => label.textContent === text)!.querySelector('input')!,
    entries: () => Array.from(root().querySelectorAll<HTMLElement>('.hh-attic-entry')),
    current: () => root().querySelector<HTMLElement>('[aria-current="step"]'),
    setOpen: (open: boolean) => view.rerender(<Harness open={open} />),
    /** Lets playback run to the end: each step is scheduled by the render after the one before. */
    async playOut() {
      for (let step = 0; step <= TOTAL + 1 && latest!.state.status === 'playing'; step += 1) await advance(8_000)
      expect(latest!.state.status).toBe('complete')
    },
  }
}

export function cleanupAttic(): void {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
}
