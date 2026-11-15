// The Foyer: list, create, select, and open mansions, then show the Mansion
// Shell. That is the whole action set; there is no delete, rename, archive,
// import, discovery, or custom-root control here.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTheme } from '../../adapters/sdk'
import type { MansionDescriptor } from '../../core/mansion-api'
import { CreateMansionForm } from './CreateMansionForm'
import { FOYER_STYLES } from './foyer-styles'
import { MansionList } from './MansionList'
import { MansionShell } from './MansionShell'
import { useFoyer } from './use-foyer'

export interface FoyerProps {
  /**
   * Receives each completed create or open result. A host that owns the page's
   * one polite live region passes this; without it the Foyer renders its own.
   */
  onAnnounce?: (message: string) => void
  /** Still House: turns off the Foyer's non-essential motion. Reduced motion in the browser does the same. */
  stillHouse?: boolean
  /** Room content for the opened mansion, placed inside the Mansion Shell. */
  renderMansion?: (mansion: MansionDescriptor) => ReactNode
}

export function Foyer({ onAnnounce, stillHouse = false, renderMansion }: FoyerProps) {
  const theme = useTheme()
  const titleId = useId()
  const [announcement, setAnnouncement] = useState('')
  const { state, retryLoad, select, create, open, returnToFoyer } = useFoyer({
    onAnnounce: onAnnounce ?? setAnnouncement,
  })

  const inMansion = state.view.kind === 'mansion'
  const opener = useRef<HTMLElement | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const wasInMansion = useRef(false)

  const openFrom = useCallback(
    (name: string, control: HTMLElement) => {
      opener.current = control
      open(name)
    },
    [open],
  )

  // Requirement 1.7: on return, focus goes back to the control that opened
  // the shell. The hall stays mounted (hidden) meanwhile, so it is the same element.
  useEffect(() => {
    if (wasInMansion.current && !inMansion) {
      const target = opener.current?.isConnected ? opener.current : title.current
      target?.focus()
    }
    wasInMansion.current = inMansion
  }, [inMansion])

  return (
    <div
      className="hh-foyer"
      data-theme-mode={theme.mode}
      data-motion={stillHouse ? 'none' : 'low-frequency'}
      style={{ colorScheme: theme.mode }}
    >
      <style>{FOYER_STYLES}</style>
      <section className="hh-foyer-hall" aria-labelledby={titleId} hidden={inMansion}>
        <h2 id={titleId} ref={title} tabIndex={-1}>
          Foyer
        </h2>
        <p className="hh-foyer-lede">Each mansion is one software project. Choose one to enter, or create a new one.</p>
        <MansionList
          load={state.load}
          selectedName={state.selectedName}
          mutation={state.mutation}
          onSelect={select}
          onOpen={openFrom}
          onRetry={retryLoad}
        />
        <CreateMansionForm ready={state.load.kind === 'ready'} mutation={state.mutation} onCreate={create} />
      </section>
      {state.view.kind === 'mansion' ? (
        <MansionShell mansion={state.view.mansion} onReturn={returnToFoyer}>
          {renderMansion?.(state.view.mansion)}
        </MansionShell>
      ) : null}
      {onAnnounce ? null : (
        <p className="hh-foyer-announcer" aria-live="polite">
          {announcement}
        </p>
      )}
    </div>
  )
}
