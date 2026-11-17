// The toolbar of an open Mansion (Spec 6 task 5.2; Requirements 3.7, 3.8, 7.1,
// 8.7): which Mansion is open, the Needs You shortcut with its count, the
// Still House toggle, and the system status tucked into a disclosure so the
// house map comes first. It computes nothing: the count and target come from
// the House Projection, motion from the Motion Policy in the shell.
import { Bell, Rotate3d, Volume2, VolumeX, Wind } from 'lucide-react'
import { forwardRef, useId, type ReactNode } from 'react'
import { needsYouCountText, type NeedsYouItem } from '../core/house-projection'
import type { MotionState } from '../core/motion-policy'

export interface HouseToolbarProps {
  mansionName: string
  needsYou: readonly NeedsYouItem[]
  /** Opens the first room that needs the Operator. Never called when nothing does. */
  onNeedsYou: (opener: HTMLElement) => void
  motion: MotionState
  onToggleStillHouse: () => void
  /** The foundation status details. Omitted on a page that has none. */
  status?: ReactNode
  /** The Sound Feature: off on every visit until the Operator presses this. */
  sound?: { readonly on: boolean; readonly available: boolean; readonly onToggle: () => void }
  /** The model's view: straight on, or turned to show its side. */
  view?: { readonly turned: boolean; readonly onToggle: () => void }
}

export const SOUND_UNAVAILABLE_TEXT = 'This browser cannot play the house sounds.'
export const STILL_HOUSE_REDUCED_TEXT = 'Your browser asks for reduced motion, so the house is still either way.'

/** The ref goes to the Mansion name, which takes focus when the Mansion opens. */
export const HouseToolbar = forwardRef<HTMLHeadingElement, HouseToolbarProps>(function HouseToolbar(
  { mansionName, needsYou, onNeedsYou, motion, onToggleStillHouse, status, sound, view },
  ref,
) {
  const reducedId = useId()
  const soundId = useId()
  const text = needsYouCountText(needsYou)
  const none = needsYou.length === 0
  return (
    <div className="hh-ui-toolbar" data-toolbar>
      <h2 className="hh-ui-mansion-name" ref={ref} tabIndex={-1}>
        <span className="hh-ui-muted">Mansion </span>
        {mansionName}
      </h2>
      <button
        type="button"
        className="hh-ui-needs"
        data-count={needsYou.length}
        data-opener-key="needs-you"
        aria-disabled={none}
        aria-label={none ? `Needs you: ${text}.` : `Needs you: ${text}. Go to the first.`}
        onClick={(event) => {
          if (!none) onNeedsYou(event.currentTarget)
        }}
      >
        <Bell size={16} aria-hidden />
        {text}
      </button>
      <button
        type="button"
        className="hh-ui-toggle"
        aria-pressed={motion.stillHouse}
        aria-describedby={motion.prefersReducedMotion ? reducedId : undefined}
        onClick={onToggleStillHouse}
      >
        <Wind size={16} aria-hidden />
        Still house: {motion.stillHouse ? 'on' : 'off'}
      </button>
      {motion.prefersReducedMotion ? (
        <span className="hh-ui-reason" id={reducedId}>
          {STILL_HOUSE_REDUCED_TEXT}
        </span>
      ) : null}
      {sound === undefined ? null : (
        <button
          type="button"
          className="hh-ui-toggle"
          data-sound-toggle
          aria-pressed={sound.on}
          aria-disabled={sound.available ? undefined : true}
          aria-describedby={sound.available ? undefined : soundId}
          onClick={sound.onToggle}
        >
          {sound.on ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
          Sound: {sound.on ? 'on' : 'off'}
        </button>
      )}
      {sound === undefined || sound.available ? null : (
        <span className="hh-ui-reason" id={soundId}>
          {SOUND_UNAVAILABLE_TEXT}
        </span>
      )}
      {view === undefined ? null : (
        <button type="button" className="hh-ui-toggle hh-ui-view-toggle" data-view-toggle aria-pressed={view.turned} onClick={view.onToggle}>
          <Rotate3d size={16} aria-hidden />
          Side view: {view.turned ? 'on' : 'off'}
        </button>
      )}
      {status === undefined ? null : (
        <details className="hh-ui-status">
          <summary>System status</summary>
          <div className="hh-ui-status-body">{status}</div>
        </details>
      )}
      {none ? null : (
        <ul className="hh-ui-needs-list" aria-label="Waiting on you">
          {needsYou.map((item) => (
            <li key={`${item.kind}:${item.id}`}>{item.label}</li>
          ))}
        </ul>
      )}
    </div>
  )
})
