// Host effects of the house (Spec 6 tasks 3.2 and 7.3; Requirements 4.4 to
// 4.7, 8.1 to 8.10): the dashboard toast, the sidebar badge, and the host
// theme. This is the only caller of those three host wrappers.
//
// - Interruptions. New canonical ghost transitions are offered to the pure
//   Interruption Policy. One timer, owned here, closes a burst 10 seconds
//   after its last accepted event. Each summary the policy emits goes, as the
//   same text, to one host toast and to `onSummary` (the page's one polite
//   live region). Whether Crew can replace a toast by id is unverified
//   (HUI-S1), so nothing is shown before the burst closes.
// - Badge. Set from the number of Needs You items whenever it changes, and
//   set to zero when the house unmounts. It never waits for a burst.
// - A host hook that is missing, throws, or rejects changes nothing else: the
//   live region still gets the summary and the in-page count still shows.
//   Nothing is retried.
//
// Idle, working and done, routine progress, streaming text and tool activity
// start no timer and produce no effect: the policy rejects them and this file
// schedules only when the policy holds an open burst.
import { useEffect, useRef } from 'react'
import type { GhostSnapshot, GhostTransition } from '../core/ghost-state'
import type { RoomId } from '../core/house-registry'
import {
  EMPTY_INTERRUPTION_STATE,
  collectCanonicalTransitions,
  flushInterruption,
  nextInterruptionFlushAtMs,
  reduceInterruption,
  type HostSummary,
  type InterruptionEffect,
  type InterruptionPolicyState,
} from '../core/interruption-policy'
import { useHostNavBadge, useHostNotify, useHostTheme, type HostThemeSnapshot } from './sdk'

export interface HostEffectsInput {
  /** The open Mansion. A different Mansion starts with nothing seen and no burst. */
  readonly mansionId: string
  /**
   * False while the house shows a recording being played back: no toast, no
   * summary, and a badge of zero. Playback interrupts nobody.
   */
  readonly active: boolean
  /** Every derived transition of this Mansion in Canonical_Order (Spec 2). */
  readonly transitions: readonly GhostTransition[]
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  readonly roomOf: (ghostId: string) => RoomId | null
  readonly nameOf: (ghostId: string) => string
  /** `projection.needsYou.length`. */
  readonly needsYouCount: number
  /** Receives each summary for the one polite live region. */
  readonly onSummary: (summary: HostSummary) => void
  /** Milliseconds clock. Defaults to Date.now. */
  readonly now?: () => number
}

export interface HostEffects {
  /** The reactive, normalized host theme. */
  readonly theme: HostThemeSnapshot
}

export function useHostEffects(input: HostEffectsInput): HostEffects {
  const theme = useHostTheme()
  const notify = useHostNotify()
  const setBadge = useHostNavBadge()

  const latest = useRef(input)
  latest.current = input

  const policy = useRef<InterruptionPolicyState>(EMPTY_INTERRUPTION_STATE)
  const offered = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The badge follows the count at once. A refused call is not repeated: the
  // next call happens only when the count changes.
  const count = input.active ? Math.max(0, Math.trunc(input.needsYouCount) || 0) : 0
  useEffect(() => {
    setBadge(count)
  }, [count, setBadge])
  // Leaving the house clears the badge: nothing of this page waits any more.
  useEffect(() => () => void setBadge(0), [setBadge])

  // A new Mansion, or playback, starts with nothing seen, no burst and no timer.
  useEffect(() => {
    policy.current = EMPTY_INTERRUPTION_STATE
    offered.current = new Set()
    return () => {
      // A burst still open at unmount is discarded: no toast, no announcement.
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      policy.current = EMPTY_INTERRUPTION_STATE
    }
  }, [input.mansionId, input.active])

  useEffect(() => {
    if (!input.active) return
    const clock = () => (latest.current.now ?? Date.now)()
    const emit = (effects: readonly InterruptionEffect[]) => {
      for (const effect of effects) {
        if (effect.kind !== 'summary') continue
        // The toast may fail; the live region gets the same words either way.
        notify(effect.text)
        latest.current.onSummary({ text: effect.text, eventIds: effect.eventIds })
      }
    }
    const schedule = () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      const at = nextInterruptionFlushAtMs(policy.current)
      if (at === null) return
      timer.current = setTimeout(
        () => {
          timer.current = null
          const step = flushInterruption(policy.current, clock())
          policy.current = step.state
          emit(step.effects)
          // Still open only if the timer fired early; then wait out the rest.
          schedule()
        },
        Math.max(at - clock(), 0),
      )
    }

    const collected = collectCanonicalTransitions({
      transitions: input.transitions,
      currentState: (ghostId) => input.snapshots.get(ghostId)?.state ?? null,
      offered: offered.current,
      roomOf: input.roomOf,
      nameOf: input.nameOf,
      observedAtMs: clock(),
    })
    for (const id of collected.offered) offered.current.add(id)
    let accepted = false
    for (const event of collected.events) {
      const step = reduceInterruption(policy.current, event)
      accepted = accepted || step.state !== policy.current
      policy.current = step.state
      emit(step.effects)
    }
    // The one timer is reset only by an accepted event; ambient activity leaves it alone.
    if (accepted) schedule()
  }, [input.active, input.transitions, input.snapshots, input.roomOf, input.nameOf, notify])

  return { theme }
}
