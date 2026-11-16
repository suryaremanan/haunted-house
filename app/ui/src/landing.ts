// Landing copy of the page: what Haunted House is, in one line, and the
// invitation the static replay shows. Plain data, so the live bundle's root
// module keeps exporting only its page component.

/** What Haunted House is, in one line, under the title on the landing page. */
export const TAGLINE =
  'A house for your AI agents: each room is a phase of spec-driven work, each ghost an agent you can watch, and each door opens only when you approve.'

/** A mansion the landing page invites the visitor into. */
export interface LandingInvitation {
  /** Selected once the list loads, if listed and ready. Opening it is still a press. */
  readonly mansion: string
  /** One line shown above the mansion list. */
  readonly text: string
}

/** The static replay's invitation: its recording is the building of demo-mansion. */
export const REPLAY_LANDING: LandingInvitation = {
  mansion: 'demo-mansion',
  text: 'Watch a mansion get built, then step through what happened.',
}
