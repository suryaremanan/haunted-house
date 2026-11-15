// Pure parsing for Mansion API responses. No SDK, React, network, filesystem,
// or clock access. Adapters pass unknown response bodies through these parsers.

export const MANSION_SCHEMA_VERSION = 1 as const
export const MAX_MANSION_NAME_LENGTH = 40
export const MAX_MANSION_MESSAGE_LENGTH = 200
export const UNEXPECTED_MANSION_RESPONSE = 'Mansion service sent an unexpected reply.'
export const MANSION_REQUEST_FAILED = 'Mansion request failed.'

export const MANSION_STATUSES = ['ready', 'missing', 'conflict'] as const
export type MansionStatus = (typeof MANSION_STATUSES)[number]

export const CREATE_MANSION_OUTCOMES = ['created', 'existing_compatible'] as const
export type CreateMansionOutcome = (typeof CREATE_MANSION_OUTCOMES)[number]

export const MANSION_API_ERROR_CODES = [
  'invalid_request',
  'invalid_mansion_name',
  'unsafe_mansion_root',
  'symlink_escape',
  'mansion_conflict',
  'mansion_missing',
  'mansion_not_registered',
  'metadata_unavailable',
  'filesystem_error',
] as const
export type MansionApiErrorCode = (typeof MANSION_API_ERROR_CODES)[number]

export interface MansionDescriptor {
  readonly name: string
  readonly projectSpec: string
  readonly displayPath: string
  readonly status: MansionStatus
}

export interface MansionListResponse {
  readonly schemaVersion: typeof MANSION_SCHEMA_VERSION
  readonly mansions: MansionDescriptor[]
}

export interface CreateMansionResponse {
  readonly outcome: CreateMansionOutcome
  readonly mansion: MansionDescriptor
}

export interface OpenMansionResponse {
  readonly mansion: MansionDescriptor
}

export interface MansionApiError {
  readonly error: {
    readonly code: MansionApiErrorCode
    readonly message: string
  }
}

/** A response did not match the documented Mansion API contract. */
export class MansionApiParseError extends Error {
  constructor() {
    super(UNEXPECTED_MANSION_RESPONSE)
    this.name = 'MansionApiParseError'
  }
}

const ERROR_COPY: Record<MansionApiErrorCode, string> = {
  invalid_request: 'The mansion request was not understood.',
  invalid_mansion_name: 'Use 1–40 lowercase letters, numbers, and single hyphens.',
  unsafe_mansion_root: 'Mansion storage is not configured safely.',
  symlink_escape: 'The mansion path is not safe to use.',
  mansion_conflict: 'Existing content conflicts with this mansion. Nothing was changed.',
  mansion_missing: 'This mansion is missing from storage.',
  mansion_not_registered: 'This mansion is not registered. Refresh the list and try again.',
  metadata_unavailable: 'Mansion records are unavailable. Try again.',
  filesystem_error: 'Mansion storage could not be accessed.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

/** The exact, non-normalizing Mansion_Name language used by response parsing. */
export function isMansionName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MANSION_NAME_LENGTH) {
    return false
  }
  const match = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(value)
  return match?.[0] === value
}

function isHomeRelativeDisplayPath(value: unknown, name: string): value is string {
  if (typeof value !== 'string' || !value.startsWith('~/') || value.includes('\\')) return false
  const components = value.slice(2).split('/')
  return (
    components.length > 0 &&
    components.every(
      (component) =>
        component !== '' &&
        component !== '.' &&
        component !== '..' &&
        !/[\u0000-\u001f\u007f]/.test(component),
    ) &&
    components.at(-1) === name
  )
}

function parseMansionDescriptor(value: unknown): MansionDescriptor {
  if (!isRecord(value)) throw new MansionApiParseError()
  const { name, projectSpec, displayPath, status } = value
  if (
    !isMansionName(name) ||
    !isMansionName(projectSpec) ||
    projectSpec !== name ||
    !isHomeRelativeDisplayPath(displayPath, name) ||
    !isOneOf(status, MANSION_STATUSES)
  ) {
    throw new MansionApiParseError()
  }
  return { name, projectSpec, displayPath, status }
}

/** Parses `GET /api/mansions`. Extra success fields are ignored for forward compatibility. */
export function parseMansionListResponse(value: unknown): MansionListResponse {
  if (!isRecord(value) || value.schemaVersion !== MANSION_SCHEMA_VERSION || !Array.isArray(value.mansions)) {
    throw new MansionApiParseError()
  }
  const mansions = value.mansions.map(parseMansionDescriptor)
  if (new Set(mansions.map(({ name }) => name)).size !== mansions.length) {
    throw new MansionApiParseError()
  }
  return { schemaVersion: MANSION_SCHEMA_VERSION, mansions }
}

/** Parses `POST /api/mansions`. A successful create/adoption must describe a ready mansion. */
export function parseCreateMansionResponse(value: unknown): CreateMansionResponse {
  if (!isRecord(value) || !isOneOf(value.outcome, CREATE_MANSION_OUTCOMES)) {
    throw new MansionApiParseError()
  }
  const mansion = parseMansionDescriptor(value.mansion)
  if (mansion.status !== 'ready') throw new MansionApiParseError()
  return { outcome: value.outcome, mansion }
}

/** Parses `POST /api/mansions/open`. Opening can only succeed for a ready mansion. */
export function parseOpenMansionResponse(value: unknown): OpenMansionResponse {
  if (!isRecord(value)) throw new MansionApiParseError()
  const mansion = parseMansionDescriptor(value.mansion)
  if (mansion.status !== 'ready') throw new MansionApiParseError()
  return { mansion }
}

/**
 * Keeps arbitrary adapter failure text on one safe, bounded line. API error
 * bodies use fixed copy by stable code instead of displaying server-provided text.
 */
export function boundedMansionMessage(
  value: unknown,
  fallback = MANSION_REQUEST_FAILED,
): string {
  if (typeof value !== 'string') return fallback
  const oneLine = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (oneLine === '') return fallback
  return oneLine.length > MAX_MANSION_MESSAGE_LENGTH
    ? `${oneLine.slice(0, MAX_MANSION_MESSAGE_LENGTH - 1)}…`
    : oneLine
}

/** Parses the exact stable error envelope and replaces its body text with fixed safe copy. */
export function parseMansionApiError(value: unknown): MansionApiError {
  if (!isRecord(value) || !hasOnlyKeys(value, ['error']) || !isRecord(value.error)) {
    throw new MansionApiParseError()
  }
  const error = value.error
  if (
    !hasOnlyKeys(error, ['code', 'message']) ||
    !isOneOf(error.code, MANSION_API_ERROR_CODES) ||
    typeof error.message !== 'string' ||
    error.message.trim() === ''
  ) {
    throw new MansionApiParseError()
  }
  return { error: { code: error.code, message: ERROR_COPY[error.code] } }
}
