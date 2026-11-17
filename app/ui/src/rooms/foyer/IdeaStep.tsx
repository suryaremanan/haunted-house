// The Idea Step (Spec 8, Requirement 10): three ready-made ideas and one
// field, under the Warden's question "What do you want to build?". One
// decision: what to build. The project folder's name is worked out from the
// idea and shown before anything is made. "Build this" calls the Foyer's own
// create and then its own open; this component has no request of its own.
import { Hammer, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useRef, type FormEvent } from 'react'
import { BUILD_LABEL, EXAMPLE_CONSEQUENCE, EXAMPLE_IDEAS, IDEA_FIELD_LABEL, IDEA_HINT, buildConsequence } from '../../core/first-visit'
import type { MutationState } from '../../core/foyer-reducer'
import { useIdeaStep, type MadeFromIdea } from './use-idea-step'

export const IDEA_EXAMPLES_NAME = 'Examples to start with'
export const openConsequence = (name: string): string => `The project folder ${name} is already made. This takes you inside.`

export interface IdeaStepProps {
  /** The listed mansions, so the new one gets a name none of them has. */
  mansions: readonly { readonly name: string }[]
  /** False until the mansion list has loaded. */
  ready: boolean
  /** The Foyer's create or open on its way, or its refusal, when the Idea Step asked for it. */
  mutation: MutationState
  /** A mansion already made from this idea whose open did not succeed. */
  made: MadeFromIdea | null
  /** Makes the mansion with this name and brief, then opens it. Resolves false when making it was refused. */
  onBuild: (name: string, brief: string, from: HTMLElement) => Promise<boolean>
}

export function IdeaStep({ mansions, ready, mutation, made, onBuild }: IdeaStepProps) {
  const fieldId = useId()
  const hintId = useId()
  const counterId = useId()
  const errorId = useId()
  const nameId = useId()
  const effectId = useId()
  const exampleEffectId = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const idea = useIdeaStep(mansions, made)

  const pending = mutation.kind === 'creating' || mutation.kind === 'opening'
  const blocked = !ready || pending
  const requestError = mutation.kind === 'error' ? `Could not ${mutation.operation} ${mutation.name}. ${mutation.message}` : null
  const error = idea.error ?? requestError

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (blocked || button.current === null) return
    if (!idea.check()) {
      field.current?.focus()
      return
    }
    // On a refusal the idea stays in the field for another try.
    if (!(await onBuild(idea.name, idea.text, button.current))) field.current?.focus()
  }

  return (
    <form className="hh-idea" data-idea-step noValidate onSubmit={onSubmit}>
      <ul className="hh-idea-examples" aria-label={IDEA_EXAMPLES_NAME}>
        {EXAMPLE_IDEAS.map((example) => (
          <li key={example.name}>
            <button
              type="button"
              className="hh-guide-foot-button hh-idea-example"
              data-example={example.name}
              aria-describedby={exampleEffectId}
              onClick={() => {
                idea.pick(example)
                field.current?.focus()
              }}
            >
              {example.title}
            </button>
          </li>
        ))}
      </ul>
      <span className="hh-guide-hidden" id={exampleEffectId}>
        {EXAMPLE_CONSEQUENCE}
      </span>
      <div className="hh-idea-field">
        <label htmlFor={fieldId}>{IDEA_FIELD_LABEL}</label>
        <textarea
          id={fieldId}
          ref={field}
          rows={3}
          value={idea.text}
          readOnly={pending}
          aria-invalid={error !== null}
          aria-describedby={`${hintId} ${counterId} ${errorId} ${nameId}`}
          onChange={(event) => idea.change(event.target.value)}
        />
        <span id={hintId} className="hh-idea-hint">
          {IDEA_HINT}
        </span>
        <span id={counterId} className="hh-idea-hint">
          {idea.counter}
        </span>
      </div>
      {error === null ? null : (
        <p id={errorId} className="hh-idea-error" data-idea-error>
          <TriangleAlert size={16} aria-hidden />
          <span>{error}</span>
        </p>
      )}
      <p className="hh-idea-name" id={nameId} data-idea-name>
        Project folder: <code>{idea.name}</code>
      </p>
      <div className="hh-idea-actions">
        <button type="submit" ref={button} className="hh-gate-knock" data-guide-option="build-this" aria-disabled={blocked} aria-describedby={effectId}>
          <Hammer size={18} aria-hidden />
          {BUILD_LABEL}
        </button>
        <span id={effectId} className="hh-idea-hint">
          {pending ? (
            <>
              <LoaderCircle size={14} aria-hidden className="hh-foyer-spin" />{' '}
              {mutation.kind === 'creating' ? `Making ${mutation.name}…` : `Opening ${mutation.name}…`}
            </>
          ) : idea.alreadyMade ? (
            openConsequence(idea.name)
          ) : (
            buildConsequence(idea.name)
          )}
        </span>
      </div>
    </form>
  )
}
