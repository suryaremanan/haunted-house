import { describe, expect, it } from 'vitest'
import {
  MAX_MANSION_MESSAGE_LENGTH,
  MansionApiParseError,
  boundedMansionMessage,
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type MansionDescriptor,
} from './mansion-api'

const readyMansion: MansionDescriptor = {
  name: 'weather-station',
  projectSpec: 'weather-station',
  displayPath: '~/workspace/haunted-house/mansions/weather-station',
  status: 'ready',
}

describe('Mansion API success parsing', () => {
  it('parses a versioned list and ignores extra success fields', () => {
    expect(
      parseMansionListResponse({
        schemaVersion: 1,
        mansions: [{ ...readyMansion, futureDescriptorField: true }],
        futureResponseField: 'kept out of the parsed value',
      }),
    ).toEqual({ schemaVersion: 1, mansions: [readyMansion] })
  })

  it('parses both create outcomes and an open response', () => {
    expect(parseCreateMansionResponse({ outcome: 'created', mansion: readyMansion })).toEqual({
      outcome: 'created',
      mansion: readyMansion,
    })
    expect(
      parseCreateMansionResponse({ outcome: 'existing_compatible', mansion: readyMansion }),
    ).toEqual({ outcome: 'existing_compatible', mansion: readyMansion })
    expect(parseOpenMansionResponse({ mansion: readyMansion })).toEqual({ mansion: readyMansion })
  })

  it('rejects duplicate mansion names', () => {
    expect(() =>
      parseMansionListResponse({
        schemaVersion: 1,
        mansions: [readyMansion, { ...readyMansion, status: 'missing' }],
      }),
    ).toThrow(MansionApiParseError)
  })

  it.each([
    ['an invalid name', { ...readyMansion, name: 'Weather Station' }],
    ['a mismatched project spec', { ...readyMansion, projectSpec: 'other-spec' }],
    ['an absolute display path', { ...readyMansion, displayPath: '/Users/example/weather-station' }],
    ['a display path ending in another name', { ...readyMansion, displayPath: '~/mansions/other' }],
    ['an unknown status', { ...readyMansion, status: 'unknown' }],
  ])('rejects %s', (_label, mansion) => {
    expect(() => parseMansionListResponse({ schemaVersion: 1, mansions: [mansion] })).toThrow(
      MansionApiParseError,
    )
  })

  it('requires ready descriptors for successful create and open responses', () => {
    const missing = { ...readyMansion, status: 'missing' }
    expect(() => parseCreateMansionResponse({ outcome: 'created', mansion: missing })).toThrow(
      MansionApiParseError,
    )
    expect(() => parseOpenMansionResponse({ mansion: missing })).toThrow(MansionApiParseError)
  })
})

describe('Mansion API error parsing', () => {
  it('accepts a stable code but returns fixed safe copy instead of response text', () => {
    expect(
      parseMansionApiError({
        error: {
          code: 'filesystem_error',
          message: '/Users/example/private-project raised SecretException',
        },
      }),
    ).toEqual({
      error: { code: 'filesystem_error', message: 'Mansion storage could not be accessed.' },
    })
  })

  it.each([
    ['an unknown code', { error: { code: 'surprise', message: 'No.' } }],
    ['a missing message', { error: { code: 'invalid_request' } }],
    ['an empty message', { error: { code: 'invalid_request', message: '  ' } }],
    [
      'an extra error field',
      { error: { code: 'invalid_request', message: 'No.', exception: 'private' } },
    ],
  ])('rejects %s', (_label, body) => {
    expect(() => parseMansionApiError(body)).toThrow(MansionApiParseError)
  })

  it('keeps arbitrary adapter messages on one bounded line', () => {
    const message = boundedMansionMessage(`  request\nfailed\u0000${'x'.repeat(500)}  `)
    expect(message).not.toMatch(/[\n\u0000]/)
    expect(message).toHaveLength(MAX_MANSION_MESSAGE_LENGTH)
    expect(message.endsWith('…')).toBe(true)
  })
})
