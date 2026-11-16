// Problems of the log and of the last command, as a bounded list of fixed
// sentences with the parser's line number. Never a payload, a path or an
// error body. Not a live region: what must be said aloud goes through the
// page's one announcer, from use-attic-panel.ts.
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { NO_DIAGNOSTICS_TEXT, type DiagnosticsView } from '../../core/attic-view'

export interface ReplayDiagnosticsProps {
  diagnostics: DiagnosticsView
}

export function ReplayDiagnostics({ diagnostics }: ReplayDiagnosticsProps) {
  if (diagnostics.rows.length === 0) {
    return (
      <p className="hh-attic-line hh-attic-muted" data-attic="diagnostics-empty">
        <CircleCheck size={16} aria-hidden />
        <span>{NO_DIAGNOSTICS_TEXT}</span>
      </p>
    )
  }
  return (
    <div className="hh-attic-section" data-attic="diagnostics">
      <ul className="hh-attic-list hh-attic-diagnostics">
        {diagnostics.rows.map((row) => (
          <li key={row.key}>
            <TriangleAlert size={16} aria-hidden />
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      {diagnostics.moreText === null ? null : <p className="hh-attic-muted">{diagnostics.moreText}</p>}
    </div>
  )
}
