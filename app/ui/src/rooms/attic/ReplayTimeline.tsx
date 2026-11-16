// The Timeline: one ordered entry per selected record, in Canonical_Order,
// with safe bounded text only. The entry the Cursor last presented carries
// `aria-current="step"`, a marker icon, the words "Now showing" and a heavier
// border. The list scrolls inside its own focusable region, where the arrow
// keys scroll natively; entries are not controls, so Tab passes through once.
import { MapPin } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { CURRENT_ENTRY_TEXT, EMPTY_LOG_TEXT, type TimelineRow } from '../../core/attic-view'

export interface ReplayTimelineProps {
  rows: readonly TimelineRow[]
  /** Accessible name of the scrollable region. */
  label: string
}

export function ReplayTimeline({ rows, label }: ReplayTimelineProps) {
  const region = useRef<HTMLDivElement>(null)
  const current = rows.find((row) => row.current)?.key ?? null

  // Keep the current entry in view by moving the list's own scroll offset at
  // once: no smooth scrolling, and the page itself never scrolls.
  useEffect(() => {
    const box = region.current
    if (box === null) return
    if (current === null) {
      box.scrollTop = 0
      return
    }
    const entry = box.querySelector<HTMLElement>('[aria-current="step"]')
    if (entry === null) return
    const top = entry.offsetTop - box.offsetTop
    if (top < box.scrollTop) box.scrollTop = top
    else if (top + entry.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + entry.offsetHeight - box.clientHeight
  }, [current])

  if (rows.length === 0) {
    return (
      <p className="hh-attic-muted" data-attic="timeline-empty">
        {EMPTY_LOG_TEXT}
      </p>
    )
  }
  return (
    <div className="hh-attic-timeline" role="group" aria-label={label} tabIndex={0} ref={region} data-attic="timeline">
      <ol className="hh-attic-entries">
        {rows.map((row) => (
          <li
            key={row.key}
            className="hh-attic-entry"
            aria-current={row.current ? 'step' : undefined}
            data-played={row.played}
            data-position={row.position}
          >
            <span className="hh-attic-entry-mark">{row.current ? <MapPin size={16} aria-hidden /> : null}</span>
            {/* The trailing spaces keep the parts apart when the entry is read as one line. */}
            <span className="hh-attic-entry-number">{row.position}. </span>
            <span>
              {row.current ? <span className="hh-attic-entry-now">{CURRENT_ENTRY_TEXT}. </span> : null}
              {row.actor}: {row.summary}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
