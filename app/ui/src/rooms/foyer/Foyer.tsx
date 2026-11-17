// The Foyer: list, create, select, and open mansions, then show the Mansion
// Shell. That is the whole action set; there is no delete, rename, archive,
// import, discovery, or custom-root control here.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useHostTheme } from '../../adapters/sdk'
import type { LoadState, MutationState } from '../../core/foyer-reducer'
import type { MansionDescriptor } from '../../core/mansion-api'
import { CreateMansionForm } from './CreateMansionForm'
import { FOYER_STYLES } from './foyer-styles'
import { MansionList } from './MansionList'
import { MansionShell } from './MansionShell'
import { useFoyer } from './use-foyer'
import type { MadeFromIdea } from './use-idea-step'

/**
 * What the hall hands to the first-visit guide (Spec 8): its list, and its own
 * create and open actions. The guide has no action of its own.
 */
export interface FoyerHall {
  /** The listed mansions. Empty until the list has loaded. */
  readonly mansions: readonly MansionDescriptor[]
  readonly selectedName: string | null
  /** True once the list has loaded. */
  readonly ready: boolean
  /** A create or open the guide asked for, on its way or refused. Anything the hall's own controls asked for is not here. */
  readonly mutation: MutationState
  /** A mansion the guide's Idea Step made whose open did not succeed, so the next try only opens it. */
  readonly made: MadeFromIdea | null
  /** The Foyer's open action. `from` gets focus back when the visitor returns. */
  readonly open: (name: string, from: HTMLElement) => void
  /** The Foyer's create action and, when that succeeds, its open action. Resolves false when creating was refused. */
  readonly build: (name: string, brief: string, from: HTMLElement) => Promise<boolean>
}

/** The first visit, as the page tells it to the Foyer. */
export interface FoyerVisit {
  /** The Gate is on show: the hall is hidden but stays mounted, so the list keeps loading. */
  readonly hidden: boolean
  /** The Warden's balloon, shown above the hall. It may return null. */
  readonly renderGuide: (hall: FoyerHall) => ReactNode
}

const IDLE: MutationState = { kind: 'idle' }

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
  /** The first-visit guide. Without it the hall is as it always was. */
  visit?: FoyerVisit
  /** Told, before the page paints, each state of the mansion list. */
  onLoad?: (load: LoadState) => void
}

export function Foyer({ onAnnounce, stillHouse = false, renderMansion, renderShell, onMansionChange, preselect, invitation, visit, onLoad }: FoyerProps) {
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
  // A choice of the guide is put away with the hall and drawn again on return, so it is found again by its key.
  const openerKey = useRef<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const wasInMansion = useRef(false)

  // Who asked for the create or open on its way: the guide's Idea Step, or the hall's own list and form.
  // Each shows only what it asked for, so a refusal is said once, beside the control that was pressed.
  const [askedBy, setAskedBy] = useState<'guide' | 'hall'>('hall')
  const [made, setMade] = useState<MadeFromIdea | null>(null)

  const openFrom = useCallback(
    (name: string, control: HTMLElement) => {
      opener.current = control
      openerKey.current = control.getAttribute('data-guide-option')
      open(name)
    },
    [open],
  )
  const openFromHall = useCallback(
    (name: string, control: HTMLElement) => {
      setAskedBy('hall')
      openFrom(name, control)
    },
    [openFrom],
  )
  const createFromHall = useCallback(
    (name: string, brief?: string) => {
      setAskedBy('hall')
      return create(name, brief)
    },
    [create],
  )
  const openFromGuide = useCallback(
    (name: string, control: HTMLElement) => {
      setAskedBy('guide')
      openFrom(name, control)
    },
    [openFrom],
  )
  // The Idea Step's one action: the existing create, then the existing open. A mansion
  // already made from this very idea is not made again: only its open is tried.
  const build = useCallback(
    async (name: string, brief: string, control: HTMLElement): Promise<boolean> => {
      setAskedBy('guide')
      const already = made !== null && made.name === name && made.brief === brief
      if (!already) {
        if (!(await create(name, brief))) return false
        setMade({ name, brief })
      }
      openFrom(name, control)
      return true
    },
    [create, made, openFrom],
  )

  // Requirement 1.7: on return, focus goes back to the control that opened
  // the shell. The hall stays mounted (hidden) meanwhile, so it is the same element.
  useEffect(() => {
    if (wasInMansion.current && !inMansion) {
      const key = openerKey.current
      const again = key === null ? null : (root.current?.querySelector<HTMLElement>(`[data-guide-option="${key.replace(/["\\]/g, '\\$&')}"]`) ?? null)
      const target = opener.current?.isConnected ? opener.current : (again ?? title.current)
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

  const loadRef = useRef(onLoad)
  loadRef.current = onLoad
  useLayoutEffect(() => {
    loadRef.current?.(state.load)
  }, [state.load])

  const hallHidden = inMansion || visit?.hidden === true
  const hall: FoyerHall = {
    mansions: state.load.kind === 'ready' ? state.load.mansions : [],
    selectedName: state.selectedName,
    ready: state.load.kind === 'ready',
    mutation: state.mutation.kind === 'error' && askedBy !== 'guide' ? IDLE : state.mutation,
    made,
    open: openFromGuide,
    build,
  }
  // The hall's own list and form do not repeat a refusal the guide's step already shows.
  const hallMutation = state.mutation.kind === 'error' && askedBy === 'guide' ? IDLE : state.mutation
  const guide = visit === undefined || hallHidden ? null : visit.renderGuide(hall)

  return (
    <div
      className="hh-foyer"
      ref={root}
      data-view={inMansion ? 'mansion' : 'hall'}
      data-theme-mode={theme.mode}
      data-motion={stillHouse ? 'none' : 'low-frequency'}
      style={{ colorScheme: theme.mode }}
    >
      <style>{FOYER_STYLES}</style>
      {guide === null || guide === undefined ? null : (
        <div className="hh-foyer-guide" data-foyer-guide>
          {guide}
        </div>
      )}
      <section className="hh-foyer-hall" aria-labelledby={titleId} hidden={hallHidden}>
        <h2 id={titleId} ref={title} tabIndex={-1}>
          Foyer
        </h2>
        <p className="hh-foyer-lede">Each mansion is one software project. Choose one to enter, or create a new one.</p>
        {invitation === undefined ? null : <p className="hh-foyer-invite">{invitation}</p>}
        <MansionList
          load={state.load}
          selectedName={state.selectedName}
          mutation={hallMutation}
          onSelect={select}
          onOpen={openFromHall}
          onRetry={retryLoad}
        />
        <CreateMansionForm ready={state.load.kind === 'ready'} mutation={hallMutation} onCreate={createFromHall} />
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
