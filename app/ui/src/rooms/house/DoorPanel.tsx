// One Door proposal (Requirements 2.4, 9.2, 9.7): the exact document path and
// revision, separate Approve and Reject controls while it is pending, and the
// outcome with its actor once it is decided anywhere.
import { Ban, CircleCheck, DoorClosed, Lock } from 'lucide-react'
import { useId } from 'react'
import type { DoorDecisionView, WorkflowCommand } from '../../core/house-view'
import { DecisionButtons } from './DecisionButtons'

export interface DoorPanelProps {
  view: DoorDecisionView
  onSend: (command: WorkflowCommand) => void
}

export function DoorPanel({ view, onSend }: DoorPanelProps) {
  const titleId = useId()
  const blockedId = useId()
  const pending = view.state === 'pending'
  return (
    <article className="hh-proposal" aria-labelledby={titleId} data-state={view.state} data-proposal={view.proposalId}>
      <div className="hh-proposal-head">
        <DoorClosed size={16} aria-hidden />
        <h5 id={titleId}>{view.title}</h5>
      </div>
      <dl className="hh-facts">
        <dt>Document</dt>
        <dd>
          <code>{view.documentPath}</code>
        </dd>
        <dt>Revision</dt>
        <dd>
          {view.revisionText}, {view.sizeText}
        </dd>
        <dt>Digest</dt>
        <dd>
          <code>{view.digestPrefix}</code> (first 12 characters of its SHA-256)
        </dd>
      </dl>
      {pending ? (
        <>
          <p className="hh-proposal-sub">
            Your decision covers exactly this revision. If the document changes, it needs a new decision. Approving opens
            the door; the next phase starts only when you start it.
          </p>
          {view.blockedText === null ? null : (
            <p className="hh-proposal-note hh-proposal-blocked" id={blockedId}>
              <Lock size={16} aria-hidden />
              <span>{view.blockedText}</span>
            </p>
          )}
          <DecisionButtons
            approve={view.approve}
            reject={view.reject}
            busy={view.busy}
            subject={`${view.title}, ${view.revisionText.toLowerCase()}`}
            describedBy={view.blockedText === null ? undefined : blockedId}
            onSend={onSend}
          />
        </>
      ) : (
        <p className="hh-proposal-note hh-proposal-outcome" data-outcome={view.state}>
          {view.state === 'approved' ? <CircleCheck size={16} aria-hidden /> : <Ban size={16} aria-hidden />}
          <span>{view.outcomeText}</span>
        </p>
      )}
    </article>
  )
}
