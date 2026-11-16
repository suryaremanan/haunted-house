// The locked Séance Room (Spec 6 task 6.5; Requirements 1.4, 11.5): plain
// words saying that review is a later chapter. It can be opened and read, and
// that is all: it has no control besides the panel's own Close.
import { Lock } from 'lucide-react'
import { LOCKED_SEANCE_TEXT } from '../../core/house-projection'

export function LockedSeancePanel() {
  return (
    <p className="hh-ui-note" data-kind="locked" data-seance="locked">
      <Lock size={16} aria-hidden />
      <span>{LOCKED_SEANCE_TEXT}</span>
    </p>
  )
}
