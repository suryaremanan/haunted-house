// Ghost_Status_View (Spec 2, Requirements 10.4 to 10.8): the minimal list of
// ghost states for one Mansion. It renders only what the canonical fold
// produced: ghost rows, a persistence diagnostic, and the loading, catching-up
// and empty states. Provisional: the house-shell spec replaces it with rooms.
//
// Interruption budget: a derived transition into waiting, blocked or failed is
// announced once through the page's polite live region. Working, done and idle
// update in place. There are no toasts and no sounds here.
import { CircleCheck, Hourglass, LoaderCircle, Lock, Moon, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useSeanceLive, type SeanceLiveState } from '../adapters/seance-live'
import type { GhostState, GhostTransitionId } from '../core/ghost-state'
import { diagnosticText, ghostRows, interruptionsFor, type GhostRow } from '../core/ghost-status'

export interface GhostStatusViewProps {
  /** Canonical live or replay state, from `useSeanceLive`. */
  state: SeanceLiveState
  /** Display names by `ghost_id`. A ghost without one is named after its id. */
  ghostNames?: Readonly<Record<string, string>>
  /**
   * Receives each announcement for the page's one polite live region. Without
   * it the view renders its own region, for use outside the house page.
   */
  onAnnounce?: (message: string) => void
  /** Turns off the working spinner, like the "Still house" setting. */
  stillHouse?: boolean
}

// Plain CSS on Crew's theme variables, with fallbacks for hosts that lack them.
// Color is a hint only: every state has its own icon and its own words.
export const GHOST_STATUS_STYLES = `
.hh-ghosts { color: var(--card-fg, var(--text, inherit)); background: var(--card, transparent);
  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 16px 20px;
  max-width: 560px; margin: 24px; font: inherit; }
.hh-ghosts h2 { font-size: 1.125rem; margin: 0 0 12px; }
.hh-ghost-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.hh-ghost { display: grid; grid-template-columns: 18px minmax(6rem, auto) 1fr; column-gap: 10px; row-gap: 2px;
  align-items: center; }
.hh-ghost-name { font-weight: 600; overflow-wrap: anywhere; }
.hh-ghost-state { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; }
.hh-ghost-pending, .hh-ghost-reason { color: var(--muted, inherit); font-size: 0.875rem; }
.hh-ghost-reason { grid-column: 2 / -1; overflow-wrap: anywhere; }
.hh-ghost-icon { flex: none; color: var(--muted, currentColor); }
.hh-ghost[data-state="done"] .hh-ghost-icon { color: var(--ok, currentColor); }
.hh-ghost[data-state="waiting"] .hh-ghost-icon,
.hh-ghost[data-state="blocked"] .hh-ghost-icon,
.hh-ghost[data-state="failed"] .hh-ghost-icon { color: var(--warn, currentColor); }
.hh-ghosts-note { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 12px; overflow-wrap: anywhere; }
.hh-ghosts-note svg { flex: none; margin-top: 2px; }
.hh-ghosts-diagnostic svg { color: var(--warn, currentColor); }
.hh-ghosts-muted { color: var(--muted, inherit); }
.hh-ghosts-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
@keyframes hh-ghost-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ghosts:not([data-still="true"]) .hh-ghost[data-state="working"] .hh-ghost-icon {
    animation: hh-ghost-spin 2s linear infinite; }
}
`

function StateIcon({ state }: { state: GhostState }) {
  const common = { size: 18, 'aria-hidden': true, className: 'hh-ghost-icon' } as const
  switch (state) {
    case 'idle':
      return <Moon {...common} />
    case 'working':
      return <LoaderCircle {...common} />
    case 'waiting':
      return <Hourglass {...common} />
    case 'blocked':
      return <Lock {...common} />
    case 'failed':
      return <TriangleAlert {...common} />
    case 'done':
      return <CircleCheck {...common} />
  }
}

function GhostRowView({ row }: { row: GhostRow }) {
  return (
    <li className="hh-ghost" data-state={row.state} data-ghost={row.ghostId}>
      <StateIcon state={row.state} />
      <span className="hh-ghost-name">{row.name}</span>
      <span className="hh-ghost-state">
        <span className="hh-ghost-state-text">{row.stateText}</span>
        {row.pendingText === null ? null : <span className="hh-ghost-pending">{row.pendingText}</span>}
      </span>
      {row.reason === null ? null : <span className="hh-ghost-reason">{row.reason}</span>}
    </li>
  )
}

export function GhostStatusView({ state, ghostNames, onAnnounce, stillHouse = false }: GhostStatusViewProps) {
  const titleId = useId()
  const [ownAnnouncement, setOwnAnnouncement] = useState('')
  const announced = useRef(new Set<GhostTransitionId>())
  const announceRef = useRef(onAnnounce)
  announceRef.current = onAnnounce
  const namesRef = useRef(ghostNames)
  namesRef.current = ghostNames

  // Runs when the fold produced new transitions. Each transition is looked at
  // once, so a re-render or a redelivered record never repeats an announcement.
  useEffect(() => {
    const { seen, message } = interruptionsFor(
      state.transitions,
      state.snapshots.values(),
      announced.current,
      namesRef.current,
    )
    for (const id of seen) announced.current.add(id)
    if (message === null) return
    if (announceRef.current) announceRef.current(message)
    else setOwnAnnouncement(message)
  }, [state.transitions, state.snapshots])

  const rows = ghostRows(state.snapshots.values(), ghostNames)
  const loading = !state.loaded && state.diagnostic === null
  return (
    <section className="hh-ghosts" aria-labelledby={titleId} aria-busy={loading || state.catchingUp} data-still={stillHouse}>
      <style>{GHOST_STATUS_STYLES}</style>
      <h2 id={titleId}>Ghosts</h2>
      {state.diagnostic === null ? null : (
        <p className="hh-ghosts-note hh-ghosts-diagnostic">
          <TriangleAlert size={16} aria-hidden />
          <span>{diagnosticText(state.diagnostic)}</span>
        </p>
      )}
      {loading ? (
        <p className="hh-ghosts-note hh-ghosts-muted">
          <RefreshCw size={16} aria-hidden />
          <span>Loading the séance log…</span>
        </p>
      ) : null}
      {state.loaded && state.catchingUp ? (
        <p className="hh-ghosts-note hh-ghosts-muted">
          <RefreshCw size={16} aria-hidden />
          <span>Catching up with the séance log…</span>
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="hh-ghost-rows" aria-label="Ghost states">
          {rows.map((row) => (
            <GhostRowView key={row.key} row={row} />
          ))}
        </ul>
      ) : state.loaded ? (
        <p className="hh-ghosts-note hh-ghosts-muted">
          <Moon size={16} aria-hidden />
          <span>No ghost has stirred in this mansion yet.</span>
        </p>
      ) : null}
      {onAnnounce ? null : (
        <p className="hh-ghosts-announcer" aria-live="polite">
          {ownAnnouncement}
        </p>
      )}
    </section>
  )
}

export interface MansionGhostStatusProps extends Omit<GhostStatusViewProps, 'state'> {
  /** The open Mansion, or null while none is open. */
  mansionId: string | null
}

/** `GhostStatusView` wired to the canonical state of one Mansion, live or replay. */
export function MansionGhostStatus({ mansionId, ...view }: MansionGhostStatusProps) {
  return <GhostStatusView state={useSeanceLive(mansionId)} {...view} />
}
