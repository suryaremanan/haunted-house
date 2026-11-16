// The Foyer: list, create, select, and open mansions, then show the Mansion
// Shell. That is the whole action set; there is no delete, rename, archive,
// import, discovery, or custom-root control here.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useHostTheme } from '../../adapters/sdk'
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
  /**
   * The whole surface of the opened mansion, in place of the Foyer's own
   * Mansion Shell. It receives the Foyer's return action; the Foyer still
   * restores focus to the control that opened the mansion.
   */
  renderShell?: (mansion: MansionDescriptor, onReturn: () => void) => ReactNode
  /** Told, before the page paints, which mansion is open (null for none). */
  onMansionChange?: (mansion: MansionDescriptor | null) => void
  /**
   * A mansion to select once the list loads, when it is listed and ready and
   * nothing is selected yet. Selecting is not opening: Open is still a press.
   */
  preselect?: string
  /** One line inviting the visitor in, shown above the mansion list. */
  invitation?: string
}

export function Foyer({ onAnnounce, stillHouse = false, renderMansion, renderShell, onMansionChange, preselect, invitation }: FoyerProps) {
  const theme = useHostTheme()
  const titleId = useId()
  const [announcement, setAnnouncement] = useState('')
  const { state, retryLoad, select, create, open, returnToFoyer } = useFoyer({
    onAnnounce: onAnnounce ?? setAnnouncement,
  })

  // The preselection happens once, on the first list that holds it ready.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || preselect === undefined || state.load.kind !== 'ready') return
    preselected.current = true
    const listed = state.load.mansions.some((mansion) => mansion.name === preselect && mansion.status === 'ready')
    if (listed && state.selectedName === null) select(preselect)
  }, [preselect, state.load, state.selectedName, select])

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

  const openMansion = state.view.kind === 'mansion' ? state.view.mansion : null
  const changeRef = useRef(onMansionChange)
  changeRef.current = onMansionChange
  useLayoutEffect(() => {
    changeRef.current?.(openMansion)
  }, [openMansion])
  // Unmounting the Foyer leaves no mansion open.
  useLayoutEffect(() => () => changeRef.current?.(null), [])

  return (
    <div
      className="hh-foyer"
      data-view={inMansion ? 'mansion' : 'hall'}
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
        {invitation === undefined ? null : <p className="hh-foyer-invite">{invitation}</p>}
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
      {state.view.kind !== 'mansion' ? null : renderShell !== undefined ? (
        renderShell(state.view.mansion, returnToFoyer)
      ) : (
        <MansionShell mansion={state.view.mansion} onReturn={returnToFoyer}>
          {renderMansion?.(state.view.mansion)}
        </MansionShell>
      )}
      {onAnnounce ? null : (
        <p className="hh-foyer-announcer" aria-live="polite">
          {announcement}
        </p>
      )}
    </div>
  )
}
