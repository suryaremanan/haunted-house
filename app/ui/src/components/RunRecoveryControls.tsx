// Explicit Cancel and Retry for one run (Spec 5 Requirements 12.1, 12.5,
// 12.6). A control appears only where the backend offers it, sends only on a
// press, and stays focusable but off, with its reason, whenever the room's
// gate is closed. Nothing here retries or cancels on its own.
import { Ban, Lock, RotateCw } from 'lucide-react'
import { useId } from 'react'
import type { ControlView, RoomCommand, RunView } from '../core/room-view'

export interface RunRecoveryControlsProps {
  run: RunView
  onSend: (command: RoomCommand) => void
}

function Control({ view, kind, runId, describedBy, onSend }: { view: ControlView; kind: 'cancel' | 'retry'; runId: string; describedBy: string; onSend: (command: RoomCommand) => void }) {
  const command = view.command
  return (
    <button
      type="button"
      className={kind === 'cancel' ? 'hh-button hh-button-reject' : 'hh-button'}
      data-control={kind}
      data-guide-control={kind === 'retry' ? `retry:${runId}` : undefined}
      aria-disabled={command === null}
      aria-describedby={command === null && view.blockedText !== null ? describedBy : undefined}
      onClick={() => {
        if (command !== null) onSend(command)
      }}
    >
      {kind === 'cancel' ? <Ban size={16} aria-hidden /> : <RotateCw size={16} aria-hidden />}
      {view.busy ? 'Sending…' : view.label}
    </button>
  )
}

export function RunRecoveryControls({ run, onSend }: RunRecoveryControlsProps) {
  const blockedId = useId()
  const blockedText = run.cancel?.blockedText ?? run.retry?.blockedText ?? null
  if (run.cancel === null && run.retry === null && run.exhaustedText === null) return null
  return (
    <div className="hh-recovery" data-recovery={run.runId}>
      {run.cancel === null && run.retry === null ? null : (
        <div className="hh-decide" aria-busy={(run.cancel?.busy ?? false) || (run.retry?.busy ?? false)}>
          {run.cancel === null ? null : <Control view={run.cancel} kind="cancel" runId={run.runId} describedBy={blockedId} onSend={onSend} />}
          {run.retry === null ? null : <Control view={run.retry} kind="retry" runId={run.runId} describedBy={blockedId} onSend={onSend} />}
        </div>
      )}
      {blockedText === null ? null : (
        <p className="hh-proposal-note hh-proposal-blocked" id={blockedId}>
          <Lock size={16} aria-hidden />
          <span>{blockedText}</span>
        </p>
      )}
      {run.exhaustedText === null ? null : (
        <p className="hh-proposal-note" data-exhausted>
          <Lock size={16} aria-hidden />
          <span>{run.exhaustedText}</span>
        </p>
      )}
    </div>
  )
}
