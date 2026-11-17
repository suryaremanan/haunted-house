// The optional revision request of one room document (Spec 5 Requirements
// 5.7, 6.7, 11.4). It is a secondary action below the document and its Door:
// closed by default, one bounded note to the same ghost session, and not a
// chat. Asking for a revision never approves or rejects anything; the Door
// stays sealed until a new revision is approved.
import { Lock, Send, X } from 'lucide-react'
import { useId } from 'react'
import type { FeedbackView, RoomCommand } from '../../core/room-view'
import { useRevisionRequest } from './use-revision-request'

export interface RevisionRequestProps {
  view: FeedbackView
  onSend: (command: RoomCommand) => void
}

export function RevisionRequest({ view, onSend }: RevisionRequestProps) {
  const form = useRevisionRequest(view, onSend)
  const panelId = useId()
  const fieldId = useId()
  const hintId = useId()
  const errorId = useId()
  const blockedId = useId()
  return (
    <div className="hh-revision" data-revision={view.phase}>
      <div className="hh-decide" aria-busy={view.busy}>
        <button
          type="button"
          className="hh-button hh-button-quiet"
          data-guide-control={`revise:${view.phase}`}
          ref={form.toggleRef}
          aria-expanded={form.open}
          aria-controls={form.open ? panelId : undefined}
          onClick={form.open ? form.hide : form.show}
        >
          {view.busy ? 'Sending the revision request…' : view.label}
        </button>
      </div>
      {form.open ? (
        <form
          id={panelId}
          className="hh-revision"
          aria-label={view.label}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            form.submit()
          }}
          onKeyDown={(event) => {
            // Escape closes this form only; the room stays open.
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            form.hide()
          }}
        >
          <label htmlFor={fieldId}>What should change?</label>
          <textarea
            id={fieldId}
            ref={form.fieldRef}
            data-guide-control={`revise-text:${view.phase}`}
            value={form.text}
            maxLength={view.maxCharacters}
            rows={4}
            aria-describedby={form.error === null ? hintId : `${hintId} ${errorId}`}
            aria-invalid={form.error !== null}
            onChange={(event) => form.change(event.target.value)}
          />
          <p className="hh-proposal-sub" id={hintId}>
            Sent once, to the same ghost session. The door stays sealed until you approve a new revision. Up to{' '}
            {view.maxCharacters.toLocaleString('en-US')} characters.
          </p>
          {form.error === null ? null : (
            <p className="hh-proposal-note hh-proposal-blocked" id={errorId}>
              <Lock size={16} aria-hidden />
              <span>{form.error}</span>
            </p>
          )}
          {view.blockedText === null ? null : (
            <p className="hh-proposal-note hh-proposal-blocked" id={blockedId}>
              <Lock size={16} aria-hidden />
              <span>{view.blockedText}</span>
            </p>
          )}
          <div className="hh-decide">
            <button
              type="submit"
              className="hh-button hh-button-primary"
              data-guide-control={`revise-send:${view.phase}`}
              aria-disabled={!view.enabled}
              aria-describedby={view.blockedText === null ? undefined : blockedId}
            >
              <Send size={16} aria-hidden />
              Send revision request
            </button>
            <button type="button" className="hh-button" onClick={form.hide}>
              <X size={16} aria-hidden />
              Close without sending
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
