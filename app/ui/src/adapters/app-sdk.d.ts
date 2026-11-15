// Types for the parts of @kirocrew/app-sdk this app uses. The Crew dashboard
// supplies the module at runtime through its import map; there is no npm
// package or published typings. Only src/adapters/sdk.ts may import it.
declare module '@kirocrew/app-sdk' {
  /** Thrown by AppApiClient methods when the gateway answers with a non-2xx status. */
  export interface AppApiError extends Error {
    readonly status: number
    /** Unparsed response body. Consumers must parse it before use. */
    readonly body: string
  }

  /** Reactive theme state supplied by the Crew dashboard. */
  export interface AppTheme {
    readonly mode: 'dark' | 'light'
    readonly accent: string
    readonly colorTheme: string
  }

  /**
   * Permission-scoped client for gateway paths listed in the manifest's
   * `permissions.api`. JSON responses are untrusted until an app parser checks
   * them. Methods reject on non-2xx or for an out-of-scope path.
   */
  export interface AppApiClient {
    get<T = unknown>(path: string, init?: RequestInit): Promise<T>
    post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>
    put(path: string, body?: unknown): Promise<unknown>
    patch(path: string, body?: unknown): Promise<unknown>
    del(path: string): Promise<unknown>
  }

  export function useAppApi(): AppApiClient

  /** Subscribes to a gateway WebSocket event type. Returns an unsubscribe function. */
  export function useAppEvents(event: string, cb: (data: unknown) => void): () => void

  /** Returns theme state that updates when the host theme changes. */
  export function useTheme(): AppTheme

  /**
   * Returns a function that shows a dashboard toast. The docs give the shape
   * `(text, opts?) => void` and define no option; this app passes none.
   */
  export function useNotify(): (text: string, opts?: Record<string, unknown>) => void

  /** Returns a function that sets this app's sidebar badge count. Zero clears it. */
  export function useNavBadge(): (count: number) => void

  /**
   * Returns the dashboard's chat launcher (RG-S4, read from the shipped 0.12.2
   * dashboard, not observed live). `openChat({ slotKey })` opens that existing
   * slot. Called without a slot key it may create a chat, so this app never
   * does that. A host older than the hook exports nothing under this name.
   */
  export function useChatLauncher(): { openChat(options?: { slotKey?: string }): void }
}
