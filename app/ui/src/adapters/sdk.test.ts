import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MANSIONS_PATH,
  OPEN_MANSION_PATH,
  MansionApiRequestError,
  FALLBACK_HOST_THEME,
  HOST_HOOKS_PRESENT,
  normalizeHostTheme,
  useHostNavBadge,
  useHostNotify,
  useHostTheme,
  useMansionApi,
} from './sdk'
import {
  MANSION_REQUEST_FAILED,
  UNEXPECTED_MANSION_RESPONSE,
  type MansionDescriptor,
} from '../core/mansion-api'

const host = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  theme: { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' } as unknown,
  notify: vi.fn(),
  badge: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({
    get: host.get,
    post: host.post,
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  }),
  useAppEvents: () => () => {},
  useTheme: () => host.theme,
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
}))

const readyMansion: MansionDescriptor = {
  name: 'weather-station',
  projectSpec: 'weather-station',
  displayPath: '~/workspace/haunted-house/mansions/weather-station',
  status: 'ready',
}

beforeEach(() => {
  host.get.mockReset()
  host.post.mockReset()
})

describe('useMansionApi', () => {
  it('lists through the mansion path and parses the response', async () => {
    host.get.mockResolvedValueOnce({
      schemaVersion: 1,
      mansions: [{ ...readyMansion, ignoredFutureField: true }],
      ignoredFutureField: true,
    })
    const { result } = renderHook(() => useMansionApi())

    await expect(result.current.list()).resolves.toEqual({
      schemaVersion: 1,
      mansions: [readyMansion],
    })
    expect(host.get).toHaveBeenCalledOnce()
    expect(host.get).toHaveBeenCalledWith(MANSIONS_PATH)
    expect(host.post).not.toHaveBeenCalled()
  })

  it('creates and opens with name-only bodies through the two declared paths', async () => {
    host.post
      .mockResolvedValueOnce({ outcome: 'created', mansion: readyMansion })
      .mockResolvedValueOnce({ mansion: readyMansion })
    const { result } = renderHook(() => useMansionApi())

    await expect(result.current.create('weather-station')).resolves.toEqual({
      outcome: 'created',
      mansion: readyMansion,
    })
    await expect(result.current.open('weather-station')).resolves.toEqual({
      mansion: readyMansion,
    })
    expect(host.post.mock.calls).toEqual([
      [MANSIONS_PATH, { name: 'weather-station' }],
      [OPEN_MANSION_PATH, { name: 'weather-station' }],
    ])
  })

  it('adds the normalised brief only when it is non-blank and never sends a refused one', async () => {
    host.post.mockResolvedValue({ outcome: 'created', mansion: readyMansion })
    const { result } = renderHook(() => useMansionApi())

    await result.current.create('weather-station', '  Forecasts.\r\nAlerts.  ')
    await result.current.create('weather-station', ' \n ')
    await expect(result.current.create('weather-station', 'bad\u0000')).rejects.toBeInstanceOf(
      MansionApiRequestError,
    )
    expect(host.post.mock.calls).toEqual([
      [MANSIONS_PATH, { name: 'weather-station', brief: 'Forecasts.\nAlerts.' }],
      [MANSIONS_PATH, { name: 'weather-station' }],
    ])
  })

  it('rejects a successful response that does not match the Mansion API contract', async () => {
    host.get.mockResolvedValueOnce({ schemaVersion: 1, mansions: 'not-a-list' })
    const { result } = renderHook(() => useMansionApi())

    await expect(result.current.list()).rejects.toThrow(UNEXPECTED_MANSION_RESPONSE)
  })

  it('parses an SDK error body and exposes only fixed Foyer copy', async () => {
    const privateMessage = '/Users/example/private-project contains SecretException'
    host.post.mockRejectedValueOnce(
      Object.assign(new Error(`API 409: ${privateMessage}`), {
        name: 'AppApiError',
        status: 409,
        body: JSON.stringify({
          error: { code: 'mansion_conflict', message: privateMessage },
        }),
      }),
    )
    const { result } = renderHook(() => useMansionApi())

    const error = await result.current.create('weather-station').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MansionApiRequestError)
    expect(error).toMatchObject({
      code: 'mansion_conflict',
      status: 409,
      message: 'Existing content conflicts with this mansion. Nothing was changed.',
    })
    expect(String(error)).not.toContain(privateMessage)
  })

  it('uses fixed fallback copy when a transport error has no backend body', async () => {
    const privateMessage = '/Users/example/private-project could not be reached'
    host.get.mockRejectedValueOnce(new TypeError(privateMessage))
    const { result } = renderHook(() => useMansionApi())

    const error = await result.current.list().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MansionApiRequestError)
    expect(error).toMatchObject({ message: MANSION_REQUEST_FAILED })
    expect(String(error)).not.toContain(privateMessage)
  })

  it('uses fixed unexpected-reply copy for a malformed backend error body', async () => {
    host.post.mockRejectedValueOnce(
      Object.assign(new Error('API 500'), {
        name: 'AppApiError',
        status: 500,
        body: '{"error":{"code":"unknown","message":"private"}}',
      }),
    )
    const { result } = renderHook(() => useMansionApi())

    await expect(result.current.open('weather-station')).rejects.toMatchObject({
      status: 500,
      message: UNEXPECTED_MANSION_RESPONSE,
    })
  })
})

describe('host theme, toast and badge wrappers (Spec 6 task 3.1)', () => {
  beforeEach(() => {
    host.theme = { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' }
    host.notify.mockReset()
    host.badge.mockReset()
  })

  it('finds the three host hooks on a host that exports them', () => {
    expect(HOST_HOOKS_PRESENT).toEqual({ theme: true, notify: true, navBadge: true })
  })

  it('normalizes the host theme to the three documented fields', () => {
    const { result } = renderHook(() => useHostTheme())
    expect(result.current).toEqual({ mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' })
  })

  it('follows a host theme change and keeps the same object while nothing changes', () => {
    const { result, rerender } = renderHook(() => useHostTheme())
    const first = result.current
    host.theme = { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' }
    rerender()
    expect(result.current).toBe(first)
    host.theme = { mode: 'light', accent: '#c58b45', colorTheme: 'midnight' }
    rerender()
    expect(result.current.mode).toBe('light')
  })

  it.each([
    ['nothing', undefined],
    ['a string', 'dark'],
    ['an unknown mode', { mode: 'sepia' }],
    ['wrong field types', { mode: 7, accent: {}, colorTheme: ['x'] }],
  ])('falls back for %s', (_name, raw) => {
    expect(normalizeHostTheme(raw)).toEqual(FALLBACK_HOST_THEME)
  })

  it('drops an accent that is not a short plain value, and never passes extra host fields on', () => {
    expect(normalizeHostTheme({ mode: 'dark', accent: 'red; } body { display: none', colorTheme: 'x'.repeat(65), token: 'secret' })).toEqual({
      mode: 'dark',
      accent: null,
      colorTheme: null,
    })
    expect(normalizeHostTheme({ mode: 'light', accent: ' rgb(10, 20, 30) ', colorTheme: 'default' })).toEqual({
      mode: 'light',
      accent: 'rgb(10, 20, 30)',
      colorTheme: 'default',
    })
  })

  it('sends a toast as the text alone, with no option', () => {
    const { result } = renderHook(() => useHostNotify())
    expect(result.current('Tinker 2 is blocked.')).toBe(true)
    expect(host.notify.mock.calls).toEqual([['Tinker 2 is blocked.']])
    expect(result.current('')).toBe(false)
    expect(host.notify).toHaveBeenCalledTimes(1)
  })

  it('contains a toast that throws or rejects, and does not retry', async () => {
    const { result } = renderHook(() => useHostNotify())
    host.notify.mockImplementationOnce(() => {
      throw new Error('host toast failed')
    })
    expect(result.current('first')).toBe(false)
    host.notify.mockImplementationOnce(() => Promise.reject(new Error('later')))
    expect(result.current('second')).toBe(true)
    await Promise.resolve()
    expect(host.notify).toHaveBeenCalledTimes(2)
  })

  it('sets the badge to a whole non-negative count and contains a failure', () => {
    const { result } = renderHook(() => useHostNavBadge())
    for (const count of [3, 0, -2, 2.9, Number.NaN]) result.current(count)
    expect(host.badge.mock.calls).toEqual([[3], [0], [0], [2], [0]])
    host.badge.mockImplementationOnce(() => {
      throw new Error('no sidebar')
    })
    expect(result.current(1)).toBe(false)
  })

  it('keeps one stable function across renders', () => {
    const notify = renderHook(() => useHostNotify())
    const badge = renderHook(() => useHostNavBadge())
    const before = [notify.result.current, badge.result.current]
    notify.rerender()
    badge.rerender()
    expect([notify.result.current, badge.result.current]).toEqual(before)
  })
})
