// Shared helpers for Foyer DOM tests. Not a test file and not shipped: nothing
// outside *.test.tsx imports it.
import type { MansionDescriptor, MansionStatus } from '../../core/mansion-api'

export const MANSIONS = '/apps/haunted-house/api/mansions'
export const OPEN = '/apps/haunted-house/api/mansions/open'
export const ROOT = '~/workspace/haunted-house/mansions'

export function mansion(name: string, status: MansionStatus = 'ready'): MansionDescriptor {
  return { name, projectSpec: name, displayPath: `${ROOT}/${name}`, status }
}

export function listBody(...mansions: MansionDescriptor[]) {
  return { schemaVersion: 1, mansions }
}

/** What the host client throws for a non-2xx reply: a status and the unparsed body. */
export function httpError(status: number, code: string, message = 'raw /Users/someone/private text') {
  return Object.assign(new Error(`API ${status}`), {
    status,
    body: JSON.stringify({ error: { code, message } }),
  })
}

export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export function deferred<T = unknown>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Every element that announces changes to a screen reader, explicitly or through its role. */
export function liveRegions(container: ParentNode): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[aria-live], [role="status"], [role="alert"], [role="log"], [role="marquee"], [role="timer"], output',
    ),
  ]
}
