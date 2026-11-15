// Test double for the Crew app SDK. The real module exists only inside the
// Crew dashboard, so vitest.config.ts points the SDK specifier here. Tests that
// render the real adapter replace this module with vi.mock and a factory.
// Calling it unmocked fails loudly, so no test runs against a client by accident.
import type { AppApiClient, AppTheme } from '../adapters/sdk'

function notMocked(name: string): never {
  throw new Error(
    `${name} from the Crew app SDK is not available in tests. Replace the SDK module with vi.mock and a factory.`,
  )
}

export function useAppApi(): AppApiClient {
  return notMocked('useAppApi')
}

export function useAppEvents(_event: string, _cb: (data: unknown) => void): () => void {
  return notMocked('useAppEvents')
}

export function useTheme(): AppTheme {
  return notMocked('useTheme')
}

export function useNotify(): (text: string, opts?: Record<string, unknown>) => void {
  return notMocked('useNotify')
}

export function useNavBadge(): (count: number) => void {
  return notMocked('useNavBadge')
}

export function useChatLauncher(): { openChat(options?: { slotKey?: string }): void } {
  return notMocked('useChatLauncher')
}
