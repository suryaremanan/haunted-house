export const SUPPORTED_CREW_EVENT_TYPES = [
  'chat_append',
  'chat_chunk',
  'chat_done',
  'chat_error',
  'chat_message',
  'chat_message_update',
  'chat_segment',
  'chat_status',
  'chat_thinking',
  'chat_variant_switch',
  'tool_call',
  'tool_result',
  'shared_crew.decision',
  'approval_resolved',
] as const

export type SupportedCrewEventType = (typeof SUPPORTED_CREW_EVENT_TYPES)[number]

export interface CrewEnvelope {
  type: SupportedCrewEventType
  data: unknown
}

export type PrimitiveShape = 'null' | 'boolean' | 'number' | 'string'

export type ValueShape =
  | PrimitiveShape
  | 'non_json'
  | 'depth_limit'
  | { kind: 'array'; length: number; items: readonly ValueShape[]; omitted_items: number }
  | {
      kind: 'object'
      fields: Readonly<Record<string, ValueShape>>
      omitted_fields: number
    }

export interface CallbackCapture {
  type: SupportedCrewEventType
  target_slot: '[target-slot]'
  bridge_preserved_data_reference: true
  data_shape: ValueShape
  facts?: Readonly<Record<string, boolean | number | string | null>>
}

export interface HistoryCapture {
  target_slot: '[target-slot]'
  declared_slot_count: number
  history_shape: ValueShape
}

export interface ProbeReport {
  probe: 'S2-callback-contract'
  schema_version: 1
  supported_event_types: readonly SupportedCrewEventType[]
  callback_counts: Readonly<Record<SupportedCrewEventType, number>>
  captures: readonly CallbackCapture[]
  chat_error: 'observed' | 'not_observed'
  tool_result_final: 'observed' | 'not_observed'
  tool_result_non_final: 'observed' | 'not_observed'
  reconnect: {
    sdk_callback: 'not_exposed_by_useAppEvents'
    mount_count: number
    online_indications: number
    visibility_return_indications: number
  }
  unsubscribe: {
    stimulus_completed: boolean
    callbacks_after_unmount: number
    result: 'not_run' | 'passed' | 'failed'
  }
  post_restart_history: HistoryCapture | null
}

const MAX_DEPTH = 5
const MAX_FIELDS = 32
const MAX_ARRAY_ITEMS = 8
const MAX_CAPTURES = 100
const MAX_HISTORY_SLOTS = 8

// Unknown field names are counted, not copied. This lets a live run discover
// schema drift without turning attacker-controlled keys into persisted text.
const SAFE_FIELD_NAMES = new Set([
  'accepted_at',
  'approved',
  'approval_id',
  'author',
  'category',
  'cls',
  'code',
  'content',
  'continuing',
  'data',
  'decision',
  'decision_id',
  'detail',
  'display',
  'entries',
  'error',
  'final',
  'gen',
  'history',
  'id',
  'input',
  'input_preview',
  'is_shell',
  'is_update',
  'key',
  'kind',
  'last',
  'login',
  'message',
  'messages',
  'meta',
  'mid',
  'name',
  'needs_input',
  'outcome',
  'output',
  'principal',
  'purpose',
  'revision',
  'role',
  'schema_version',
  'seq',
  'session_key',
  'slot',
  'state',
  'status',
  'text',
  'tool',
  'tool_call_id',
  'tool_input',
  'tool_name',
  'ts',
  'turn',
  'turn_gen',
  'type',
  'value',
])

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Wrap callback data without cloning, parsing, normalizing, or adding scope. */
export function makeCrewEnvelope(
  type: SupportedCrewEventType,
  data: unknown,
): CrewEnvelope {
  return { type, data }
}

/**
 * Return field/type metadata only. String and numeric values never enter a
 * capture, and unknown or credential-like field names are counted but omitted.
 */
export function summarizeValue(
  value: unknown,
  depth = 0,
  ancestors: ReadonlySet<object> = new Set(),
): ValueShape {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'non_json'
  if (typeof value === 'string') return 'string'
  if (typeof value !== 'object') return 'non_json'
  if (depth >= MAX_DEPTH || ancestors.has(value)) return 'depth_limit'

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(value)

  if (Array.isArray(value)) {
    const visible = value.slice(0, MAX_ARRAY_ITEMS)
    return {
      kind: 'array',
      length: Math.min(value.length, MAX_CAPTURES + 1),
      items: visible.map((item) => summarizeValue(item, depth + 1, nextAncestors)),
      omitted_items: Math.max(0, value.length - visible.length),
    }
  }

  const entries = Object.entries(value as Record<string, unknown>)
  const safeEntries = entries
    .filter(([key]) => SAFE_FIELD_NAMES.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_FIELDS)
  const fields = Object.fromEntries(
    safeEntries.map(([key, child]) => [
      key,
      summarizeValue(child, depth + 1, nextAncestors),
    ]),
  )
  return {
    kind: 'object',
    fields,
    omitted_fields: entries.length - safeEntries.length,
  }
}

function declaredSlot(data: unknown): string | null {
  const root = record(data)
  if (!root) return null
  if (typeof root.slot === 'string') return root.slot
  const decision = record(root.decision)
  return decision && typeof decision.session_key === 'string'
    ? decision.session_key
    : null
}

function callbackFacts(
  type: SupportedCrewEventType,
  data: unknown,
): Readonly<Record<string, boolean | number | string | null>> | undefined {
  const root = record(data)
  if (!root) return undefined
  if (type === 'tool_result') {
    return {
      final: typeof root.final === 'boolean' ? root.final : null,
      has_tool_call_id: typeof root.tool_call_id === 'string',
      has_output: Object.prototype.hasOwnProperty.call(root, 'output'),
    }
  }
  if (type === 'chat_error') {
    const categoryField = ['category', 'code', 'type', 'name'].find((key) =>
      Object.prototype.hasOwnProperty.call(root, key),
    )
    return {
      category_field: categoryField ?? 'none',
      has_message: Object.prototype.hasOwnProperty.call(root, 'message'),
      has_error: Object.prototype.hasOwnProperty.call(root, 'error'),
    }
  }
  if (type === 'chat_done') {
    return {
      continuing: typeof root.continuing === 'boolean' ? root.continuing : null,
      needs_input: typeof root.needs_input === 'boolean' ? root.needs_input : null,
    }
  }
  return undefined
}

/** Capture one target-owned callback. Unrelated and unscoped callbacks vanish. */
export function captureCrewCallback(
  envelope: CrewEnvelope,
  targetSlot: string,
): CallbackCapture | null {
  if (!targetSlot || declaredSlot(envelope.data) !== targetSlot) return null
  const facts = callbackFacts(envelope.type, envelope.data)
  return {
    type: envelope.type,
    target_slot: '[target-slot]',
    bridge_preserved_data_reference: true,
    data_shape: summarizeValue(envelope.data),
    ...(facts ? { facts } : {}),
  }
}

function collectDeclaredSlots(
  value: unknown,
  slots: Set<string>,
  depth = 0,
): void {
  if (depth >= MAX_DEPTH || slots.size >= MAX_HISTORY_SLOTS || value === null) return
  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_CAPTURES)) {
      collectDeclaredSlots(item, slots, depth + 1)
    }
    return
  }
  const root = record(value)
  if (!root) return
  for (const [key, child] of Object.entries(root).slice(0, MAX_FIELDS)) {
    if (
      (key === 'slot' || key === 'session_key' || (depth === 0 && key === 'key')) &&
      typeof child === 'string'
    ) {
      slots.add(child)
    } else {
      collectDeclaredSlots(child, slots, depth + 1)
    }
  }
}

/** Capture history only when every declared scope matches the requested slot. */
export function captureHistory(
  history: unknown,
  targetSlot: string,
): HistoryCapture | null {
  if (!targetSlot) return null
  const slots = new Set<string>()
  collectDeclaredSlots(history, slots)
  if (slots.size === 0 || [...slots].some((slot) => slot !== targetSlot)) return null
  return {
    target_slot: '[target-slot]',
    declared_slot_count: slots.size,
    history_shape: summarizeValue(history),
  }
}

export function appendBoundedCapture(
  captures: readonly CallbackCapture[],
  capture: CallbackCapture,
): readonly CallbackCapture[] {
  return [...captures, capture].slice(-MAX_CAPTURES)
}

function emptyCounts(): Record<SupportedCrewEventType, number> {
  return Object.fromEntries(
    SUPPORTED_CREW_EVENT_TYPES.map((type) => [type, 0]),
  ) as Record<SupportedCrewEventType, number>
}

export function buildProbeReport(input: {
  captures: readonly CallbackCapture[]
  mountCount: number
  onlineIndications: number
  visibilityReturnIndications: number
  unsubscribeStimulusCompleted: boolean
  callbacksAfterUnmount: number
  history: HistoryCapture | null
}): ProbeReport {
  const callbackCounts = emptyCounts()
  let chatError = false
  let finalResult = false
  let nonFinalResult = false
  for (const capture of input.captures) {
    callbackCounts[capture.type] += 1
    if (capture.type === 'chat_error') chatError = true
    if (capture.type === 'tool_result' && capture.facts?.final === true) finalResult = true
    if (capture.type === 'tool_result' && capture.facts?.final === false) nonFinalResult = true
  }
  const unsubscribeResult = !input.unsubscribeStimulusCompleted
    ? 'not_run'
    : input.callbacksAfterUnmount === 0
      ? 'passed'
      : 'failed'
  return {
    probe: 'S2-callback-contract',
    schema_version: 1,
    supported_event_types: SUPPORTED_CREW_EVENT_TYPES,
    callback_counts: callbackCounts,
    captures: input.captures,
    chat_error: chatError ? 'observed' : 'not_observed',
    tool_result_final: finalResult ? 'observed' : 'not_observed',
    tool_result_non_final: nonFinalResult ? 'observed' : 'not_observed',
    reconnect: {
      sdk_callback: 'not_exposed_by_useAppEvents',
      mount_count: input.mountCount,
      online_indications: input.onlineIndications,
      visibility_return_indications: input.visibilityReturnIndications,
    },
    unsubscribe: {
      stimulus_completed: input.unsubscribeStimulusCompleted,
      callbacks_after_unmount: input.callbacksAfterUnmount,
      result: unsubscribeResult,
    },
    post_restart_history: input.history,
  }
}

export type Subscribe = (
  event: SupportedCrewEventType,
  callback: (data: unknown) => void,
) => () => void

/** Stand-in seam used by the automated contract test; live React uses the hook. */
export function subscribeSupportedCallbacks(
  subscribe: Subscribe,
  targetSlot: string,
  onCapture: (capture: CallbackCapture) => void,
): () => void {
  const unsubscribe = SUPPORTED_CREW_EVENT_TYPES.map((type) =>
    subscribe(type, (data) => {
      const envelope = makeCrewEnvelope(type, data)
      const capture = captureCrewCallback(envelope, targetSlot)
      if (capture) onCapture(capture)
    }),
  )
  return () => {
    for (const stop of unsubscribe) stop()
  }
}
