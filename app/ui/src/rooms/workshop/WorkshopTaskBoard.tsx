// The Workshop task board (Spec 5 Requirements 7.1, 7.9, 7.10, 8.1 to 8.3,
// 8.6, 9.7, 11.1 to 11.3): every leaf task of the approved plan by wave, with
// its state in words, its requirement references, the files it may write,
// queue and backpressure detail, the Tinker working on it, and one explicit
// start for the tasks the Operator ticked. Ticking sends nothing. At most
// three Tinkers work at once; the board says how many do.
import { Ban, Check, CircleDashed, Hourglass, LoaderCircle, Lock, Play, TriangleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { GhostOutputSummary } from '../../components/GhostOutputSummary'
import { RunRecoveryControls } from '../../components/RunRecoveryControls'
import { SessionLink } from '../../components/SessionLink'
import type { RoomCommand, TaskBoardStatus, TaskBoardView, TaskRow } from '../../core/room-view'
import { useTaskSelection } from './use-task-selection'

export interface WorkshopTaskBoardProps {
  board: TaskBoardView
  onSend: (command: RoomCommand) => void
  onOpenSession: ((slotKey: string) => void) | null
}

const TASK_TONE: Readonly<Record<TaskBoardStatus, 'plain' | 'ok' | 'attention'>> = {
  not_selected: 'plain',
  queued: 'plain',
  backpressure: 'attention',
  active: 'plain',
  complete: 'ok',
  failed: 'attention',
  cancelled: 'attention',
  blocked: 'attention',
  skipped: 'plain',
}

function TaskIcon({ status }: { status: TaskBoardStatus }) {
  const common = { size: 16, 'aria-hidden': true } as const
  switch (status) {
    case 'complete':
      return <Check {...common} />
    case 'active':
      return <LoaderCircle {...common} className="hh-spin" />
    case 'queued':
    case 'backpressure':
      return <Hourglass {...common} />
    case 'failed':
      return <TriangleAlert {...common} />
    case 'blocked':
      return <Lock {...common} />
    case 'cancelled':
      return <Ban {...common} />
    case 'not_selected':
    case 'skipped':
      return <CircleDashed {...common} />
  }
}

interface TaskItemProps {
  row: TaskRow
  chosen: boolean
  onToggle: (taskId: string) => void
  onSend: (command: RoomCommand) => void
  onOpenSession: ((slotKey: string) => void) | null
}

function TaskItem({ row, chosen, onToggle, onSend, onOpenSession }: TaskItemProps) {
  const titleId = useId()
  return (
    <li className="hh-task" data-task={row.taskId} data-status={row.status} aria-labelledby={titleId}>
      <div className="hh-task-head">
        {row.selectable ? (
          <input
            type="checkbox"
            data-guide-control={`task:${row.taskId}`}
            checked={chosen}
            aria-label={`Select task ${row.taskId}: ${row.title}`}
            onChange={() => onToggle(row.taskId)}
          />
        ) : null}
        <span id={titleId}>
          <span className="hh-task-id">{row.taskId}</span> {row.title}
        </span>
        {row.optional ? <span className="hh-tag">Optional</span> : null}
      </div>
      <p className="hh-room-line" data-tone={TASK_TONE[row.status]} data-task-status>
        <TaskIcon status={row.status} />
        <span>
          {row.statusText}
          {row.attemptText === null ? '' : `. ${row.attemptText}`}
        </span>
      </p>
      {row.detail === null ? null : (
        <p className="hh-task-detail" data-task-detail>
          {row.detail}
        </p>
      )}
      <dl className="hh-facts">
        <dt>Requirements</dt>
        <dd>{row.requirementsText}</dd>
        <dt>May write</dt>
        <dd>
          {row.writes.map((path, index) => (
            <span key={path}>
              {index > 0 ? ', ' : ''}
              <code>{path}</code>
            </span>
          ))}
        </dd>
      </dl>
      {row.run === null ? null : (
        <>
          <GhostOutputSummary run={row.run} />
          <RunRecoveryControls run={row.run} onSend={onSend} />
          <SessionLink view={row.run.sessionLink} onOpen={onOpenSession} />
        </>
      )}
    </li>
  )
}

export function WorkshopTaskBoard({ board, onSend, onOpenSession }: WorkshopTaskBoardProps) {
  const selection = useTaskSelection(board)
  const titleId = useId()
  const blockedId = useId()
  const count = selection.chosen.size
  const startBlocked = board.startBlockedText ?? (count === 0 ? 'Tick at least one open task to start.' : null)
  return (
    <section className="hh-board" aria-labelledby={titleId} data-board>
      <h5 id={titleId}>Task board</h5>
      <p className="hh-room-line" data-board-summary>
        <Hourglass size={16} aria-hidden />
        <span>
          {board.doneCount} of {board.taskCount} tasks done. {board.capacityText}.
        </span>
      </p>
      {board.findings.length === 0 ? null : (
        <ul className="hh-findings" aria-label="Task plan findings">
          {board.findings.map((finding, index) => (
            <li key={`${finding.code}-${finding.location}-${index}`} data-finding={finding.code}>
              <code>{finding.location}</code>: {finding.message} <span className="hh-finding-code">({finding.code})</span>
            </li>
          ))}
        </ul>
      )}
      {board.waves.map((wave) => (
        <TaskWaveGroup key={wave.wave ?? 'outside'} title={wave.title}>
          {wave.tasks.map((row) => (
            <TaskItem
              key={row.taskId}
              row={row}
              chosen={selection.chosen.has(row.taskId)}
              onToggle={selection.toggle}
              onSend={onSend}
              onOpenSession={onOpenSession}
            />
          ))}
        </TaskWaveGroup>
      ))}
      <div className="hh-decide" aria-busy={board.startBusy}>
        <button
          type="button"
          className="hh-button hh-button-primary"
          data-control="start-workshop"
          data-guide-control="start-workshop"
          aria-disabled={selection.command === null}
          aria-describedby={selection.command === null && startBlocked !== null ? blockedId : undefined}
          onClick={() => {
            if (selection.command === null) return
            onSend(selection.command)
            selection.clear()
          }}
        >
          <Play size={16} aria-hidden />
          {board.startBusy ? 'Starting…' : count === 1 ? 'Start 1 selected task' : `Start ${count} selected tasks`}
        </button>
      </div>
      {selection.command !== null || startBlocked === null ? null : (
        <p className="hh-proposal-note hh-proposal-blocked" id={blockedId}>
          <Lock size={16} aria-hidden />
          <span>{startBlocked}</span>
        </p>
      )}
    </section>
  )
}

function TaskWaveGroup({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <div className="hh-wave" role="group" aria-labelledby={titleId}>
      <p className="hh-proposal-group" id={titleId}>
        {title}
      </p>
      <ul className="hh-tasks">{children}</ul>
    </div>
  )
}
