// Pure parsing for the backend status check. No SDK, React, network or clock.
// The adapter (src/adapters/sdk.ts) feeds it the reply of
// GET /apps/haunted-house/api/whoami, or the error the SDK client threw.

/** Our backend's status route, reached through the gateway proxy. */
export const WHOAMI_PATH = '/apps/haunted-house/api/whoami'

export const GATEWAY_ERROR_KINDS = ['timeout', 'unreachable', 'denied', 'config'] as const

export type GatewayErrorKind = (typeof GATEWAY_ERROR_KINDS)[number]

export type GatewayStatus = { version: string } | { error: GatewayErrorKind }

export type BackendStatus =
  | { kind: 'loading' }
  | { kind: 'ok'; gateway: GatewayStatus }
  | { kind: 'unreachable'; status?: number; message: string }

/** Values of `backend` that mean the backend answered. `replay` comes from the replay stand-in. */
const REACHABLE_BACKENDS = new Set(['ok', 'replay'])

export const UNEXPECTED_REPLY = 'Backend sent an unexpected reply.'
export const REQUEST_FAILED = 'Request failed.'

/** Longest error message kept from a thrown error, so a long body can't flood the page. */
const MAX_MESSAGE_LENGTH = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGatewayErrorKind(value: unknown): value is GatewayErrorKind {
  return typeof value === 'string' && (GATEWAY_ERROR_KINDS as readonly string[]).includes(value)
}

function parseGateway(value: unknown): GatewayStatus | null {
  if (!isRecord(value)) return null
  if (typeof value.version === 'string' && value.version.trim() !== '') {
    return { version: value.version.trim() }
  }
  if (isGatewayErrorKind(value.error)) return { error: value.error }
  return null
}

/**
 * Turns a whoami reply into a status. Expected shapes:
 * `{"backend":"ok","gateway":{"version":"0.12.1"}}`,
 * `{"backend":"ok","gateway":{"error":"timeout"}}`, or the replay
 * stand-in's `{"backend":"replay","gateway":{"version":"replay"}}`.
 * Anything else counts as unreachable, because we can't trust what answered.
 */
export function parseWhoami(body: unknown): BackendStatus {
  if (!isRecord(body)) return { kind: 'unreachable', message: UNEXPECTED_REPLY }
  if (typeof body.backend !== 'string' || !REACHABLE_BACKENDS.has(body.backend)) {
    return { kind: 'unreachable', message: UNEXPECTED_REPLY }
  }
  const gateway = parseGateway(body.gateway)
  if (gateway === null) return { kind: 'unreachable', message: UNEXPECTED_REPLY }
  return { kind: 'ok', gateway }
}

function httpStatusOf(err: unknown): number | undefined {
  if (!isRecord(err) && !(err instanceof Error)) return undefined
  const status = (err as { status?: unknown }).status
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
    return status
  }
  return undefined
}

function messageOf(err: unknown): string {
  const raw =
    err instanceof Error || isRecord(err) ? (err as { message?: unknown }).message : undefined
  if (typeof raw !== 'string') return REQUEST_FAILED
  const trimmed = raw.trim()
  if (trimmed === '') return REQUEST_FAILED
  return trimmed.length > MAX_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : trimmed
}

/**
 * Turns whatever the SDK client threw into an unreachable status. Crew's client
 * throws on non-2xx with an error carrying a numeric `status`; network failures
 * and out-of-scope paths throw without one.
 */
export function statusFromError(err: unknown): BackendStatus {
  const status = httpStatusOf(err)
  const message = messageOf(err)
  return status === undefined ? { kind: 'unreachable', message } : { kind: 'unreachable', status, message }
}
