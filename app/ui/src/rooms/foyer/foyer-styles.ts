// Foyer and Mansion Shell styles. Plain CSS on Crew's theme variables, with
// fallbacks for hosts that lack them, shipped as a string because the live
// bundle is one ES module with no stylesheet beside it.
//
// Rules this sheet keeps (theme-and-accessibility steering):
// - Text sits on its paired Crew surface (--card-fg on --card, --accent-fg on
//   --accent), so the host's contrast carries over in light and dark themes.
// - State is never color alone: every status has an icon and words.
// - Everything focusable shows a ring from --ring.
// - The only animation is the pending spinner. It runs once every 2 seconds,
//   and only when the browser allows motion and Still House is off.
export const FOYER_STYLES = `
.hh-foyer { color: var(--card-fg, var(--text, inherit)); font: inherit; max-width: 560px; margin: 24px; }
.hh-foyer-hall, .hh-shell { background: var(--card, transparent); border: 1px solid var(--border, currentColor);
  border-radius: 8px; padding: 16px 20px; }
.hh-foyer h2 { font-size: 1.125rem; margin: 0 0 4px; }
.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }
.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-foyer-lede { margin: 0 0 16px; color: var(--muted, inherit); }
.hh-foyer-region { margin: 0 0 20px; }
.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; }
.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, inherit); font-size: 0.875rem; }
.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }
.hh-foyer-error svg { color: var(--warn, currentColor); flex: none; margin-top: 2px; }
.hh-foyer-empty { border: 1px dashed var(--border, currentColor); border-radius: 8px; padding: 12px 16px; }
.hh-foyer-empty p { margin: 0; color: var(--muted, inherit); }

.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 8px; }
.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 600; }
.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center;
  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
.hh-mansion[data-selected='true'] { border-color: var(--border-strong, currentColor); border-width: 2px; padding: 9px 11px; }
.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed; }
.hh-mansion:focus-within { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--accent, auto); }
.hh-mansion-name { font-weight: 600; overflow-wrap: anywhere; }
.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-mansion-path { color: var(--muted, inherit); }
.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }
.hh-status-ready svg { color: var(--ok, currentColor); }
.hh-status-missing svg { color: var(--muted, currentColor); }
.hh-status-conflict svg { color: var(--warn, currentColor); }

.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 12px; }
.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--border-strong, currentColor);
  border-radius: 6px; padding: 6px 12px; }
.hh-button-primary { color: var(--accent-fg, inherit); background: var(--accent, transparent); }
.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }
.hh-button:focus-visible, .hh-field input:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }

.hh-create { margin: 0; }
.hh-field { display: grid; gap: 4px; }
.hh-field label { font-weight: 600; }
.hh-field input { font: inherit; color: inherit; background: var(--input, transparent);
  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 10px; max-width: 24rem; }
.hh-field input[aria-invalid='true'] { border-width: 2px; }

.hh-shell-eyebrow { margin: 0; color: var(--muted, inherit); font-size: 0.875rem; }
.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }
.hh-shell-facts dt { font-weight: 600; }
.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }
.hh-shell-rooms { margin: 12px 0; color: var(--muted, inherit); }

.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }
}
`
