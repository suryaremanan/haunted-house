// The Séance Room output (Spec 5 Requirement 14, stretch): the Medium's
// verdict, the review cycle, findings traced to requirements and files, and
// the repair task proposed for each. It is rendered only when the backend
// says the Séance Room is on and has a review; by default it is off and this
// panel never appears. The Mansion Shell's panel host supplies the labelled
// panel and its heading. It shows proposals and decides nothing: an approved
// repair runs through the Workshop like any other task, and nothing reviews a
// fourth time on its own.
import { Ban, CircleCheck, Hourglass, LoaderCircle, Lock } from 'lucide-react'
import { SessionLink } from '../../components/SessionLink'
import type { ReviewView } from '../../core/room-view'
import { GHOST_TONE, GhostIcon } from '../house/house-icons'

export interface SeanceRoomPanelProps {
  view: ReviewView
  onOpenSession: ((slotKey: string) => void) | null
}

function VerdictIcon({ status }: { status: ReviewView['status'] }) {
  const common = { size: 16, 'aria-hidden': true } as const
  switch (status) {
    case 'reviewing':
      return <LoaderCircle {...common} className="hh-spin" />
    case 'pass':
      return <CircleCheck {...common} />
    case 'changes_requested':
      return <Ban {...common} />
    case 'blocked':
      return <Lock {...common} />
  }
}

export function SeanceRoomPanel({ view, onOpenSession }: SeanceRoomPanelProps) {
  return (
    <div className="hh-room-panel" data-review={view.status}>
      <div className="hh-output">
        <p className="hh-room-line" data-tone={view.status === 'pass' ? 'ok' : view.status === 'reviewing' ? 'plain' : 'attention'} data-verdict>
          <VerdictIcon status={view.status} />
          <span>
            {view.statusText}. {view.cycleText}.
          </span>
        </p>
        {view.limitText === null ? null : (
          <p className="hh-proposal-note hh-proposal-blocked" data-review-limit>
            <Lock size={16} aria-hidden />
            <span>{view.limitText}</span>
          </p>
        )}
        {view.findings.length === 0 ? null : (
          <ul className="hh-tasks" aria-label="Review findings">
            {view.findings.map((finding) => (
              <li key={finding.findingId} className="hh-task" data-finding={finding.findingId}>
                <p className="hh-run-summary">{finding.summary}</p>
                <dl className="hh-facts">
                  <dt>Requirements</dt>
                  <dd>{finding.requirementsText}</dd>
                  <dt>Files</dt>
                  <dd>
                    {finding.paths.length === 0
                      ? 'None'
                      : finding.paths.map((path, index) => (
                          <span key={path}>
                            {index > 0 ? ', ' : ''}
                            <code>{path}</code>
                          </span>
                        ))}
                  </dd>
                </dl>
                {finding.repair === null ? null : (
                  <p className="hh-room-line" data-repair={finding.repair.status}>
                    <Hourglass size={16} aria-hidden />
                    <span>
                      Repair task {finding.repair.taskId}: {finding.repair.title}. {finding.repair.statusText}. May write:{' '}
                      {finding.repair.writes.map((path, index) => (
                        <span key={path}>
                          {index > 0 ? ', ' : ''}
                          <code>{path}</code>
                        </span>
                      ))}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hh-phase">
        <p className="hh-room-line" data-tone={view.state === null ? 'plain' : GHOST_TONE[view.state]}>
          <GhostIcon state={view.state ?? 'idle'} />
          <span>
            {view.ghostName}: {view.stateText}
          </span>
        </p>
        <SessionLink view={view.sessionLink} onOpen={onOpenSession} />
      </div>
    </div>
  )
}
