// What was made (Spec 8, Requirement 13): shown in the Foyer of a Mansion
// once every Door is open. Each document under its everyday name, Kiro's name
// and its real file path; the finished work; the folder; and how to open that
// folder in Kiro. It reads a built view and sends nothing.
import { useId } from 'react'
import type { BuiltView } from '../../core/house-built'

export const BUILT_TITLE = 'What was made'
export const BUILT_LEDE = 'Every door is open. This is what now exists, under the names Kiro uses for it.'
export const BUILT_WORK_TITLE = 'Finished work'
export const BUILT_OPEN_TITLE = 'Open this project in Kiro'

export interface BuiltPageProps {
  view: BuiltView
}

function sentenceStart(text: string): string {
  return text === '' ? text : text[0].toUpperCase() + text.slice(1)
}

export function BuiltPage({ view }: BuiltPageProps) {
  const titleId = useId()
  if (!view.built) return null
  return (
    // Focusable, so "See what was made" can land here and not on a control.
    <section className="hh-built" aria-labelledby={titleId} data-section="built" data-built tabIndex={-1}>
      <h5 id={titleId}>{BUILT_TITLE}</h5>
      <p className="hh-built-lede">{BUILT_LEDE}</p>
      {view.rows.length === 0 ? null : (
        <table className="hh-built-table">
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Kiro calls it</th>
              <th scope="col">File</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.term} data-built-row={row.term}>
                <th scope="row">{sentenceStart(row.plain)}</th>
                <td>{row.kiro}</td>
                <td>
                  <code>{row.path}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view.tasks.length === 0 ? null : (
        <>
          <p className="hh-built-group">{BUILT_WORK_TITLE}</p>
          <ul className="hh-built-tasks">
            {view.tasks.map((task) => (
              <li key={task.taskId} data-built-task={task.taskId}>
                <span>{task.title}</span>
                {task.files.map((file) => (
                  <code key={file}>{file}</code>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hh-built-group">{BUILT_OPEN_TITLE}</p>
      <dl className="hh-facts">
        <dt>Folder</dt>
        <dd>
          <code data-built-folder>{view.folder}</code>
        </dd>
      </dl>
      {view.folderNote === null ? (
        <ol className="hh-built-steps">
          {view.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="hh-built-lede" data-built-note>
          {view.folderNote}
        </p>
      )}
    </section>
  )
}
