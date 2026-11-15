// Foyer controller over the real SDK adapter and a mocked host client.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MANSION_REQUEST_FAILED, UNEXPECTED_MANSION_RESPONSE, type MansionDescriptor } from '../../core/mansion-api'
import { useFoyer } from './use-foyer'

const host = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  // A new client per render, as the host may hand out.
  useAppApi: () => ({ get: host.get, post: host.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
}))

const MANSIONS = '/apps/haunted-house/api/mansions'
const OPEN = '/apps/haunted-house/api/mansions/open'

function mansion(name: string, status: MansionDescriptor['status'] = 'ready'): MansionDescriptor {
  return { name, projectSpec: name, displayPath: `~/workspace/haunted-house/mansions/${name}`, status }
}

function list(...mansions: MansionDescriptor[]) {
  return { schemaVersion: 1, mansions }
}

function httpError(status: number, code: string) {
  return Object.assign(new Error(`API ${status}`), {
    status,
    body: JSON.stringify({ error: { code, message: 'raw /Users/someone/secret text' } }),
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function readyFoyer(onAnnounce = vi.fn(), ...mansions: MansionDescriptor[]) {
  host.get.mockResolvedValue(list(...mansions))
  const hook = renderHook(() => useFoyer({ onAnnounce }))
  await waitFor(() => expect(hook.result.current.state.load.kind).toBe('ready'))
  return { ...hook, onAnnounce }
}

beforeEach(() => {
  host.get.mockReset()
  host.post.mockReset()
})

describe('useFoyer list loading', () => {
  it('requests the list once on mount, however often the host re-renders', async () => {
    const { result, rerender } = await readyFoyer(vi.fn(), mansion('b'), mansion('a'))
    rerender()
    rerender()
    expect(host.get).toHaveBeenCalledTimes(1)
    expect(host.get).toHaveBeenCalledWith(MANSIONS)
    expect(result.current.state.load).toEqual({ kind: 'ready', mansions: [mansion('a'), mansion('b')] })
  })

  it('shows safe copy for a failed list and loads again on retry', async () => {
    host.get.mockRejectedValueOnce(httpError(500, 'metadata_unavailable')).mockResolvedValueOnce(list(mansion('a')))
    const { result } = renderHook(() => useFoyer())
    await waitFor(() => expect(result.current.state.load.kind).toBe('error'))
    expect(result.current.state.load).toEqual({
      kind: 'error',
      message: 'Mansion records are unavailable. Try again.',
    })

    act(() => result.current.retryLoad())
    expect(result.current.state.load.kind).toBe('loading')
    await waitFor(() => expect(result.current.state.load.kind).toBe('ready'))
    expect(host.get).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a malformed list', { mansions: 'nope' }, UNEXPECTED_MANSION_RESPONSE],
    ['an absolute display path', list({ ...mansion('a'), displayPath: '/Users/x/a' }), UNEXPECTED_MANSION_RESPONSE],
  ])('refuses %s with fixed copy', async (_label, body, message) => {
    host.get.mockResolvedValueOnce(body)
    const { result } = renderHook(() => useFoyer())
    await waitFor(() => expect(result.current.state.load).toEqual({ kind: 'error', message }))
  })

  it('uses fixed copy when the client throws something without a body', async () => {
    host.get.mockRejectedValueOnce(new TypeError('Failed to fetch https://internal.example/secret'))
    const { result } = renderHook(() => useFoyer())
    await waitFor(() => expect(result.current.state.load).toEqual({ kind: 'error', message: MANSION_REQUEST_FAILED }))
  })

  it('ignores a list that arrives after unmount', async () => {
    const pending = deferred<unknown>()
    host.get.mockReturnValueOnce(pending.promise)
    const { result, unmount } = renderHook(() => useFoyer())
    unmount()
    await act(async () => pending.resolve(list(mansion('a'))))
    expect(result.current.state.load.kind).toBe('loading')
  })
})

describe('useFoyer create', () => {
  it('sends one request while pending, upserts the result, and announces it once', async () => {
    const { result, onAnnounce } = await readyFoyer(vi.fn(), mansion('zeta'))
    const pending = deferred<unknown>()
    host.post.mockReturnValueOnce(pending.promise)

    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = result.current.create('alpha')
      second = result.current.create('alpha')
    })
    expect(result.current.state.mutation).toEqual({ kind: 'creating', name: 'alpha' })
    await expect(second).resolves.toBe(false)
    expect(host.post).toHaveBeenCalledTimes(1)
    expect(host.post).toHaveBeenCalledWith(MANSIONS, { name: 'alpha' })
    expect(onAnnounce).not.toHaveBeenCalled()

    await act(async () => pending.resolve({ outcome: 'created', mansion: mansion('alpha') }))
    await expect(first).resolves.toBe(true)
    expect(result.current.state.load).toEqual({ kind: 'ready', mansions: [mansion('alpha'), mansion('zeta')] })
    expect(result.current.state.mutation).toEqual({ kind: 'idle' })
    expect(onAnnounce.mock.calls).toEqual([['Mansion alpha created.']])
  })

  it('announces an existing compatible mansion differently', async () => {
    const { result, onAnnounce } = await readyFoyer(vi.fn(), mansion('alpha'))
    host.post.mockResolvedValueOnce({ outcome: 'existing_compatible', mansion: mansion('alpha') })
    await act(async () => {
      await result.current.create('alpha')
    })
    expect(onAnnounce.mock.calls).toEqual([['Mansion alpha already exists. Nothing was changed.']])
    expect(result.current.state.load).toEqual({ kind: 'ready', mansions: [mansion('alpha')] })
  })

  it('keeps the list and selection on failure, shows fixed copy, and announces nothing', async () => {
    const { result, onAnnounce } = await readyFoyer(vi.fn(), mansion('kept'))
    act(() => result.current.select('kept'))
    const listBefore = result.current.state.load
    host.post.mockRejectedValueOnce(httpError(409, 'mansion_conflict'))
    let ok = true
    await act(async () => {
      ok = await result.current.create('taken')
    })
    expect(ok).toBe(false)
    expect(result.current.state.load).toBe(listBefore)
    expect(result.current.state.selectedName).toBe('kept')
    expect(result.current.state.mutation).toEqual({
      kind: 'error',
      operation: 'create',
      name: 'taken',
      message: 'Existing content conflicts with this mansion. Nothing was changed.',
    })
    expect(onAnnounce).not.toHaveBeenCalled()
  })

  it('fails instead of hanging when the reply describes a different mansion', async () => {
    const { result } = await readyFoyer()
    host.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('other') })
    await act(async () => {
      await result.current.create('asked')
    })
    expect(result.current.state.mutation).toEqual({
      kind: 'error',
      operation: 'create',
      name: 'asked',
      message: UNEXPECTED_MANSION_RESPONSE,
    })
    expect(result.current.state.load).toEqual({ kind: 'ready', mansions: [] })
  })

  it('sends nothing before the list is ready', async () => {
    host.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useFoyer())
    await expect(result.current.create('early')).resolves.toBe(false)
    expect(host.post).not.toHaveBeenCalled()
  })
})

describe('useFoyer open and return', () => {
  it('selects, revalidates through the open route once, enters the shell, and returns', async () => {
    const { result, onAnnounce } = await readyFoyer(vi.fn(), mansion('one'), mansion('two'))
    const pending = deferred<unknown>()
    host.post.mockReturnValueOnce(pending.promise)

    act(() => {
      result.current.open('two')
      result.current.open('two')
      result.current.open('one')
    })
    expect(result.current.state.mutation).toEqual({ kind: 'opening', name: 'two' })
    // The adapter starts the request on the next microtask.
    await waitFor(() => expect(host.post).toHaveBeenCalled())
    expect(host.post).toHaveBeenCalledTimes(1)
    expect(host.post).toHaveBeenCalledWith(OPEN, { name: 'two' })

    await act(async () => pending.resolve({ mansion: mansion('two') }))
    expect(result.current.state.view).toEqual({ kind: 'mansion', mansion: mansion('two') })
    expect(result.current.state.selectedName).toBe('two')
    expect(onAnnounce.mock.calls).toEqual([['Mansion two opened.']])

    act(() => result.current.returnToFoyer())
    expect(result.current.state.view).toEqual({ kind: 'foyer' })
    expect(result.current.state.selectedName).toBe('two')
  })

  it('stays in the Foyer with fixed copy when the backend refuses the open', async () => {
    const { result, onAnnounce } = await readyFoyer(vi.fn(), mansion('gone'))
    host.post.mockRejectedValueOnce(httpError(409, 'mansion_missing'))
    await act(async () => result.current.open('gone'))
    await waitFor(() => expect(result.current.state.mutation.kind).toBe('error'))
    expect(result.current.state.mutation).toMatchObject({
      operation: 'open',
      name: 'gone',
      message: 'This mansion is missing from storage.',
    })
    expect(result.current.state.view).toEqual({ kind: 'foyer' })
    expect(result.current.state.load).toEqual({ kind: 'ready', mansions: [mansion('gone')] })
    expect(onAnnounce).not.toHaveBeenCalled()
  })

  it('never asks to open an unavailable or unlisted mansion', async () => {
    const { result } = await readyFoyer(vi.fn(), mansion('lost', 'missing'), mansion('odd', 'conflict'))
    act(() => {
      result.current.open('lost')
      result.current.open('odd')
      result.current.open('unlisted')
    })
    expect(host.post).not.toHaveBeenCalled()
    expect(result.current.state.selectedName).toBeNull()
  })

  it('fails instead of hanging when the open reply describes a different mansion', async () => {
    const { result } = await readyFoyer(vi.fn(), mansion('one'), mansion('two'))
    host.post.mockResolvedValueOnce({ mansion: mansion('two') })
    await act(async () => result.current.open('one'))
    await waitFor(() => expect(result.current.state.mutation.kind).toBe('error'))
    expect(result.current.state.mutation).toMatchObject({ operation: 'open', name: 'one', message: UNEXPECTED_MANSION_RESPONSE })
    expect(result.current.state.view).toEqual({ kind: 'foyer' })
  })
})
