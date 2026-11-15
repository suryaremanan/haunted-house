// The one seam through which the page opens an existing Crew session (Spec 5
// task 9.1, RG-S4).
// **Validates: Requirements 11.2, 11.3**
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

const base = {
  useAppApi: () => ({}),
  useAppEvents: () => undefined,
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  useNotify: () => () => {},
  useNavBadge: () => () => {},
}

async function opener(sdk: Record<string, unknown>) {
  vi.doMock('@kirocrew/app-sdk', () => sdk)
  const { useSessionOpener } = await import('./sdk')
  return renderHook(() => useSessionOpener())
}

describe('useSessionOpener', () => {
  it('opens an existing slot with the slot key and nothing else', async () => {
    const openChat = vi.fn()
    const { result, rerender } = await opener({ ...base, useChatLauncher: () => ({ openChat }) })
    const open = result.current
    expect(open).not.toBeNull()
    open?.('hh-archivist-requirements-1')
    expect(openChat.mock.calls).toEqual([[{ slotKey: 'hh-archivist-requirements-1' }]])
    // The opener is stable across renders, so a link does not re-render for nothing.
    rerender()
    expect(result.current).toBe(open)
  })

  it('never calls the launcher without a slot key, which could create a chat', async () => {
    const openChat = vi.fn()
    const { result } = await opener({ ...base, useChatLauncher: () => ({ openChat }) })
    result.current?.('')
    expect(openChat).not.toHaveBeenCalled()
  })

  it('is null on a host that does not supply the launcher, instead of failing the page', async () => {
    const { result } = await opener({ ...base })
    expect(result.current).toBeNull()
  })

  it('is null when the host launcher has no openChat', async () => {
    const { result } = await opener({ ...base, useChatLauncher: () => ({}) })
    expect(result.current).toBeNull()
  })

  it('is a recorded no-op on the replay stand-in', async () => {
    vi.doMock('@kirocrew/app-sdk', () => import('./sdk-shim'))
    const shim = await import('./sdk-shim')
    const { useSessionOpener } = await import('./sdk')
    const { result } = renderHook(() => useSessionOpener())
    expect(shim.replayChatLauncherCalls).toEqual([])
    result.current?.('hh-archivist')
    expect(shim.replayChatLauncherCalls).toEqual([{ slotKey: 'hh-archivist' }])
  })
})
