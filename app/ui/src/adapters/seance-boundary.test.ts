// @vitest-environment node
// Structural boundaries of Spec 2 in the UI (task 7.3; Requirements 2.16,
// 10.1, 11.8, 12.7): the browser forwards raw Crew envelopes and owns neither
// normalization nor persistence, and nothing opens a socket of its own.
import { describe, expect, it } from 'vitest'
import { EVENT_TYPES } from '../core/seance-event'
import { SUBSCRIBED_CREW_EVENTS } from './seance-live'

const BRIDGE = '/src/adapters/seance-live.ts'

// Raw source of every shipped UI module (tests and declarations excluded).
const uiSources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '/replay/**/*.{ts,tsx}', '!**/*.test.{ts,tsx}', '!**/*.d.ts', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true },
)
// The backend package, to check the deferred direct WebSocket stays deferred.
const backendSources = import.meta.glob<string>('../../../backend/haunted_house/**/*.py', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Source with comments removed, so prose about a rule cannot break or satisfy it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Every quoted string literal in `source`. */
function stringLiterals(source: string): string[] {
  return Array.from(code(source).matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`/g), (match) => match[1] ?? match[2] ?? match[3])
}

/** Crew event names: the subscribed ones and the rest of the gateway's chat and tool vocabulary. */
const CREW_NAME = /^(chat_[a-z_]+|tool_call|tool_result|shared_crew\.decision|approval_resolved|subagent_[a-z_]+)$/

describe('Spec 2 browser boundaries', () => {
  const files = Object.keys(uiSources).sort()

  it('scans the shipped UI sources, including the bridge, the view and the replay stand-in', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        BRIDGE,
        '/src/core/ghost-state.ts',
        '/src/core/seance-log.ts',
        '/src/components/GhostStatusView.tsx',
        '/src/adapters/sdk-shim/seance-replay.ts',
      ]),
    )
    expect(Object.keys(backendSources).some((file) => file.endsWith('crew_event_normalizer.py'))).toBe(true)
  })

  it('names Crew events only in the raw bridge, as a subscription list', () => {
    const elsewhere = files
      .filter((file) => file !== BRIDGE)
      .flatMap((file) => stringLiterals(uiSources[file]).filter((text) => CREW_NAME.test(text)).map((text) => `${file}: ${text}`))
    expect(elsewhere).toEqual([])

    const inBridge = stringLiterals(uiSources[BRIDGE]).filter((text) => CREW_NAME.test(text))
    expect(inBridge.sort()).toEqual([...SUBSCRIBED_CREW_EVENTS].sort())
  })

  it('has no Crew-to-canonical mapping table: the bridge names no canonical Event_Type', () => {
    const literals = new Set(stringLiterals(uiSources[BRIDGE]))
    expect(EVENT_TYPES.filter((type) => literals.has(type))).toEqual([])
    // It never builds a candidate or computes identifiers for Crew facts.
    const bridge = code(uiSources[BRIDGE])
    expect(bridge).not.toMatch(/calculateEventId|calculateRecordId|parseAppEventCandidate|AppEventCandidate|event_type|source_type|identity_parts/)
    // And it reads no field of the callback data: `data` is only stored and sent.
    expect(bridge).not.toMatch(/\bdata\s*(\.|\[|\?\.)/)
  })

  it('has no module that normalizes Crew envelopes in the browser', () => {
    // The Python module is crew_event_normalizer; nothing like it may exist here.
    const named = /\b\w*(crew|envelope)\w*normaliz\w*|\bnormaliz\w*(crew|envelope)\w*/i
    expect(files.filter((file) => named.test(file))).toEqual([])
    expect(files.filter((file) => named.test(code(uiSources[file])))).toEqual([])
  })

  it('opens no WebSocket, EventSource or XMLHttpRequest anywhere in the UI', () => {
    // `EventSource` is also the name of a canonical schema type, so look for use, not the word.
    const opens =
      /\bnew\s+(WebSocket|EventSource|XMLHttpRequest)\b|\b(window|globalThis|self)\.(WebSocket|EventSource|XMLHttpRequest)\b|\bsendBeacon\b|\bwss?:\/\//
    expect(files.filter((file) => opens.test(code(uiSources[file])))).toEqual([])
    // The detector does fire on real use.
    expect(opens.test("const socket = new WebSocket('/api/ws')")).toBe(true)
    expect(opens.test('new EventSource(url)')).toBe(true)
  })

  it('writes ghost state only from the canonical merge', () => {
    // The bridge's one path to snapshots goes through mergeAcknowledged and projectLog.
    const bridge = code(uiSources[BRIDGE])
    expect(bridge.match(/snapshots:\s*new Map/g)).toHaveLength(2) // the initial empty state, and apply()
    expect(bridge).toMatch(/mergeAcknowledged\(/)
    expect(bridge).toMatch(/projectLog\(/)
    // forward() only queues and pumps.
    const forward = bridge.slice(bridge.indexOf('forward(type, data)'), bridge.indexOf('catchUp:'))
    expect(forward).toContain('queue.push({ type, data })')
    expect(forward).not.toMatch(/apply\(|snapshots|mergeAcknowledged|projectLog/)
  })

  it('keeps the direct backend Crew WebSocket deferred: the backend has no WebSocket client or server', () => {
    const offenders = Object.entries(backendSources)
      .filter(([, source]) =>
        /ws_connect|WebSocketResponse|ClientWebSocketResponse|import\s+websockets|from\s+websockets|subscribe_subagents|["']\/api\/ws["']/.test(
          source.replace(/#.*$/gm, ''),
        ),
      )
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
