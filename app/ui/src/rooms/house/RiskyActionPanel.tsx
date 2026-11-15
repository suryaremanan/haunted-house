// One risky-action proposal (Requirements 3.4, 9.3, 9.4, 9.7): the complete
// Action_Descriptor, its scope, the digest prefix and the one-attempt wording
// come before the controls. A descriptor that cannot be shown completely
// disables approval and marks the proposal blocked.
import { Lock } from 'lucide-react'
import { useId } from 'react'
import type { DetailLine, RiskyDecisionView, WorkflowCommand } from '../../core/house-view'
import { DecisionButtons } from './DecisionButtons'
import { RiskyIcon } from './house-icons'

export interface RiskyActionPanelProps {
  view: RiskyDecisionView
  onSend: (command: WorkflowCommand) => void
}

function Facts({ title, lines, empty }: { title: string; lines: readonly DetailLine[]; empty: string }) {
  return (
    <>
      <p className="hh-proposal-group">{title}</p>
      {lines.length === 0 ? (
        <p className="hh-proposal-sub">{empty}</p>
      ) : (
        <dl className="hh-facts">
          {lines.map((line, index) => (
            <div key={`${line.label}-${index}`} style={{ display: 'contents' }}>
              <dt>{line.label}</dt>
              <dd>
                <code>{line.value}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

export function RiskyActionPanel({ view, onSend }: RiskyActionPanelProps) {
  const ghostName = view.ghostName
  const titleId = useId()
  const blockedId = useId()
  const pending = view.status === 'pending'
  return (
    <article
      className="hh-proposal"
      aria-labelledby={titleId}
      data-state={view.status}
      data-blocked={pending && !view.complete}
      data-proposal={view.proposalId}
    >
      <div className="hh-proposal-head">
        <RiskyIcon status={view.status} />
        <h5 id={titleId}>
          {ghostName} asks: {view.title}
        </h5>
      </div>
      <p className="hh-proposal-sub">{view.statusText}</p>
      {view.complete ? (
        <>
          <Facts title="Scope" lines={view.scope} empty="No scope." />
          <Facts title="Exact arguments" lines={view.arguments} empty="No arguments." />
          <Facts title="Paths it may touch" lines={view.paths} empty="No paths." />
        </>
      ) : null}
      <dl className="hh-facts">
        <dt>Digest</dt>
        <dd>
          <code>{view.digestPrefix}</code> (first 12 characters of the action's SHA-256)
        </dd>
      </dl>
      {pending ? (
        <>
          <p className="hh-proposal-sub">{view.oneAttemptText}</p>
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
            subject={`${view.title.toLowerCase()} for ${ghostName}, digest ${view.digestPrefix}`}
            describedBy={view.blockedText === null ? undefined : blockedId}
            onSend={onSend}
          />
        </>
      ) : view.outcomeText === null ? null : (
        <p className="hh-proposal-note hh-proposal-outcome" data-outcome={view.status}>
          <RiskyIcon status={view.status} />
          <span>{view.outcomeText}</span>
        </p>
      )}
    </article>
  )
}
