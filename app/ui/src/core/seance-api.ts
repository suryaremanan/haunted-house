// Pure parsing of the signed séance routes' JSON (design.md "Server routes").
// Responses are untrusted until checked here: every event goes through the
// canonical parser, and diagnostics are reduced to known codes and bounded text.
// There is no Crew envelope interpretation in this file or anywhere in the UI.

import {
  DIAGNOSTIC_CODES,
  parseAppEvent,
  type AppEvent,
  type DiagnosticCode,
  type EventDiagnostic,
} from './seance-event'

const MANSIONS_BASE = '/apps/haunted-house/api/mansions'

/** Greatest page size the read route accepts. */
export const MAX_PAGE_LIMIT = 500

export function seanceIngestPath(mansionId: string): string {
  return `${MANSIONS_BASE}/${encodeURIComponent(mansionId)}/seance/ingest`
}

export function seanceEventsPath(mansionId: string, afterSequence: number, limit = MAX_PAGE_LIMIT): string {
  return `${MANSIONS_BASE}/${encodeURIComponent(mansionId)}/seance/events?after_sequence=${afterSequence}&limit=${limit}`
}

export function seanceReconcilePath(mansionId: string): string {
  return `${MANSIONS_BASE}/${encodeURIComponent(mansionId)}/seance/reconcile`
}

/** One response of the ingest, events or reconcile route, after validation. */
export interface CanonicalPage {
  /** Valid canonical records, in the order the backend returned them. */
  readonly events: readonly AppEvent[]
  /** Highest physical Sequence the backend reports for the Mansion. */
  readonly highestSequence: number
  /** Backend diagnostics first, then one `invalid_record` per event this parser refused. */
  readonly diagnostics: readonly EventDiagnostic[]
  /** Session slots the backend asks to reconcile from Crew history. */
  readonly reconcileSlots: readonly string[]
  /** Replay only: milliseconds until the recording presents its next event. */
  readonly nextEventInMs: number | null
}

export type CanonicalPageResult =
  | { readonly ok: true; readonly page: CanonicalPage }
  | { readonly ok: false; readonly diagnostic: EventDiagnostic }

const KNOWN_CODES: ReadonlySet<string> = new Set(DIAGNOSTIC_CODES)
const MAX_DETAIL_CHARACTERS = 160
const MAX_DIAGNOSTICS = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unexpected(detail: string): CanonicalPageResult {
  return { ok: false, diagnostic: { code: 'persistence_failed', safe_detail: detail } }
}

/** Keeps a backend diagnostic's known code and bounded single-line text; drops everything else. */
function parseDiagnostic(value: unknown): EventDiagnostic | null {
  if (!isRecord(value)) return null
  const code: DiagnosticCode =
    typeof value.code === 'string' && KNOWN_CODES.has(value.code) ? (value.code as DiagnosticCode) : 'persistence_failed'
  // The backend names its fixed category `reason`; our own adapters use `safe_detail`.
  const rawDetail = typeof value.safe_detail === 'string' ? value.safe_detail : value.reason
  const detail =
    typeof rawDetail === 'string'
      ? rawDetail.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, MAX_DETAIL_CHARACTERS)
      : ''
  const line = typeof value.line === 'number' && Number.isSafeInteger(value.line) && value.line > 0 ? value.line : null
  return line === null ? { code, safe_detail: detail } : { code, safe_detail: detail, line }
}

/** Validates one séance route response. Events that fail the canonical parser are not returned. */
export function parseCanonicalPage(body: unknown): CanonicalPageResult {
  if (!isRecord(body)) return unexpected('The backend sent an unexpected response.')
  if (!Array.isArray(body.events)) return unexpected('The backend response has no event list.')
  const highest = body.highest_sequence
  if (typeof highest !== 'number' || !Number.isSafeInteger(highest) || highest < 0) {
    return unexpected('The backend response has no valid highest Sequence.')
  }

  const diagnostics: EventDiagnostic[] = []
  if (Array.isArray(body.diagnostics)) {
    for (const raw of body.diagnostics.slice(0, MAX_DIAGNOSTICS)) {
      const diagnostic = parseDiagnostic(raw)
      if (diagnostic !== null) diagnostics.push(diagnostic)
    }
  }

  const events: AppEvent[] = []
  for (const raw of body.events) {
    const parsed = parseAppEvent(raw)
    if (parsed.ok) events.push(parsed.value)
    else if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(parsed.diagnostic)
  }

  const reconcileSlots = Array.isArray(body.reconcile_slots)
    ? body.reconcile_slots
        .filter((slot): slot is string => typeof slot === 'string' && slot.length > 0 && slot.length <= 160)
        .slice(0, MAX_RECONCILE_SLOTS)
    : []
  const hint = body.next_event_in_ms
  const nextEventInMs = typeof hint === 'number' && Number.isFinite(hint) && hint >= 0 ? hint : null

  return { ok: true, page: { events, highestSequence: highest, diagnostics, reconcileSlots, nextEventInMs } }
}

/** HTTP status of a rejected SDK request, when it carries one. */
export function httpStatusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null
}

const MAX_ERROR_BODY_CHARACTERS = 4_096

/**
 * The stable `error.code` of a rejected séance request (for example
 * `log_not_found`), read from the SDK error's unparsed JSON body. Null when the
 * body is absent, too large, not JSON, or not that shape.
 */
export function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const body = (error as { body?: unknown }).body
  if (typeof body !== 'string' || body.length > MAX_ERROR_BODY_CHARACTERS) return null
  try {
    const parsed: unknown = JSON.parse(body)
    if (!isRecord(parsed) || !isRecord(parsed.error)) return null
    const code = parsed.error.code
    return typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? code : null
  } catch {
    return null
  }
}

export interface RejectedEnvelope {
  /** Position of the envelope in the request's `envelopes` array. */
  readonly index: number
  /** The backend's fixed category, for example `unknown_session`. */
  readonly code: string
}

/**
 * Which envelopes of a refused ingest request the backend named, from the
 * error body's diagnostics. Null when the body does not name any by a valid
 * index, in which case the caller cannot tell the good envelopes from the bad.
 */
export function rejectedEnvelopesOf(error: unknown, batchSize: number): readonly RejectedEnvelope[] | null {
  if (typeof error !== 'object' || error === null) return null
  const body = (error as { body?: unknown }).body
  if (typeof body !== 'string' || body.length > 64 * 1024) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) return null
  const rejected = new Map<number, string>()
  for (const entry of parsed.diagnostics) {
    if (!isRecord(entry)) return null
    const { index, code } = entry
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= batchSize) return null
    if (typeof code !== 'string' || !/^[a-z_]{1,64}$/.test(code)) return null
    if (!rejected.has(index)) rejected.set(index, code)
  }
  if (rejected.size === 0) return null
  return Array.from(rejected, ([index, code]) => ({ index, code })).sort((left, right) => left.index - right.index)
}

/** Greatest number of slots one reconcile request may name. */
export const MAX_RECONCILE_SLOTS = 8

/**
 * Whether the backend refused the request itself (invalid envelope,
 * unregistered slot, oversized body), so sending it again cannot succeed.
 */
export function isRefusal(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429
}
