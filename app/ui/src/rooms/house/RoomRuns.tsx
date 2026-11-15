// The runs of the open room, after its documents, state and decisions (Spec 5
// Requirements 11.2, 11.3, 12.1, 12.5): what each run produced, its explicit
// Cancel or Retry, and last the secondary link to its existing Crew session.
// Runs already shown on the Workshop task board are not repeated here.
import { GhostOutputSummary } from '../../components/GhostOutputSummary'
import { RunRecoveryControls } from '../../components/RunRecoveryControls'
import { SessionLink } from '../../components/SessionLink'
import type { RoomCommand, RoomProjection } from '../../core/room-view'

export interface RoomRunsProps {
  output: RoomProjection
  onSend: (command: RoomCommand) => void
  onOpenSession: ((slotKey: string) => void) | null
}

export function RoomRuns({ output, onSend, onOpenSession }: RoomRunsProps) {
  const onBoard = new Set(
    output.taskBoard?.waves.flatMap((wave) => wave.tasks.flatMap((row) => (row.run === null ? [] : [row.run.runId]))) ?? [],
  )
  const runs = output.runs.filter((run) => !onBoard.has(run.runId))
  if (runs.length === 0) return null
  return (
    <div className="hh-phase" data-room-runs>
      <p className="hh-proposal-group">Runs in this room</p>
      <ul className="hh-runs">
        {runs.map((run) => (
          <li key={run.runId}>
            <GhostOutputSummary run={run} />
            <RunRecoveryControls run={run} onSend={onSend} />
            <SessionLink view={run.sessionLink} onOpen={onOpenSession} />
          </li>
        ))}
      </ul>
    </div>
  )
}
