// The Attic's sheet (replay-and-submission task 4.1). Plain CSS as a string,
// like the rest of the house: the live bundle is one ES module. Every class
// starts with `hh-attic-`. Colors are the house's `--hh-*` tokens, with
// `currentColor` behind them so the panel also reads without the shell.
//
// - State is never color alone: the current Timeline entry has a marker icon,
//   the words "Now showing", a heavier double border and bold text; a control
//   that is off has a dashed border and its reason in words.
// - Every control shows a focus ring, and so does the scrollable Timeline.
// - The only motion is a slow fade of the current-entry highlight. It runs
//   only under `data-motion='low-frequency'` and without a reduced-motion
//   preference. Cursor and state changes never wait for it.
export const ATTIC_STYLES = `
.hh-attic { display: grid; gap: 14px; min-width: 0; }
.hh-attic h4 { margin: 0 0 6px; font-size: 0.9375rem; }
.hh-attic p { margin: 0; overflow-wrap: anywhere; }
.hh-attic-section { min-width: 0; display: grid; gap: 8px; }
.hh-attic-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;
  border: 1px solid var(--hh-border, currentColor); border-left-width: 6px; border-left-style: double; border-radius: 6px;
  background: var(--hh-surface, transparent); }
.hh-attic-note svg, .hh-attic-line svg { flex: none; margin-top: 2px; }
.hh-attic-line { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.hh-attic-status { font-weight: 600; }
.hh-attic-muted { color: var(--hh-text-muted, inherit); }
.hh-attic-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }
.hh-attic-button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; min-height: 2.25rem;
  font: inherit; text-align: left; color: var(--hh-text, inherit); background: var(--hh-surface-raised, transparent);
  border: 1px solid var(--hh-border, currentColor); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.hh-attic-button[data-variant='primary'] { color: var(--hh-primary-text, inherit); background: var(--hh-primary, transparent);
  border-width: 2px; font-weight: 600; }
.hh-attic-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted, inherit);
  background: var(--hh-surface, transparent); font-weight: 400; }
.hh-attic-button:focus-visible, .hh-attic-range:focus-visible, .hh-attic-speed input:focus-visible,
.hh-attic-timeline:focus-visible { outline: 2px solid var(--hh-focus, currentColor); outline-offset: 2px; }
.hh-attic-reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 0.875rem;
  color: var(--hh-text-muted, inherit); }
.hh-attic-speed { border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; margin: 0; padding: 6px 10px;
  display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; min-width: 0; }
.hh-attic-speed legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }
.hh-attic-speed label { display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; cursor: pointer; }
.hh-attic-speed input:checked + span { font-weight: 700; text-decoration: underline; }
.hh-attic-seek { display: grid; gap: 4px; min-width: 0; }
.hh-attic-range { width: 100%; min-width: 0; margin: 0; accent-color: var(--hh-primary, auto); }
.hh-attic-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; min-width: 0; }
.hh-attic-timeline { max-height: 18rem; overflow-y: auto; min-width: 0; padding: 4px;
  border: 1px solid var(--hh-border-soft, currentColor); border-radius: 6px; }
.hh-attic-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; min-width: 0; }
.hh-attic-entry { display: grid; grid-template-columns: 1.25rem 2.5rem minmax(0, 1fr); column-gap: 6px; align-items: start;
  padding: 4px 6px; border: 1px solid transparent; border-left: 4px solid transparent; border-radius: 4px; }
.hh-attic-entry[data-played='false'] { color: var(--hh-text-muted, inherit); border-left: 4px dotted var(--hh-border-soft, currentColor); }
.hh-attic-entry[data-played='true'] { border-left: 4px solid var(--hh-border, currentColor); }
.hh-attic-entry[aria-current='step'] { font-weight: 700; border: 2px solid var(--hh-border, currentColor);
  border-left: 6px double var(--hh-accent, currentColor); background: var(--hh-surface-raised, transparent); }
.hh-attic-entry-mark svg { color: var(--hh-accent, currentColor); }
.hh-attic-entry-number { font-variant-numeric: tabular-nums; }
.hh-attic-entry-now { display: block; font-size: 0.8125rem; }
.hh-attic-diagnostics li { display: flex; align-items: flex-start; gap: 6px; padding: 6px 8px;
  border: 1px dashed var(--hh-border, currentColor); border-left: 4px solid var(--hh-danger, currentColor); border-radius: 6px; }
.hh-attic-diagnostics svg { flex: none; margin-top: 2px; color: var(--hh-danger, currentColor); }
@media (prefers-reduced-motion: no-preference) {
  .hh-attic[data-motion='low-frequency'] .hh-attic-entry { transition: background-color 0.4s ease-out; }
}
.hh-attic[data-motion='none'] *, .hh-attic:not([data-motion]) * { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .hh-attic * { animation: none !important; transition: none !important; }
}
.hh-attic-own { border: 2px dashed currentColor; border-radius: 10px; padding: 10px 12px; }
.hh-attic-own[data-over='true'] { border-style: solid; }
.hh-attic-own p { margin: 4px 0; }
.hh-attic-own-choose { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; cursor: pointer; }
.hh-attic-own-choose input { font: inherit; }
.hh-attic-own-choose input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.hh-attic-own-refusal { font-weight: 700; }
`
