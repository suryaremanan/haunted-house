import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  SUPPORTED_CREW_EVENT_TYPES,
  appendBoundedCapture,
  buildProbeReport,
  captureCrewCallback,
  captureHistory,
  makeCrewEnvelope,
  subscribeSupportedCallbacks,
  summarizeValue,
  type Subscribe,
  type SupportedCrewEventType,
} from './s2-callback-contract.ts'

class MemoryEventSource {
  private readonly listeners = new Map<
    SupportedCrewEventType,
    Set<(data: unknown) => void>
  >()

  subscribe: Subscribe = (event, callback) => {
    const callbacks = this.listeners.get(event) ?? new Set()
    callbacks.add(callback)
    this.listeners.set(event, callbacks)
    return () => callbacks.delete(callback)
  }

  emit(event: SupportedCrewEventType, data: unknown): void {
    for (const callback of this.listeners.get(event) ?? []) callback(data)
  }
}

const slot = 'hh-s2-probe'

function callbackData(type: SupportedCrewEventType): unknown {
  if (type === 'shared_crew.decision') {
    return { decision: { session_key: slot, state: 'resolved' } }
  }
  if (type === 'tool_result') {
    return { slot, tool_call_id: 'tool-probe', output: 'synthetic', final: true }
  }
  if (type === 'chat_error') {
    return { slot, code: 'synthetic', message: 'synthetic failure' }
  }
  return { slot, type, content: 'synthetic' }
}

test('wraps the callback data by reference without browser interpretation', () => {
  const data = { slot, nested: { value: 1 } }
  const envelope = makeCrewEnvelope('chat_message', data)

  assert.equal(envelope.type, 'chat_message')
  assert.equal(envelope.data, data)
  assert.deepEqual(envelope, { type: 'chat_message', data })
})

test('subscribes every supported callback and unsubscribe stops delivery', () => {
  const source = new MemoryEventSource()
  const captures: unknown[] = []
  const unsubscribe = subscribeSupportedCallbacks(source.subscribe, slot, (capture) => {
    captures.push(capture)
  })

  for (const type of SUPPORTED_CREW_EVENT_TYPES) {
    source.emit(type, callbackData(type))
  }
  assert.deepEqual(
    captures.map((capture) => (capture as { type: string }).type),
    SUPPORTED_CREW_EVENT_TYPES,
  )

  unsubscribe()
  for (const type of SUPPORTED_CREW_EVENT_TYPES) {
    source.emit(type, callbackData(type))
  }
  assert.equal(captures.length, SUPPORTED_CREW_EVENT_TYPES.length)
})

test('drops unrelated and unscoped callbacks', () => {
  assert.equal(
    captureCrewCallback(
      makeCrewEnvelope('chat_status', { slot: 'another-session', status: 'working' }),
      slot,
    ),
    null,
  )
  assert.equal(
    captureCrewCallback(makeCrewEnvelope('chat_status', { status: 'working' }), slot),
    null,
  )
})

test('captures finality and error field presence without callback values', () => {
  const privatePath = ['', 'Users', 'example', 'private.txt'].join('/')
  const finalCapture = captureCrewCallback(
    makeCrewEnvelope('tool_result', {
      slot,
      tool_call_id: 'private-tool-id',
      output: `sensitive ${privatePath}`,
      final: true,
      authorization: '<credential>',
    }),
    slot,
  )
  const partialCapture = captureCrewCallback(
    makeCrewEnvelope('tool_result', {
      slot,
      tool_call_id: 'private-tool-id',
      output: 'partial private output',
      final: false,
    }),
    slot,
  )
  const errorCapture = captureCrewCallback(
    makeCrewEnvelope('chat_error', {
      slot,
      code: 'private-provider-code',
      message: `private failure ${privatePath}`,
    }),
    slot,
  )

  assert.equal(finalCapture?.facts?.final, true)
  assert.equal(partialCapture?.facts?.final, false)
  assert.equal(errorCapture?.facts?.category_field, 'code')
  const encoded = JSON.stringify([finalCapture, partialCapture, errorCapture])
  assert.equal(encoded.includes('private-tool-id'), false)
  assert.equal(encoded.includes('private-provider-code'), false)
  assert.equal(encoded.includes('private failure'), false)
  assert.equal(encoded.includes(privatePath), false)
  assert.equal(encoded.includes('authorization'), false)
})

test('history capture is bounded, shape-only, and target scoped', () => {
  const history = {
    slot,
    messages: [
      {
        slot,
        role: 'user',
        content: 'private request',
        meta: { mid: 'private-mid', authorization: '<credential>' },
      },
      {
        slot,
        role: 'assistant',
        content: 'private response',
      },
    ],
  }
  const capture = captureHistory(history, slot)

  assert.ok(capture)
  assert.equal(capture.target_slot, '[target-slot]')
  assert.equal(capture.declared_slot_count, 1)
  const encoded = JSON.stringify(capture)
  assert.equal(encoded.includes('private request'), false)
  assert.equal(encoded.includes('private response'), false)
  assert.equal(encoded.includes('private-mid'), false)
  assert.equal(encoded.includes('<credential>'), false)
  assert.equal(captureHistory(history, 'another-session'), null)
  assert.equal(
    captureHistory(
      { slot, messages: [{ slot: 'another-session', content: 'not ours' }] },
      slot,
    ),
    null,
  )
})

test('shape capture caps arrays, object fields, and recursion', () => {
  const shape = summarizeValue({
    messages: Array.from({ length: 200 }, (_, index) => ({ seq: index })),
  })
  const encoded = JSON.stringify(shape)

  assert.ok(encoded.length < 2_000)
  assert.match(encoded, /"omitted_items":192/)
  const cycle: { value?: unknown } = {}
  cycle.value = cycle
  assert.match(JSON.stringify(summarizeValue(cycle)), /depth_limit/)
})

test('report distinguishes final and non-final results and unsubscribe outcome', () => {
  const captures = [
    captureCrewCallback(
      makeCrewEnvelope('tool_result', { slot, tool_call_id: 'one', final: true }),
      slot,
    ),
    captureCrewCallback(
      makeCrewEnvelope('tool_result', { slot, tool_call_id: 'one', final: false }),
      slot,
    ),
    captureCrewCallback(makeCrewEnvelope('chat_error', { slot, code: 'failed' }), slot),
  ].filter((capture) => capture !== null)
  const bounded = captures.reduce(
    (current, capture) => appendBoundedCapture(current, capture),
    [] as typeof captures,
  )
  const report = buildProbeReport({
    captures: bounded,
    mountCount: 1,
    onlineIndications: 0,
    visibilityReturnIndications: 0,
    unsubscribeStimulusCompleted: true,
    callbacksAfterUnmount: 0,
    history: null,
  })

  assert.equal(report.chat_error, 'observed')
  assert.equal(report.tool_result_final, 'observed')
  assert.equal(report.tool_result_non_final, 'observed')
  assert.equal(report.unsubscribe.result, 'passed')
  assert.equal(report.reconnect.sdk_callback, 'not_exposed_by_useAppEvents')
})

type AssumptionFixture = {
  assumption_id: string
  outcome: string
  unavailable_fields: string[]
  fallback_by_field: Record<string, Record<string, unknown>>
  browser_interpretation?: boolean
  evidence?: Record<string, unknown>
}

type CallbackFixture = AssumptionFixture & {
  callback_cases: Array<{ type: SupportedCrewEventType; data: unknown }>
}

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as T
}

const fallbackFixtureNames = [
  's2-a2-failure-result-fields.json',
  's2-a3-reconnect-indication.json',
  's2-a4-history-completeness.json',
] as const

test('S2-A1 fixture callbacks round-trip through exact type and data envelopes', () => {
  const fixture = readFixture<CallbackFixture>('s2-a1-callback-envelope.json')

  assert.equal(fixture.assumption_id, 'S2-A1')
  assert.deepEqual(
    fixture.callback_cases.map(({ type }) => type),
    SUPPORTED_CREW_EVENT_TYPES,
  )
  for (const callback of fixture.callback_cases) {
    const envelope = makeCrewEnvelope(callback.type, callback.data)
    assert.equal(envelope.data, callback.data)
    assert.deepEqual(envelope, callback)
    assert.deepEqual(JSON.parse(JSON.stringify(envelope)), callback)
  }
})

test('S2-A2 through S2-A4 select a bounded fallback for every unavailable field', () => {
  const fixtures = fallbackFixtureNames.map((name) => readFixture<AssumptionFixture>(name))

  for (const fixture of fixtures) {
    assert.equal(fixture.browser_interpretation, false)
    assert.deepEqual(
      Object.keys(fixture.fallback_by_field).sort(),
      [...fixture.unavailable_fields].sort(),
      `${fixture.assumption_id} must resolve every unavailable field exactly once`,
    )
  }

  assert.deepEqual(
    fixtures[0].unavailable_fields.map((field) => fixtures[0].fallback_by_field[field]?.policy),
    [
      'stable_identifiers_and_safe_categories_only',
      'stable_identifiers_and_safe_categories_only',
    ],
  )
  assert.deepEqual(fixtures[1].fallback_by_field['sdk.reconnect_signal']?.triggers, [
    'mount',
    'visibility_return',
    'detected_source_gap',
    'bounded_poll_while_runs_active',
  ])
  assert.equal(
    fixtures[2].fallback_by_field['post_restart_history.complete_fact_recovery']?.policy,
    'recover_proved_facts_only',
  )
  assert.equal(
    fixtures[2].fallback_by_field['post_restart_history.complete_fact_recovery']?.diagnostic,
    'history_partial',
  )
  assert.equal(
    fixtures[2].fallback_by_field['post_restart_history.complete_fact_recovery']
      ?.preserve_latest_replayable_snapshot,
    true,
  )
})

test('the verified S6 baseline remains the referenced callback evidence', () => {
  const resultFixture = readFixture<AssumptionFixture>('s2-a2-failure-result-fields.json')
  const historyFixture = readFixture<AssumptionFixture>('s2-a4-history-completeness.json')
  const baseline = readFileSync(
    new URL('../../../fixtures/s6-app-session-approval.jsonl', import.meta.url),
    'utf8',
  )
  const expectedDigest = resultFixture.evidence?.baseline_sha256

  assert.equal(typeof expectedDigest, 'string')
  assert.equal(historyFixture.evidence?.baseline_sha256, expectedDigest)
  assert.equal(createHash('sha256').update(baseline).digest('hex'), expectedDigest)

  const supported = new Set<string>(SUPPORTED_CREW_EVENT_TYPES)
  const frames = baseline
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { frame: { type: string; data: unknown } })
    .map(({ frame }) => frame)
    .filter(({ type }) => supported.has(type))

  for (const frame of frames) {
    const envelope = makeCrewEnvelope(frame.type as SupportedCrewEventType, frame.data)
    assert.equal(envelope.data, frame.data)
    assert.deepEqual(JSON.parse(JSON.stringify(envelope)), frame)
  }

  const observed = new Set(frames.map(({ type }) => type))
  for (const type of [
    'chat_message',
    'chat_message_update',
    'chat_status',
    'chat_segment',
    'chat_chunk',
    'chat_done',
    'tool_call',
    'tool_result',
    'shared_crew.decision',
    'approval_resolved',
  ]) {
    assert.equal(observed.has(type), true, `S6 baseline must retain ${type}`)
  }
  assert.equal(observed.has('chat_error'), false)
  assert.equal(
    frames
      .filter(({ type }) => type === 'tool_result')
      .every(({ data }) => (data as { final?: unknown }).final === true),
    true,
  )
})
