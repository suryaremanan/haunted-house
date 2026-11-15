// One room document, shown before anything else in its room (Spec 5
// Requirements 11.1, 11.8): the text as safe rendered Markdown, the house's
// deterministic findings, the exact revision and digest, and what the room's
// ghost may write. It decides nothing and has no controls of its own.
import { Ban, CircleCheck, CircleDashed, FileText, Lock, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import type { DocumentView, ValidationState } from '../core/room-view'
import { MarkdownView } from './MarkdownView'

export interface ArtifactViewProps {
  view: DocumentView
}

const VALIDATION_TONE: Readonly<Record<ValidationState, 'plain' | 'ok' | 'attention'>> = {
  unwritten: 'plain',
  unknown: 'plain',
  valid: 'ok',
  invalid: 'attention',
}

function ValidationIcon({ state }: { state: ValidationState }) {
  const common = { size: 16, 'aria-hidden': true } as const
  switch (state) {
    case 'valid':
      return <CircleCheck {...common} />
    case 'invalid':
      return <Ban {...common} />
    default:
      return <CircleDashed {...common} />
  }
}

export function ArtifactView({ view }: ArtifactViewProps) {
  const titleId = useId()
  return (
    <article className="hh-artifact" aria-labelledby={titleId} data-artifact={view.phase} data-validation={view.validation}>
      <div className="hh-artifact-head">
        <FileText size={16} aria-hidden />
        <h5 id={titleId}>{view.title}</h5>
      </div>
      {view.content === null ? (
        <p className="hh-artifact-note" data-content="none">
          {view.contentNote}
        </p>
      ) : (
        // A scrolling region must be reachable by keyboard to be scrolled by it.
        <div className="hh-document" role="region" aria-label={`${view.title} text`} tabIndex={0} data-content="text">
          <MarkdownView text={view.content} />
        </div>
      )}
      {view.doorNote === null ? null : (
        <p className="hh-proposal-note hh-proposal-blocked" data-door-note>
          <TriangleAlert size={16} aria-hidden />
          <span>{view.doorNote}</span>
        </p>
      )}
      <p className="hh-room-line" data-tone={VALIDATION_TONE[view.validation]} data-validation-line>
        <ValidationIcon state={view.validation} />
        <span>
          {view.validationText}
          {view.findings.length > 0 ? `. ${view.findingsText}:` : ''}
        </span>
      </p>
      {view.findings.length === 0 ? null : (
        <ul className="hh-findings" aria-label={`${view.title} findings`}>
          {view.findings.map((finding, index) => (
            <li key={`${finding.code}-${finding.location}-${index}`} data-finding={finding.code}>
              <code>{finding.location}</code>: {finding.message} <span className="hh-finding-code">({finding.code})</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="hh-facts">
        <dt>Document</dt>
        <dd>
          <code>{view.documentPath}</code>
        </dd>
        {view.revisionText === null ? null : (
          <>
            <dt>Revision</dt>
            <dd>{view.revisionText}</dd>
          </>
        )}
        {view.digest === null ? null : (
          <>
            <dt>Digest</dt>
            <dd>
              <code data-digest>{view.digest}</code> (SHA-256 of these bytes)
            </dd>
          </>
        )}
        <dt>
          <Lock size={14} aria-hidden /> May write
        </dt>
        <dd>
          <ul className="hh-scope" aria-label={`Paths the ghost of this room may write for the ${view.title.toLowerCase()}`}>
            {view.writeScope.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
          Nothing else: every other write needs your approval.
        </dd>
      </dl>
    </article>
  )
}
