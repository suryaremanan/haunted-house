import { describe, expect, it } from 'vitest'
import { REQUEST_FAILED, UNEXPECTED_REPLY, parseWhoami, statusFromError } from './backend-status'

describe('parseWhoami', () => {
  it('reads a reachable backend with a gateway version', () => {
    expect(parseWhoami({ backend: 'ok', gateway: { version: '0.12.1' } })).toEqual({
      kind: 'ok',
      gateway: { version: '0.12.1' },
    })
  })

  it('treats the replay stand-in as reachable', () => {
    expect(parseWhoami({ backend: 'replay', gateway: { version: 'replay' } })).toEqual({
      kind: 'ok',
      gateway: { version: 'replay' },
    })
  })

  it.each(['timeout', 'unreachable', 'denied', 'config'] as const)(
    'reads the gateway error %s',
    (error) => {
      expect(parseWhoami({ backend: 'ok', gateway: { error } })).toEqual({
        kind: 'ok',
        gateway: { error },
      })
    },
  )

  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['an array', [{ backend: 'ok' }]],
    ['no backend field', { gateway: { version: '0.12.1' } }],
    ['an unknown backend value', { backend: 'maybe', gateway: { version: '0.12.1' } }],
    ['no gateway field', { backend: 'ok' }],
    ['a gateway that is not an object', { backend: 'ok', gateway: '0.12.1' }],
    ['an empty gateway version', { backend: 'ok', gateway: { version: '  ' } }],
    ['a non-string gateway version', { backend: 'ok', gateway: { version: 12 } }],
    ['an unknown gateway error', { backend: 'ok', gateway: { error: 'http' } }],
  ])('reports %s as unreachable with a message', (_label, body) => {
    expect(parseWhoami(body)).toEqual({ kind: 'unreachable', message: UNEXPECTED_REPLY })
  })
})

describe('statusFromError', () => {
  it('keeps a numeric HTTP status and the error message', () => {
    const err = Object.assign(new Error('Bad Gateway'), { status: 502 })
    expect(statusFromError(err)).toEqual({ kind: 'unreachable', status: 502, message: 'Bad Gateway' })
  })

  it('omits the status when the error has none', () => {
    expect(statusFromError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'unreachable',
      message: 'Failed to fetch',
    })
  })

  it.each([
    ['a string status', '502'],
    ['an out-of-range status', 42],
    ['a fractional status', 502.5],
  ])('ignores %s', (_label, status) => {
    const result = statusFromError(Object.assign(new Error('x'), { status }))
    expect(result).toEqual({ kind: 'unreachable', message: 'x' })
  })

  it.each([
    ['undefined', undefined],
    ['a string', 'boom'],
    ['an error with an empty message', new Error('   ')],
  ])('falls back to a plain message for %s', (_label, err) => {
    expect(statusFromError(err)).toEqual({ kind: 'unreachable', message: REQUEST_FAILED })
  })

  it('shortens a very long message', () => {
    const result = statusFromError(new Error('x'.repeat(1000)))
    expect(result.kind).toBe('unreachable')
    if (result.kind === 'unreachable') expect(result.message.length).toBeLessThanOrEqual(200)
  })
})
