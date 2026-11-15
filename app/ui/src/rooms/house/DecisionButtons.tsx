// The two decision controls of a proposal. Approve and Reject are separate
// buttons; a control that may not be used stays focusable, says so with
// aria-disabled, and does nothing when activated. A null command means "off".
import { Check, X } from 'lucide-react'
import type { WorkflowCommand } from '../../core/house-view'

export interface DecisionButtonsProps {
  approve: WorkflowCommand | null
  reject: WorkflowCommand | null
  /** True while this proposal's own command is on its way. */
  busy: boolean
  /** What is decided, for the buttons' accessible names. */
  subject: string
  /** The id of the text that says why a control is off. */
  describedBy?: string
  onSend: (command: WorkflowCommand) => void
}

export function DecisionButtons({ approve, reject, busy, subject, describedBy, onSend }: DecisionButtonsProps) {
  return (
    <div className="hh-decide" aria-busy={busy}>
      <button
        type="button"
        className="hh-button hh-button-primary"
        aria-label={`Approve ${subject}`}
        aria-disabled={approve === null}
        aria-describedby={approve === null ? describedBy : undefined}
        onClick={() => {
          if (approve !== null) onSend(approve)
        }}
      >
        <Check size={16} aria-hidden />
        {busy ? 'Sending…' : 'Approve'}
      </button>
      <button
        type="button"
        className="hh-button hh-button-reject"
        aria-label={`Reject ${subject}`}
        aria-disabled={reject === null}
        aria-describedby={reject === null ? describedBy : undefined}
        onClick={() => {
          if (reject !== null) onSend(reject)
        }}
      >
        <X size={16} aria-hidden />
        Reject
      </button>
    </div>
  )
}
