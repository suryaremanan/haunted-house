// Types for the parts of @kirocrew/app-sdk this app uses. The Crew dashboard
// supplies the module at runtime through its import map; there is no npm
// package or published typings. Only src/adapters/sdk.ts may import it.
declare module '@kirocrew/app-sdk' {
  /** Thrown by AppApiClient methods when the gateway answers with a non-2xx status. */
  export interface AppApiError extends Error {
    status: number
  }

  /**
   * Permission-scoped client for gateway paths listed in the manifest's
   * `permissions.api`. Each method resolves to the parsed JSON body, and
   * rejects on non-2xx (with an AppApiError) or for an out-of-scope path.
   */
  export interface AppApiClient {
    get(path: string): Promise<unknown>
    post(path: string, body?: unknown): Promise<unknown>
    put(path: string, body?: unknown): Promise<unknown>
    patch(path: string, body?: unknown): Promise<unknown>
    del(path: string): Promise<unknown>
  }

  export function useAppApi(): AppApiClient

  /** Subscribes to a gateway WebSocket event type. Returns an unsubscribe function. */
  export function useAppEvents(event: string, cb: (data: unknown) => void): () => void
}
