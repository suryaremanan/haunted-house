// Mansion Shell: the first view after a mansion opens. It names the mansion
// and its Project_Spec and offers one way back. Later specs fill `children`
// with the house map, rooms, and ghosts.
import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { MansionDescriptor } from '../../core/mansion-api'

export interface MansionShellProps {
  mansion: MansionDescriptor
  /** Returns to the Foyer. Also called when the operator presses Escape. */
  onReturn: () => void
  /** Room content for the opened mansion. A short placeholder shows when omitted. */
  children?: ReactNode
}

export function MansionShell({ mansion, onReturn, children }: MansionShellProps) {
  const titleId = useId()
  const title = useRef<HTMLHeadingElement>(null)
  const onReturnRef = useRef(onReturn)
  onReturnRef.current = onReturn

  // Entering the shell moves focus to its heading, so a screen reader says
  // which mansion opened and Tab continues from the top of the shell.
  useEffect(() => {
    title.current?.focus()
  }, [])

  // Escape returns from anywhere on the page. An inner panel that handles
  // Escape itself calls preventDefault, and the shell then stays open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onReturnRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <section className="hh-shell" aria-labelledby={titleId}>
      <p className="hh-shell-eyebrow">Mansion</p>
      <h2 id={titleId} ref={title} tabIndex={-1}>
        {mansion.name}
      </h2>
      <div className="hh-foyer-actions">
        <button type="button" className="hh-button" onClick={onReturn}>
          <ArrowLeft size={16} aria-hidden />
          Return to Foyer
        </button>
        <span className="hh-foyer-hint">Escape also returns to the Foyer.</span>
      </div>
      <dl className="hh-shell-facts">
        <dt>Project spec</dt>
        <dd>{mansion.projectSpec}</dd>
        <dt>Folder</dt>
        <dd>{mansion.displayPath}</dd>
      </dl>
      {children ?? (
        <p className="hh-shell-rooms">The rooms are still dark. Ghosts move in with a later chapter.</p>
      )}
    </section>
  )
}
