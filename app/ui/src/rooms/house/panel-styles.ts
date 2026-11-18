// Styles of the Spec 4 room panels inside the Mansion Shell: phases, Door and
// risky-action proposals, facts and decision buttons. Plain CSS on Crew's
// theme variables with fallbacks, shipped as a string because the live bundle
// is one ES module with no stylesheet beside it. The map, the toolbar and the
// panel frame are in components/house-styles.ts; this sheet adds only what
// the upstream panels need. It reads the house tokens (`--hh-*`) the shell
// root defines and names none of the shell's own classes.
//
// Rules this sheet keeps (theme-and-accessibility steering):
// - Text sits on its paired surface. The warm candle tone is used for borders
//   and icons, never for text on its own.
// - State is never color alone: every phase, Door, ghost and proposal state
//   has an icon and words. Borders change style (solid, dashed, double), not
//   only color.
// - Everything focusable shows a ring.
// - The only animation is the working spinner: one turn every 2 seconds, and
//   only when the shell allows motion and the browser does too.
export const HOUSE_PANEL_STYLES = `
.hh-room-panel h5, .hh-proposal h5, .hh-artifact h5 { font-size: 0.875rem; margin: 0; overflow-wrap: anywhere; }
[data-surface] .hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; min-width: 0;
  max-width: 100%; text-align: left; color: var(--hh-text); background: var(--hh-surface-raised);
  border: 1px solid var(--hh-border); border-radius: 6px; padding: 6px 12px; overflow-wrap: anywhere; }
[data-surface] .hh-button-primary { color: var(--hh-primary-text); background: var(--hh-primary); }
[data-surface] .hh-button:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
[data-surface] .hh-button[aria-disabled='true'] { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted);
  background: var(--hh-surface); }
[data-surface] .hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }
[data-surface] .hh-button-reject[aria-disabled='true'] { border-style: dashed; border-width: 1px; padding: 6px 12px; }

.hh-room-panel { display: grid; gap: 12px; min-width: 0; }
.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; margin: 0; }
.hh-room-line svg { flex: none; margin-top: 2px; color: var(--hh-text-muted); }
.hh-room-line[data-tone='ok'] svg { color: var(--hh-ok); }
.hh-room-line[data-tone='attention'] svg { color: var(--hh-accent); }
.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; overflow-wrap: anywhere; }
.hh-house-note svg { flex: none; margin-top: 2px; }
.hh-house-muted { color: var(--hh-text-muted); }
.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--hh-border-soft); padding-top: 10px; min-width: 0; }
/* What was made: a plain table of names and files, the finished work, and how to open the folder in Kiro. */
.hh-built { container-type: inline-size; display: grid; gap: 8px; min-width: 0; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hh-border); }
.hh-built:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 4px; }
.hh-built h5 { margin: 0; font-size: 1rem; }
.hh-built-lede { margin: 0; font-size: 0.875rem; color: var(--hh-text-muted); }
.hh-built-group { margin: 6px 0 0; font-weight: 600; }
.hh-built-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.hh-built-table th, .hh-built-table td { text-align: left; vertical-align: top; padding: 4px 12px 4px 0; border-bottom: 1px solid var(--hh-border); overflow-wrap: anywhere; }
.hh-built-table thead th { font-weight: 600; color: var(--hh-text-muted); }
.hh-built-table code, .hh-built-tasks code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8125rem; overflow-wrap: anywhere; }
/* In a narrow sheet each row stacks: the everyday name and Kiro's name on one line, the file under them, so no word
   is broken in the middle. */
.hh-built-table th, .hh-built-table td { overflow-wrap: break-word; }
@container (max-width: 30rem) {
  .hh-built-table thead { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); }
  .hh-built-table, .hh-built-table tbody { display: block; }
  .hh-built-table tr { display: grid; grid-template-columns: auto 1fr; gap: 0 10px; padding: 6px 0; border-bottom: 1px solid var(--hh-border); }
  .hh-built-table th, .hh-built-table td { padding: 0; border: 0; }
  .hh-built-table td:nth-of-type(1) { color: var(--hh-text-muted); }
  .hh-built-table td:nth-of-type(1)::before { content: '(Kiro: '; }
  .hh-built-table td:nth-of-type(1)::after { content: ')'; }
  .hh-built-table td:nth-of-type(2) { grid-column: 1 / -1; }
}
.hh-built-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 0.875rem; }
.hh-built-tasks li { display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }
.hh-built-steps { margin: 0; padding-left: 1.25rem; font-size: 0.875rem; }
.hh-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 0.875rem; }
.hh-facts dt { color: var(--hh-text-muted); }
.hh-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem; overflow-wrap: anywhere; }
.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.hh-ghost-surface, .hh-door-surface { display: grid; gap: 10px; min-width: 0; }
.hh-ghost-surface p, .hh-door-surface p { margin: 0; }
.hh-shell-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0; }
.hh-shell-facts dt { font-weight: 600; }
.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }

.hh-proposal { border: 1px solid var(--hh-border-soft); border-left: 4px solid var(--hh-border);
  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }
.hh-proposal:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }
.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }
.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }
.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-accent); }
.hh-proposal-sub { font-size: 0.875rem; margin: 0; }
.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--hh-text-muted); }
.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-proposal-note svg { flex: none; margin-top: 2px; }
.hh-proposal-blocked svg { color: var(--hh-accent); }
.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--hh-ok); }
.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }

@keyframes hh-house-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  [data-motion='low-frequency'] .hh-spin { animation: hh-house-spin 2s linear infinite; }
}
`
