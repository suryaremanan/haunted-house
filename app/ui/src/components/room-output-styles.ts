// Styles of the artifact-first room output: documents, findings, runs, the
// Workshop task board and the secondary session link. Plain CSS on Crew's
// theme variables with fallbacks, as a string for the single-module bundle.
// It follows the house sheet's rules: text on its paired surface, state as
// icon plus words (borders change style, not only color), a ring on
// everything focusable, and no animation of its own.
export const ROOM_OUTPUT_STYLES = `
.hh-output { display: grid; gap: 10px; }
.hh-artifact { border: 1px solid var(--border, currentColor); border-top: 3px solid var(--border-strong, currentColor);
  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }
.hh-artifact[data-validation='invalid'] { border-top-style: double; border-top-width: 5px; }
.hh-artifact[data-validation='unwritten'] { border-style: dashed; }
.hh-artifact-head { display: flex; align-items: flex-start; gap: 6px; }
.hh-artifact-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }
.hh-artifact-note { margin: 0; font-size: 0.875rem; color: var(--muted, inherit); }
.hh-document { max-height: 24rem; overflow: auto; border: 1px solid var(--border, currentColor); border-radius: 4px;
  padding: 8px 12px; background: var(--input, transparent); font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-document > :first-child { margin-top: 0; }
.hh-document > :last-child { margin-bottom: 0; }
.hh-md-heading { font-weight: 600; margin: 12px 0 4px; }
.hh-md-heading[data-level='1'] { font-size: 1.0625rem; }
.hh-md-heading[data-level='2'] { font-size: 1rem; }
.hh-document p { margin: 6px 0; }
.hh-md-quote { border-left: 3px solid var(--border-strong, currentColor); padding-left: 8px; }
.hh-md-list { list-style: none; margin: 6px 0; padding: 0; display: grid; gap: 2px; }
.hh-md-item { display: flex; align-items: flex-start; gap: 6px; }
.hh-md-item svg { flex: none; margin-top: 3px; }
.hh-md-marker { flex: none; min-width: 0.75rem; color: var(--muted, inherit); }
.hh-document pre { margin: 6px 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--border, currentColor);
  border-radius: 4px; }
.hh-document code, .hh-document pre, .hh-task code, .hh-run code, .hh-findings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem; }
.hh-document hr { border: 0; border-top: 1px solid var(--border, currentColor); margin: 8px 0; }
.hh-findings { margin: 0; padding: 0 0 0 1.25rem; font-size: 0.875rem; display: grid; gap: 2px; }
.hh-finding-code { color: var(--muted, inherit); }
.hh-scope { list-style: none; margin: 0; padding: 0; }

.hh-run { display: grid; gap: 4px; }
.hh-run-summary { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.hh-runs > li { display: grid; gap: 6px; }
.hh-session-link { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 0.875rem; }
.hh-button-quiet { border-style: dotted; padding: 3px 10px; font-size: 0.875rem; }
.hh-session-link-note { color: var(--muted, inherit); }

.hh-board { border: 1px solid var(--border, currentColor); border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }
.hh-wave { display: grid; gap: 6px; }
.hh-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.hh-task { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);
  border-radius: 6px; padding: 8px 10px; display: grid; gap: 4px; }
.hh-task[data-status='active'] { border-left-style: double; border-left-width: 6px; }
.hh-task[data-status='not_selected'], .hh-task[data-status='skipped'] { border-left-style: dotted; }
.hh-task[data-status='failed'], .hh-task[data-status='blocked'], .hh-task[data-status='cancelled'] { border-left-style: dashed; }
.hh-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 0.875rem; }
.hh-task-head input { margin: 0; width: 1rem; height: 1rem; align-self: center; accent-color: var(--accent, auto); }
.hh-task-head input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-task-id { font-weight: 600; }
.hh-tag { border: 1px solid var(--border-strong, currentColor); border-radius: 999px; padding: 0 8px; font-size: 0.75rem; }
.hh-task-detail { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }

.hh-revision { display: grid; gap: 6px; }
.hh-revision label { font-weight: 600; font-size: 0.875rem; }
.hh-revision textarea { font: inherit; color: inherit; background: var(--input, transparent);
  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; min-height: 5rem;
  resize: vertical; width: 100%; box-sizing: border-box; }
.hh-revision textarea:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-revision textarea[aria-invalid='true'] { border-width: 2px; }

.hh-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
`
