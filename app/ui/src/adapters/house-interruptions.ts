// Host effects for interruptions (Spec 4 task 14.3; Requirements 9.5, 9.6):
// the sidebar badge and dashboard toasts. The badge shows how many things wait
// on the Operator and nothing else. A toast is raised only for a ghost that is
// waiting, blocked or failed, at most one per ghost per 10 seconds, as decided
// by the pure coalescer. Progress, streaming text and tool calls never reach
// this file. Components do not call the host hooks themselves.
import { useEffect, useRef } from 'react'
import type { GhostSnapshot, GhostTransition } from '../core/ghost-state'
import type { NeedsYouItem } from '../core/house-view'
import {
  EMPTY_COALESCER,
  collectInterruptions,
  flushCoalescer,
  nextFlushAtMs,
  offerInterruption,
  type CoalescerState,
  type Toast,
} from '../core/notify-coalescer'
import { useNavBadge, useNotify } from './sdk'

export interface HouseInterruptionsInput {
  /** The open Mansion, or null while none is open. */
  readonly mansionId: string | null
  readonly transitions: readonly GhostTransition[]
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  /** Current Needs You items. Its length is the badge. */
  readonly items: readonly NeedsYouItem[]
  readonly names?: Readonly<Record<string, string>>
  /** Milliseconds clock. Defaults to Date.now. */
  readonly now?: () => number
}

/** A host hook that fails must not take the house down: the page's own state still shows everything. */
function quietly(run: () => void): void {
  try {
    run()
  } catch {
    // The in-page Needs You control and the live region carry the same information.
  }
}

export function useHouseInterruptions(input: HouseInterruptionsInput): void {
  const notify = useNotify()
  const setBadge = useNavBadge()
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  const badgeRef = useRef(setBadge)
  badgeRef.current = setBadge
  const nowRef = useRef(input.now)
  nowRef.current = input.now

  const coalescer = useRef<CoalescerState>(EMPTY_COALESCER)
  const seen = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const count = input.mansionId === null ? 0 : input.items.length
  useEffect(() => {
    quietly(() => badgeRef.current(count))
  }, [count])
  // Leaving the house clears the badge: nothing of this page waits any more.
  useEffect(() => () => quietly(() => badgeRef.current(0)), [])

  // A new Mansion starts with empty windows and nothing offered.
  useEffect(() => {
    coalescer.current = EMPTY_COALESCER
    seen.current = new Set()
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [input.mansionId])

  useEffect(() => {
    if (input.mansionId === null) return
    const clock = () => (nowRef.current ?? Date.now)()
    const show = (toasts: readonly Toast[]) => {
      for (const toast of toasts) quietly(() => notifyRef.current(toast.text))
    }
    const schedule = () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      const next = nextFlushAtMs(coalescer.current)
      if (next === null) return
      timer.current = setTimeout(
        () => {
          timer.current = null
          const flushed = flushCoalescer(coalescer.current, clock())
          coalescer.current = flushed.state
          show(flushed.toasts)
          schedule()
        },
        Math.max(next - clock(), 0),
      )
    }

    const collected = collectInterruptions({
      mansionId: input.mansionId,
      transitions: input.transitions,
      snapshots: input.snapshots.values(),
      items: input.items,
      seen: seen.current,
      names: input.names,
    })
    for (const id of collected.seen) seen.current.add(id)
    for (const interruption of collected.interruptions) {
      const step = offerInterruption(coalescer.current, interruption, clock())
      coalescer.current = step.state
      show(step.toasts)
    }
    schedule()
  }, [input.mansionId, input.transitions, input.snapshots, input.items, input.names])
}
