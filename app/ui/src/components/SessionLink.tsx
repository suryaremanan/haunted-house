// The secondary way out to a ghost's existing Crew session (Spec 5
// Requirements 11.2 to 11.4). It opens the run's own slot through the one
// verified host call and never creates a chat. While that contract is not
// available, on a host without it, or on a recording, the control stays
// visible and off, and says why.
import { ExternalLink } from 'lucide-react'
import { useId } from 'react'
import type { SessionLinkView } from '../core/room-view'

export interface SessionLinkProps {
  view: SessionLinkView
  /** Opens an existing session by slot key. Null when the host offers no way to. */
  onOpen: ((slotKey: string) => void) | null
}

export const SESSION_LINK_NO_HOST = 'This version of Crew offers no way to open the session from here. Find it in Crew by its name.'

export function SessionLink({ view, onOpen }: SessionLinkProps) {
  const reasonId = useId()
  const slotKey = view.slotKey
  const off = slotKey === null || onOpen === null
  const reason = view.disabledText ?? (onOpen === null ? SESSION_LINK_NO_HOST : null)
  return (
    <p className="hh-session-link" data-session-link={off ? 'off' : 'on'}>
      <button
        type="button"
        className="hh-button hh-button-quiet"
        aria-disabled={off}
        aria-describedby={off && reason !== null ? reasonId : undefined}
        data-slot={slotKey ?? undefined}
        onClick={() => {
          if (slotKey !== null && onOpen !== null) onOpen(slotKey)
        }}
      >
        <ExternalLink size={14} aria-hidden />
        {view.label}
      </button>
      {off && reason !== null ? (
        <span id={reasonId} className="hh-session-link-note">
          {reason}
        </span>
      ) : null}
    </p>
  )
}
