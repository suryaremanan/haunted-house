// What one run produced and where it stands (Spec 5 Requirements 11.1, 11.8,
// 12.6): the ghost's Spec 2 state as an icon plus words, the attempt, the
// bounded Ghost_Result summary, the reason of a block or failure, and the
// task claim the run may write. Progress shows here in place; it never
// toasts or announces.
import { CircleDashed, Lock, TriangleAlert } from 'lucide-react'
import type { RunView } from '../core/room-view'
import { GHOST_TONE, GhostIcon } from '../rooms/house/house-icons'

export interface GhostOutputSummaryProps {
  run: RunView
}

export function GhostOutputSummary({ run }: GhostOutputSummaryProps) {
  return (
    <div className="hh-run" data-run={run.runId} data-ghost={run.ghostId} data-state={run.state ?? 'earlier'}>
      <p className="hh-room-line" data-tone={run.state === null ? 'plain' : GHOST_TONE[run.state]}>
        {run.state === null ? <CircleDashed size={16} aria-hidden /> : <GhostIcon state={run.state} />}
        <span>
          {run.ghostName}: {run.stateText}
          {run.taskId === null ? '' : `, task ${run.taskId}`}. {run.attemptText}.
        </span>
      </p>
      {run.summary === null ? null : (
        <p className="hh-run-summary" data-summary>
          {run.summary}
        </p>
      )}
      {run.reasonText === null ? null : (
        <p className="hh-room-line" data-tone="attention" data-reason>
          <TriangleAlert size={16} aria-hidden />
          <span>{run.reasonText}</span>
        </p>
      )}
      {run.writeScope.length === 0 ? null : (
        <p className="hh-room-line" data-claim>
          <Lock size={16} aria-hidden />
          <span>
            This run may write only:{' '}
            {run.writeScope.map((path, index) => (
              <span key={path}>
                {index > 0 ? ', ' : ''}
                <code>{path}</code>
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  )
}
