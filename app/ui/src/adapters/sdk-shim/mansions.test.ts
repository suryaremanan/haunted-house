// Replay stand-in mansion routes (task 9.1): the same response contracts as
// live mode, answered from memory, with the bundled fixture left untouched.
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import recordedMansions from '../../../../../fixtures/replay/mansions.json'
import { createInitialFoyerState, foyerReducer } from '../../core/foyer-reducer'
import { parseMansionListResponse } from '../../core/mansion-api'
import { REPLAY_MANSIONS_PATH, REPLAY_OPEN_MANSION_PATH } from '../../core/replay-mansion'
import { MANSIONS_PATH, OPEN_MANSION_PATH } from '../sdk'
import { REPLAY_MANSION_FIXTURE, createReplayMansionRoutes } from './mansions'
import mansionsSource from './mansions.ts?raw'

// The real adapter runs over the stand-in, as in the replay build. Registered
// per test so each test gets a fresh stand-in and registry.
beforeEach(() => {
  vi.doMock('@kirocrew/app-sdk', () => import('./index'))
})

afterEach(() => {
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
  vi.unstubAllGlobals()
})

async function freshAdapter() {
  vi.resetModules()
  const adapter = await import('../sdk')
  return renderHook(() => adapter.useMansionApi()).result.current
}

describe('replay mansion fixture', () => {
  it('is a valid recorded list reply with home-relative paths only', () => {
    const parsed = parseMansionListResponse(REPLAY_MANSION_FIXTURE)
    expect(parsed.mansions.length).toBeGreaterThan(0)
    expect(parsed.mansions.some(({ status }) => status === 'ready')).toBe(true)
    for (const mansion of parsed.mansions) expect(mansion.displayPath.startsWith('~/')).toBe(true)
    expect(JSON.stringify(REPLAY_MANSION_FIXTURE)).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/)
  })

  it('uses the same paths as the live adapter', () => {
    expect(REPLAY_MANSIONS_PATH).toBe(MANSIONS_PATH)
    expect(REPLAY_OPEN_MANSION_PATH).toBe(OPEN_MANSION_PATH)
  })
})

describe('replay mansion routes', () => {
  it('answers the three live routes and nothing else', () => {
    const routes = createReplayMansionRoutes()
    expect(routes('GET', MANSIONS_PATH)?.status).toBe(200)
    expect(routes('POST', MANSIONS_PATH, { name: 'new-wing' })?.status).toBe(201)
    expect(routes('POST', OPEN_MANSION_PATH, { name: 'new-wing' })?.status).toBe(200)
    expect(routes('DELETE', MANSIONS_PATH)).toBeNull()
    expect(routes('DELETE', `${MANSIONS_PATH}/new-wing`)).toBeNull()
    expect(routes('PUT', MANSIONS_PATH, { name: 'new-wing' })).toBeNull()
    expect(routes('PATCH', MANSIONS_PATH, { name: 'new-wing' })).toBeNull()
    expect(routes('POST', `${MANSIONS_PATH}/rename`, { name: 'new-wing' })).toBeNull()
    expect(routes('GET', '/api/version')).toBeNull()
  })

  it('keeps each session separate and never edits the bundled fixture', () => {
    const before = JSON.stringify(recordedMansions)
    const first = createReplayMansionRoutes()
    const second = createReplayMansionRoutes()
    first('POST', MANSIONS_PATH, { name: 'only-in-first' })
    expect(JSON.stringify(first('GET', MANSIONS_PATH)?.body)).toContain('only-in-first')
    expect(JSON.stringify(second('GET', MANSIONS_PATH)?.body)).not.toContain('only-in-first')
    expect(JSON.stringify(recordedMansions)).toBe(before)
    expect(JSON.stringify(REPLAY_MANSION_FIXTURE)).toBe(before)
  })

  it('has no network, storage, or filesystem code', () => {
    expect(mansionsSource).not.toMatch(/\bfetch\b|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|node:/)
  })
})

describe('live adapter over the replay stand-in', () => {
  it('lists, creates, and opens through the live parsers without any request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('The replay must not fetch for mansion calls.')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const api = await freshAdapter()

    const listed = await api.list()
    expect(listed).toEqual(parseMansionListResponse(recordedMansions))

    await expect(api.create('new-wing')).resolves.toEqual({
      outcome: 'created',
      mansion: {
        name: 'new-wing',
        projectSpec: 'new-wing',
        displayPath: '~/workspace/haunted-house/mansions/new-wing',
        status: 'ready',
      },
    })
    await expect(api.create('new-wing')).resolves.toMatchObject({ outcome: 'existing_compatible' })
    // The optional feature brief (design decision 2026-11-16) goes through the same route.
    await expect(api.create('briefed-wing', '  A tide clock.\r\n')).resolves.toMatchObject({
      outcome: 'created',
      mansion: { name: 'briefed-wing', status: 'ready' },
    })
    await expect(api.open('new-wing')).resolves.toMatchObject({ mansion: { name: 'new-wing', status: 'ready' } })

    const names = (await api.list()).mansions.map(({ name }) => name)
    expect(names).toEqual([...names].sort())
    expect(names.filter((name) => name === 'new-wing')).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('updates Foyer state through the same reducer transition as live mode', async () => {
    const api = await freshAdapter()
    let state = foyerReducer(createInitialFoyerState(), {
      type: 'load_succeeded',
      mansions: (await api.list()).mansions,
    })
    state = foyerReducer(state, { type: 'create_started', name: 'a-first-room' })
    state = foyerReducer(state, { type: 'create_succeeded', mansion: (await api.create('a-first-room')).mansion })
    expect(state.load).toEqual({ kind: 'ready', mansions: (await api.list()).mansions })
    expect(state.load.kind === 'ready' && state.load.mansions[0].name).toBe('a-first-room')
  })

  it.each([
    ['create', 'Not Kebab', 422, 'invalid_mansion_name', 'Use 1–40 lowercase letters, numbers, and single hyphens.'],
    ['open', 'never-made', 404, 'mansion_not_registered', 'This mansion is not registered. Refresh the list and try again.'],
    ['open', 'lost-greenhouse', 409, 'mansion_missing', 'This mansion is missing from storage.'],
  ] as const)('%s %j fails with %i %s and the live fixed copy', async (operation, name, status, code, message) => {
    const api = await freshAdapter()
    const failure = await api[operation](name).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toMatchObject({ name: 'MansionApiRequestError', status, code, message })
  })

  it('still refuses every other write and unknown read', async () => {
    vi.resetModules()
    const shim = await import('./index')
    const api = shim.useAppApi()
    await expect(api.post(`${MANSIONS_PATH}/delete`, { name: 'weather-station' })).rejects.toMatchObject({ status: 405 })
    await expect(api.del(`${MANSIONS_PATH}/weather-station`)).rejects.toMatchObject({ status: 405 })
    await expect(api.put(MANSIONS_PATH, { name: 'x' })).rejects.toMatchObject({ status: 405 })
    await expect(api.patch(MANSIONS_PATH, { name: 'x' })).rejects.toMatchObject({ status: 405 })
    await expect(api.get(OPEN_MANSION_PATH)).rejects.toMatchObject({ status: 404 })
    await expect(api.get(`${MANSIONS_PATH}/weather-station`)).rejects.toMatchObject({ status: 404 })
  })
})
