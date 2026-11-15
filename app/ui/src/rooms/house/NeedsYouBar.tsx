// "Needs you": how many things wait on the Operator, and a jump to the first.
// The count is the same number the sidebar badge shows.
import { Bell } from 'lucide-react'
import type { NeedsYouItem } from '../../core/house-view'

export interface NeedsYouBarProps {
  items: readonly NeedsYouItem[]
  text: string
  onJump: () => void
}

export function NeedsYouBar({ items, text, onJump }: NeedsYouBarProps) {
  const jumpable = items.some((item) => item.room !== null)
  return (
    <>
      <button
        type="button"
        className="hh-needs"
        data-count={items.length}
        aria-disabled={!jumpable}
        aria-label={jumpable ? `Needs you: ${text}. Go to the first.` : `Needs you: ${text}.`}
        onClick={() => {
          if (jumpable) onJump()
        }}
      >
        <Bell size={16} aria-hidden />
        {text}
      </button>
      {items.length === 0 ? null : (
        <ul className="hh-needs-list" aria-label="Waiting on you">
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      )}
    </>
  )
}
