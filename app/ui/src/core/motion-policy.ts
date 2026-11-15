// The Motion Policy (Spec 6, Requirements 7.2, 7.3, 7.5, 7.8): whether the
// house may run its optional, low-frequency animation. Either suppression
// signal turns it off: the in-app Still House toggle or the browser's
// reduced-motion preference. The browser preference wins even when the toggle
// is off. Nothing the Operator reads or operates depends on motion.
//
// Pure: watching the media query and holding the toggle belong to the caller.
// No React, DOM, SDK, or clock.

export interface MotionInputs {
  /** The in-app Still House toggle. */
  readonly stillHouse: boolean
  /** The browser's `prefers-reduced-motion: reduce`. */
  readonly prefersReducedMotion: boolean
}

export const EFFECTIVE_MOTIONS = ['none', 'low-frequency'] as const
/** The complete output set. `low-frequency` permits only loops of two seconds or longer. */
export type EffectiveMotion = (typeof EFFECTIVE_MOTIONS)[number]

/** The shortest full cycle an optional animation may have, in seconds. */
export const MIN_MOTION_CYCLE_SECONDS = 2

/** `none` when either input asks for stillness; `low-frequency` only when neither does. */
export function resolveMotionPolicy(inputs: MotionInputs): EffectiveMotion {
  // Anything other than an explicit `false` counts as a request for stillness.
  return inputs.stillHouse === false && inputs.prefersReducedMotion === false ? 'low-frequency' : 'none'
}

/**
 * What the browser's media query says, read fail-closed: when it cannot be
 * read (no listener support, no answer yet), motion is treated as unwanted.
 */
export function reducedMotionFrom(matches: boolean | null | undefined): boolean {
  return matches !== false
}

export interface MotionState extends MotionInputs {
  /** Derived, never set on its own. */
  readonly effective: EffectiveMotion
}

export function motionState(inputs: MotionInputs): MotionState {
  return { stillHouse: inputs.stillHouse, prefersReducedMotion: inputs.prefersReducedMotion, effective: resolveMotionPolicy(inputs) }
}
