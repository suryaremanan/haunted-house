declare module '@kirocrew/app-sdk' {
  export interface AppApiClient {
    get(path: string): Promise<unknown>
    post(path: string, body?: unknown): Promise<unknown>
  }

  export function useAppApi(): AppApiClient

  /** The host owns cleanup through the calling component's effect lifecycle. */
  export function useAppEvents(event: string, callback: (data: unknown) => void): void
}
