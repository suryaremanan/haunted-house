// Example and edge tests for Mansion API parsing (task 7.3). The baseline
// shapes live in mansion-api.test.ts; this file covers every stable error
// code, forward-compatible fields, hostile display paths, and message bounds.
import { describe, expect, it } from 'vitest'
import {
  CREATE_MANSION_OUTCOMES,
  MANSION_API_ERROR_CODES,
  MANSION_REQUEST_FAILED,
  MANSION_STATUSES,
  MAX_MANSION_MESSAGE_LENGTH,
  MAX_MANSION_NAME_LENGTH,
  MansionApiParseError,
  UNEXPECTED_MANSION_RESPONSE,
  boundedMansionMessage,
  isMansionName,
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type MansionDescriptor,
} from './mansion-api'

const ROOT = '~/workspace/haunted-house/mansions'

function mansion(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, projectSpec: name, displayPath: `${ROOT}/${name}`, status: 'ready', ...overrides }
}

const ready = mansion('weather-station') as unknown as MansionDescriptor

describe('Mansion name language', () => {
  it.each([
    'a',
    '0',
    'weather-station',
    'a-b-c-1-2-3',
    'a'.repeat(MAX_MANSION_NAME_LENGTH),
    `${'a'.repeat(MAX_MANSION_NAME_LENGTH - 2)}-b`,
  ])('accepts %j', (name) => {
    expect(isMansionName(name)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['41 characters', 'a'.repeat(MAX_MANSION_NAME_LENGTH + 1)],
    ['uppercase', 'Weather'],
    ['a leading hyphen', '-weather'],
    ['a trailing hyphen', 'weather-'],
    ['a doubled hyphen', 'weather--station'],
    ['an underscore', 'weather_station'],
    ['a space', 'weather station'],
    ['surrounding whitespace', ' weather '],
    ['a trailing newline', 'weather\n'],
    ['traversal', '..'],
    ['a path', 'a/b'],
    ['a dot', 'a.b'],
    ['a non-ASCII letter', 'café'],
    ['a full-width digit', 'a１'],
    ['a number', 7],
    ['null', null],
    ['an array', ['weather']],
    ['a String object', Object('weather')],
  ])('rejects %s without normalizing it', (_label, value) => {
    expect(isMansionName(value)).toBe(false)
  })
})

describe('Mansion list parsing', () => {
  it('parses an empty list', () => {
    expect(parseMansionListResponse({ schemaVersion: 1, mansions: [] })).toEqual({
      schemaVersion: 1,
      mansions: [],
    })
  })

  it.each(MANSION_STATUSES)('parses a %s descriptor', (status) => {
    const parsed = parseMansionListResponse({ schemaVersion: 1, mansions: [mansion('one', { status })] })
    expect(parsed.mansions).toEqual([
      { name: 'one', projectSpec: 'one', displayPath: `${ROOT}/one`, status },
    ])
  })

  it('keeps the order the server sent and returns only the documented fields', () => {
    const parsed = parseMansionListResponse({
      schemaVersion: 1,
      mansions: [mansion('b', { absolutePath: '/Users/example/b' }), mansion('a', { status: 'missing' })],
      nextCursor: null,
    })
    expect(parsed.mansions.map(({ name }) => name)).toEqual(['b', 'a'])
    expect(Object.keys(parsed)).toEqual(['schemaVersion', 'mansions'])
    expect(Object.keys(parsed.mansions[0])).toEqual(['name', 'projectSpec', 'displayPath', 'status'])
    expect(JSON.stringify(parsed)).not.toContain('/Users/')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', '{"schemaVersion":1,"mansions":[]}'],
    ['an array', []],
    ['a missing schema version', { mansions: [] }],
    ['schema version 2', { schemaVersion: 2, mansions: [] }],
    ['a string schema version', { schemaVersion: '1', mansions: [] }],
    ['missing mansions', { schemaVersion: 1 }],
    ['an object for mansions', { schemaVersion: 1, mansions: {} }],
    ['a null descriptor', { schemaVersion: 1, mansions: [null] }],
    ['a string descriptor', { schemaVersion: 1, mansions: ['weather-station'] }],
    ['an array descriptor', { schemaVersion: 1, mansions: [[]] }],
    ['an error body', { error: { code: 'filesystem_error', message: 'No.' } }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseMansionListResponse(body)).toThrow(MansionApiParseError)
  })

  it.each([
    ['a missing name', { name: undefined }],
    ['a numeric name', { name: 7 }],
    ['a missing project spec', { projectSpec: undefined }],
    ['a missing display path', { displayPath: undefined }],
    ['a numeric display path', { displayPath: 7 }],
    ['a missing status', { status: undefined }],
    ['a null status', { status: null }],
    ['a status with different case', { status: 'Ready' }],
    ['an inherited property name as status', { status: 'constructor' }],
    ['an absolute POSIX path', { displayPath: '/Users/example/workspace/weather-station' }],
    ['an absolute Windows path', { displayPath: 'C:\\Users\\example\\weather-station' }],
    ['a relative path without the home marker', { displayPath: 'workspace/weather-station' }],
    ['a bare home marker', { displayPath: '~' }],
    ['another user home', { displayPath: '~root/weather-station' }],
    ['a traversal component', { displayPath: '~/workspace/../weather-station' }],
    ['a current-directory component', { displayPath: '~/workspace/./weather-station' }],
    ['an empty component', { displayPath: '~/workspace//weather-station' }],
    ['a trailing slash', { displayPath: `${ROOT}/weather-station/` }],
    ['a backslash', { displayPath: '~/workspace\\weather-station' }],
    ['a control character', { displayPath: '~/work\u0000space/weather-station' }],
    ['a newline', { displayPath: '~/work\nspace/weather-station' }],
    ['a final component that only contains the name', { displayPath: `${ROOT}/weather-station-2` }],
    ['an empty display path', { displayPath: '' }],
  ])('rejects a descriptor with %s', (_label, overrides) => {
    const body = { schemaVersion: 1, mansions: [mansion('weather-station', overrides)] }
    expect(() => parseMansionListResponse(body)).toThrow(MansionApiParseError)
  })

  it('rejects the whole list when one descriptor is invalid', () => {
    const body = { schemaVersion: 1, mansions: [mansion('good'), mansion('bad', { status: 'haunted' })] }
    expect(() => parseMansionListResponse(body)).toThrow(MansionApiParseError)
  })

  it('rejects duplicate names even when the descriptors are identical', () => {
    const body = { schemaVersion: 1, mansions: [mansion('twin'), mansion('twin')] }
    expect(() => parseMansionListResponse(body)).toThrow(MansionApiParseError)
  })

  it('reports parse failures with fixed copy and no response text', () => {
    try {
      parseMansionListResponse({ schemaVersion: 1, mansions: [mansion('x', { displayPath: '/Users/secret/x' })] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MansionApiParseError)
      expect((error as Error).message).toBe(UNEXPECTED_MANSION_RESPONSE)
      expect((error as Error).name).toBe('MansionApiParseError')
    }
  })
})

describe('Mansion create and open parsing', () => {
  it.each(CREATE_MANSION_OUTCOMES)('parses outcome %s and ignores extra fields', (outcome) => {
    expect(
      parseCreateMansionResponse({ outcome, mansion: { ...ready, origin: 'created' }, requestId: 'r-1' }),
    ).toEqual({ outcome, mansion: ready })
  })

  it.each([
    ['a missing outcome', { mansion: ready }],
    ['an unknown outcome', { outcome: 'deleted', mansion: ready }],
    ['a missing mansion', { outcome: 'created' }],
    ['a null mansion', { outcome: 'created', mansion: null }],
    ['a conflict descriptor', { outcome: 'created', mansion: { ...ready, status: 'conflict' } }],
    ['a list response', { schemaVersion: 1, mansions: [ready] }],
    ['null', null],
  ])('rejects a create response with %s', (_label, body) => {
    expect(() => parseCreateMansionResponse(body)).toThrow(MansionApiParseError)
  })

  it('parses an open response and ignores extra fields', () => {
    expect(parseOpenMansionResponse({ mansion: { ...ready, rooms: [] }, outcome: 'created' })).toEqual({
      mansion: ready,
    })
  })

  it.each([
    ['a missing mansion', {}],
    ['a conflict descriptor', { mansion: { ...ready, status: 'conflict' } }],
    ['a missing descriptor', { mansion: { ...ready, status: 'missing' } }],
    ['an absolute display path', { mansion: { ...ready, displayPath: '/tmp/weather-station' } }],
    ['an array', [ready]],
  ])('rejects an open response with %s', (_label, body) => {
    expect(() => parseOpenMansionResponse(body)).toThrow(MansionApiParseError)
  })
})

describe('Mansion error parsing', () => {
  it.each(MANSION_API_ERROR_CODES)('maps %s to fixed, bounded, path-free copy', (code) => {
    const parsed = parseMansionApiError({
      error: { code, message: 'Traceback: /Users/example/.ssh/id_rsa could not be read' },
    })
    expect(parsed.error.code).toBe(code)
    expect(parsed.error.message).not.toContain('/')
    expect(parsed.error.message).not.toContain('Traceback')
    expect(parsed.error.message.trim()).not.toBe('')
    expect(parsed.error.message.length).toBeLessThanOrEqual(MAX_MANSION_MESSAGE_LENGTH)
    expect(Object.keys(parsed)).toEqual(['error'])
    expect(Object.keys(parsed.error)).toEqual(['code', 'message'])
  })

  it('gives every stable code its own copy', () => {
    const copies = MANSION_API_ERROR_CODES.map(
      (code) => parseMansionApiError({ error: { code, message: 'x' } }).error.message,
    )
    expect(new Set(copies).size).toBe(MANSION_API_ERROR_CODES.length)
  })

  it.each([
    ['null', null],
    ['a string', 'invalid_request'],
    ['an array', [{ error: { code: 'invalid_request', message: 'No.' } }]],
    ['a string error', { error: 'invalid_request' }],
    ['a null error', { error: null }],
    ['an array error', { error: ['invalid_request', 'No.'] }],
    ['a missing code', { error: { message: 'No.' } }],
    ['a numeric code', { error: { code: 422, message: 'No.' } }],
    ['an inherited property name as code', { error: { code: 'toString', message: 'No.' } }],
    ['a numeric message', { error: { code: 'invalid_request', message: 5 } }],
    ['an extra envelope field', { error: { code: 'invalid_request', message: 'No.' }, path: '/Users/x' }],
    ['a success body', { mansion: ready }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseMansionApiError(body)).toThrow(MansionApiParseError)
  })
})

describe('bounded mansion messages', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 404],
    ['an object', { message: 'no' }],
    ['an empty string', ''],
    ['whitespace', ' \n\t '],
    ['control characters only', '\u0000\u0007\u007f'],
  ])('falls back to fixed copy for %s', (_label, value) => {
    expect(boundedMansionMessage(value)).toBe(MANSION_REQUEST_FAILED)
    expect(boundedMansionMessage(value, 'Custom fallback.')).toBe('Custom fallback.')
  })

  it('keeps a message of exactly the maximum length unchanged', () => {
    const exact = 'm'.repeat(MAX_MANSION_MESSAGE_LENGTH)
    expect(boundedMansionMessage(exact)).toBe(exact)
  })

  it('shortens a message one character over the maximum and marks the cut', () => {
    const bounded = boundedMansionMessage('m'.repeat(MAX_MANSION_MESSAGE_LENGTH + 1))
    expect(bounded).toHaveLength(MAX_MANSION_MESSAGE_LENGTH)
    expect(bounded).toBe(`${'m'.repeat(MAX_MANSION_MESSAGE_LENGTH - 1)}…`)
  })

  it('collapses whitespace and control characters onto one trimmed line', () => {
    expect(boundedMansionMessage('\r\n  Could\tnot\u0000\u0001reach \n\n the   house.  ')).toBe(
      'Could not reach the house.',
    )
  })
})
