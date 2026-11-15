import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MANSIONS_PATH,
  OPEN_MANSION_PATH,
  MansionApiRequestError,
  useMansionApi,
  useTheme,
} from './sdk'
import {
  MANSION_REQUEST_FAILED,
  UNEXPECTED_MANSION_RESPONSE,
  type MansionDescriptor,
} from '../core/mansion-api'

const host = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  theme: { mode: 'dark' as const, accent: '#c58b45', colorTheme: 'midnight' },
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

describe('theme boundary', () => {
  it('re-exports the host theme state', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current).toEqual(host.theme)
  })
})
