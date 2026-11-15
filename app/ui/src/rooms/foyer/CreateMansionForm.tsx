// Create-mansion form: one labelled name field and one Create button. The
// name check here only gives early feedback; the backend validates every name
// again and is the authority. The browser sends a name, never a path.
import { LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import type { MutationState } from '../../core/foyer-reducer'
import { MAX_MANSION_NAME_LENGTH, isMansionName } from '../../core/mansion-api'

export interface CreateMansionFormProps {
  /** False until the mansion list has loaded; creating is refused before that. */
  ready: boolean
  mutation: MutationState
  /** Resolves true when the mansion was created or adopted. */
  onCreate: (name: string) => Promise<boolean>
}

export const MANSION_NAME_HINT = `Lowercase letters, numbers, and single hyphens, up to ${MAX_MANSION_NAME_LENGTH} characters. For example: weather-station.`
export const MANSION_NAME_REQUIRED = 'Enter a name for the mansion.'
export const MANSION_NAME_INVALID = `Use 1–${MAX_MANSION_NAME_LENGTH} lowercase letters, numbers, and single hyphens.`

export function CreateMansionForm({ ready, mutation, onCreate }: CreateMansionFormProps) {
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const statusId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const pending = mutation.kind === 'creating' || mutation.kind === 'opening'
  const creating = mutation.kind === 'creating' ? mutation.name : null
  const requestError =
    mutation.kind === 'error' && mutation.operation === 'create'
      ? `Could not create ${mutation.name}. ${mutation.message}`
      : null
  const error = nameError ?? requestError
  const blocked = !ready || pending

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (blocked) return
    if (!isMansionName(name)) {
      setNameError(name === '' ? MANSION_NAME_REQUIRED : MANSION_NAME_INVALID)
      input.current?.focus()
      return
    }
    setNameError(null)
    if (await onCreate(name)) setName('')
    // On failure the name stays for correction and the field regains focus,
    // where its description now includes the error.
    else input.current?.focus()
  }

  return (
    <form className="hh-create" noValidate onSubmit={onSubmit}>
      <div className="hh-field">
        <label htmlFor={inputId}>New mansion name</label>
        <input
          id={inputId}
          ref={input}
          type="text"
          name="mansion-name"
          value={name}
          maxLength={MAX_MANSION_NAME_LENGTH}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={creating !== null}
          aria-invalid={error !== null}
          aria-describedby={`${hintId} ${errorId}`}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
          }}
        />
        <span id={hintId} className="hh-foyer-hint">
          {MANSION_NAME_HINT}
        </span>
      </div>
      {error !== null ? (
        <p id={errorId} className="hh-foyer-error">
          <TriangleAlert size={16} aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      <div className="hh-foyer-actions">
        <button type="submit" className="hh-button" aria-disabled={blocked} aria-describedby={statusId}>
          <Plus size={16} aria-hidden />
          Create mansion
        </button>
        <span id={statusId} className="hh-foyer-inline">
          {creating !== null ? (
            <>
              <LoaderCircle size={16} aria-hidden className="hh-foyer-spin" />
              Creating {creating}…
            </>
          ) : null}
        </span>
      </div>
    </form>
  )
}
