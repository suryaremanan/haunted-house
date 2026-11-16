// What the replay shows right now: playback status, position, the record the
// Cursor last presented, and the upstream projection of the prefix in the
// words the rooms use. Text with an icon beside it; nothing here is a live
// region, so playback updates it in place without an announcement.
import { CircleCheck, DoorClosed, Ghost, MapPin, Pause, Play } from 'lucide-react'
import type { AtticSummary } from '../../core/attic-view'
import type { PlaybackStatus } from '../../core/replay-reducer'

export interface ReplaySummaryProps {
  summary: AtticSummary
  status: PlaybackStatus
}

function StatusIcon({ status }: { status: PlaybackStatus }) {
  if (status === 'playing') return <Play size={16} aria-hidden />
  if (status === 'complete') return <CircleCheck size={16} aria-hidden />
  return <Pause size={16} aria-hidden />
}

export function ReplaySummary({ summary, status }: ReplaySummaryProps) {
  return (
    <div className="hh-attic-section" data-attic="summary">
      <p className="hh-attic-line hh-attic-status" data-status={status}>
        <StatusIcon status={status} />
        <span>
          {summary.statusText}. {summary.positionText}. {summary.totalText}.
        </span>
      </p>
      <p className="hh-attic-line" data-attic="current">
        <MapPin size={16} aria-hidden />
        <span>{summary.currentText}</span>
      </p>
      {summary.phases.length === 0 ? null : (
        <ul className="hh-attic-list" aria-label="Phases and Doors at this point">
          {summary.phases.map((phase) => (
            <li key={phase.phase} className="hh-attic-line" data-phase={phase.phase} data-status={phase.status} data-door={phase.door}>
              <DoorClosed size={16} aria-hidden />
              <span>{phase.text}</span>
            </li>
          ))}
        </ul>
      )}
      {summary.ghosts.length === 0 ? null : (
        <ul className="hh-attic-list" aria-label="Ghosts at this point">
          {summary.ghosts.map((ghost) => (
            <li key={ghost.ghostId} className="hh-attic-line" data-ghost={ghost.ghostId} data-state={ghost.state}>
              <Ghost size={16} aria-hidden />
              <span>{ghost.text}</span>
            </li>
          ))}
        </ul>
      )}
      {summary.waitingText === null ? null : <p className="hh-attic-muted">{summary.waitingText}</p>}
    </div>
  )
}
