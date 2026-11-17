// The Gate (Spec 8, Requirement 9): the first screen of a first visit. One
// question, one optional name, one Knock. The name is handed up once, on the
// knock, and goes nowhere else: no request, no log, no storage.
import { DoorOpen } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { GATE_NAME_HINT, GATE_QUESTION, KNOCK_CONSEQUENCE, KNOCK_LABEL } from '../../core/first-visit'

export interface GateProps {
  /** Called once per knock with the name as typed. The page normalises it. */
  onKnock: (name: string) => void
  /** The form's id, so the painted knocker can knock for a pointer. */
  formId?: string
}

export function Gate({ onKnock, formId }: GateProps) {
  const [name, setName] = useState('')
  const fieldId = useId()
  const hintId = useId()
  const effectId = useId()
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onKnock(name)
  }
  return (
    <form className="hh-gate-form" id={formId} data-gate noValidate onSubmit={onSubmit}>
      <label className="hh-gate-question" htmlFor={fieldId}>
        {GATE_QUESTION}
      </label>
      <input
        id={fieldId}
        className="hh-gate-name"
        type="text"
        value={name}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        maxLength={120}
        aria-describedby={hintId}
        onChange={(event) => setName(event.target.value)}
      />
      <span id={hintId} className="hh-gate-hint">
        {GATE_NAME_HINT}
      </span>
      <div className="hh-gate-actions">
        <button type="submit" className="hh-gate-knock" data-guide-option="knock" aria-describedby={effectId}>
          <DoorOpen size={18} aria-hidden />
          {KNOCK_LABEL}
        </button>
        <span id={effectId} className="hh-gate-hint">
          {KNOCK_CONSEQUENCE}
        </span>
      </div>
    </form>
  )
}
