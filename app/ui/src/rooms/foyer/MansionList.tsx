// The Foyer's mansion list: loading, error, empty, and ready states, a native
// radio group for selection, and the one Open control. View only: every
// decision arrives through props from the Foyer reducer.
import { CircleCheck, CircleDashed, DoorOpen, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { Fragment, useId, useRef, type KeyboardEvent } from 'react'
import type { LoadState, MutationState } from '../../core/foyer-reducer'
import type { MansionDescriptor, MansionStatus } from '../../core/mansion-api'

export interface MansionListProps {
  load: LoadState
  selectedName: string | null
  mutation: MutationState
  onSelect: (name: string) => void
  /** `opener` is the control the operator used, so focus can come back to it. */
  onOpen: (name: string, opener: HTMLElement) => void
  onRetry: () => void
}

/** Each status in words. The icon beside it is decoration. */
const STATUS_COPY: Record<MansionStatus, string> = {
  ready: 'Ready to open',
  missing: 'Missing: its folder is no longer in storage, so it cannot be opened.',
  conflict: 'Conflict: its folder no longer looks like a mansion, so it cannot be opened.',
}

function StatusIcon({ status }: { status: MansionStatus }) {
  const common = { size: 16, 'aria-hidden': true } as const
  switch (status) {
    case 'ready':
      return <CircleCheck {...common} />
    case 'missing':
      return <CircleDashed {...common} />
    case 'conflict':
      return <TriangleAlert {...common} />
  }
}

/**
 * A folder path that breaks only after a slash: each segment keeps together
 * (a hyphen inside a name is not a break), and a segment wider than the card
 * still wraps rather than overflow. The text is the path, unchanged.
 */
function PathText({ path }: { path: string }) {
  const parts = path.split('/')
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          <span className="hh-path-part">{index < parts.length - 1 ? `${part}/` : part}</span>
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  )
}

interface MansionCardProps {
  mansion: MansionDescriptor
  group: string
  selected: boolean
  onSelect: (name: string) => void
}

function MansionCard({ mansion, group, selected, onSelect }: MansionCardProps) {
  return (
    <label className="hh-mansion" data-status={mansion.status} data-selected={selected}>
      <input
        type="radio"
        name={group}
        value={mansion.name}
        checked={selected}
        disabled={mansion.status !== 'ready'}
        onChange={() => onSelect(mansion.name)}
      />
      <span className="hh-mansion-name">{mansion.name}</span>
      <span className="hh-mansion-path">
        <PathText path={mansion.displayPath} />
      </span>
      <span className={`hh-mansion-status hh-status-${mansion.status}`}>
        <StatusIcon status={mansion.status} />
        {STATUS_COPY[mansion.status]}
      </span>
    </label>
  )
}

export function MansionList({ load, selectedName, mutation, onSelect, onOpen, onRetry }: MansionListProps) {
  const group = useId()
  const legendId = useId()
  const hintId = useId()
  const errorId = useId()
  const region = useRef<HTMLDivElement>(null)

  const pending = mutation.kind === 'creating' || mutation.kind === 'opening'
  const openError = mutation.kind === 'error' && mutation.operation === 'open' ? mutation : null
  const canOpen = load.kind === 'ready' && selectedName !== null && !pending
  const showOpen = load.kind === 'loading' || (load.kind === 'ready' && load.mansions.length > 0)

  // Native radios already move selection with the Arrow keys. Enter is the
  // one key added: it opens the focused mansion, like the Open button.
  const onGroupKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const target = event.target
    if (event.key !== 'Enter' || !(target instanceof HTMLInputElement) || target.type !== 'radio') return
    event.preventDefault()
    if (!target.disabled && !pending) onOpen(target.value, target)
  }

  const retry = () => {
    // The Retry button leaves the page while the list loads; keep focus here.
    region.current?.focus()
    onRetry()
  }

  return (
    <div className="hh-foyer-region" ref={region} tabIndex={-1}>
      {load.kind === 'loading' ? (
        <p className="hh-foyer-inline">
          <LoaderCircle size={16} aria-hidden className="hh-foyer-spin" />
          Loading mansions…
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <>
          <p className="hh-foyer-error">
            <TriangleAlert size={16} aria-hidden />
            <span>Could not load the mansion list. {load.message}</span>
          </p>
          <div className="hh-foyer-actions">
            <button type="button" className="hh-button" onClick={retry}>
              <RotateCw size={16} aria-hidden />
              Retry
            </button>
          </div>
        </>
      ) : null}

      {load.kind === 'ready' && load.mansions.length === 0 ? (
        <div className="hh-foyer-empty">
          <h3>No mansions yet</h3>
          <p>The house is quiet. Name your first mansion below to create it.</p>
        </div>
      ) : null}

      {load.kind === 'ready' && load.mansions.length > 0 ? (
        <fieldset
          className="hh-mansions"
          role="radiogroup"
          aria-labelledby={legendId}
          onKeyDown={onGroupKeyDown}
        >
          <legend id={legendId}>Mansions</legend>
          {load.mansions.map((mansion) => (
            <MansionCard
              key={mansion.name}
              mansion={mansion}
              group={group}
              selected={mansion.name === selectedName}
              onSelect={onSelect}
            />
          ))}
        </fieldset>
      ) : null}

      {showOpen ? (
        <div className="hh-foyer-actions">
          <button
            type="button"
            className="hh-button hh-button-primary"
            aria-disabled={!canOpen}
            aria-describedby={`${hintId} ${errorId}`}
            onClick={(event) => {
              if (canOpen && selectedName !== null) onOpen(selectedName, event.currentTarget)
            }}
          >
            <DoorOpen size={16} aria-hidden />
            {selectedName === null ? 'Open mansion' : `Open ${selectedName}`}
          </button>
          <span id={hintId} className="hh-foyer-inline">
            {mutation.kind === 'opening' ? (
              <>
                <LoaderCircle size={16} aria-hidden className="hh-foyer-spin" />
                Opening {mutation.name}…
              </>
            ) : load.kind === 'ready' && selectedName === null ? (
              'Select a ready mansion to open it.'
            ) : null}
          </span>
        </div>
      ) : null}

      {openError ? (
        <p id={errorId} className="hh-foyer-error">
          <TriangleAlert size={16} aria-hidden />
          <span>
            Could not open {openError.name}. {openError.message}
          </span>
        </p>
      ) : null}
    </div>
  )
}
