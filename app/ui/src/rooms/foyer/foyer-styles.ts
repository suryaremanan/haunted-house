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
.hh-foyer { color: var(--card-fg, var(--text, var(--hh-fb-text, inherit))); font: inherit; max-width: 48rem; margin: 20px auto 0; }
.hh-foyer[data-view='mansion'] { max-width: none; margin: 0; }
.hh-foyer-hall, .hh-shell { background: var(--card, var(--hh-fb-surface, transparent));
  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 12px; padding: 18px 20px; }
.hh-foyer h2 { font-family: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-size: 1.375rem; margin: 0 0 4px; }
.hh-foyer h3 { font-size: 1rem; margin: 0 0 4px; }
.hh-foyer h2:focus-visible, .hh-foyer-region:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }
.hh-foyer-lede { margin: 0 0 12px; color: var(--muted, var(--hh-fb-text-muted, inherit)); }
.hh-foyer-invite { margin: 0 0 16px; padding: 10px 14px; font-size: 1.0625rem; font-weight: 600;
  border-left: 4px solid var(--warn, var(--hh-fb-accent, currentColor)); background: var(--input, var(--hh-fb-surface-raised, transparent));
  border-radius: 0 8px 8px 0; }
.hh-foyer-region { margin: 0 0 24px; }
.hh-foyer-inline { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }
.hh-foyer-hint { display: block; margin: 4px 0 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }
.hh-foyer-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; overflow-wrap: anywhere; }
.hh-foyer-error svg { color: var(--warn, var(--hh-fb-danger, currentColor)); flex: none; margin-top: 2px; }
.hh-foyer-empty { border: 1px dashed var(--border, var(--hh-fb-border, currentColor)); border-radius: 8px; padding: 12px 16px; }
.hh-foyer-empty p { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }

.hh-mansions { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }
.hh-mansions legend { padding: 0; margin: 0 0 8px; font-weight: 700; }
.hh-mansion { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: center; min-width: 0;
  background: var(--input, var(--hh-fb-surface-raised, transparent));
  border: 1px solid var(--border, var(--hh-fb-border, currentColor)); border-radius: 10px; padding: 12px 14px; cursor: pointer; }
.hh-mansion[data-selected='true'] { border-color: var(--warn, var(--hh-fb-accent, currentColor)); border-width: 3px; padding: 10px 12px; }
.hh-mansion[data-status='missing'], .hh-mansion[data-status='conflict'] { cursor: not-allowed; border-style: dashed;
  background: transparent; }
.hh-mansion:focus-within { outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }
.hh-mansion input { margin: 0; width: 1rem; height: 1rem; accent-color: var(--warn, var(--hh-fb-accent, auto)); }
.hh-mansion-name { font-family: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-weight: 700; font-size: 1.0625rem;
  overflow-wrap: anywhere; }
.hh-mansion-path, .hh-mansion-status { grid-column: 2; font-size: 0.8125rem; overflow-wrap: anywhere; }
.hh-mansion-path { color: var(--muted, var(--hh-fb-text-muted, inherit)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.hh-mansion-status { display: inline-flex; align-items: center; gap: 6px; }
.hh-mansion { container-type: inline-size; }
@container (min-width: 16em) { .hh-path-part { white-space: nowrap; } }
.hh-status-ready svg { color: var(--ok, var(--hh-fb-ok, currentColor)); }
.hh-status-missing svg { color: var(--muted, var(--hh-fb-text-muted, currentColor)); }
.hh-status-conflict svg { color: var(--warn, var(--hh-fb-danger, currentColor)); }

.hh-foyer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 14px; }
.hh-button { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor));
  border-radius: 8px; padding: 6px 12px; }
.hh-button-primary { color: var(--accent-fg, var(--hh-fb-accent-text, inherit)); background: var(--accent, var(--hh-fb-accent, transparent));
  font-weight: 700; padding: 10px 18px; font-size: 1.0625rem; }
.hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }
.hh-button:focus-visible, .hh-field input:focus-visible, .hh-field textarea:focus-visible {
  outline: 2px solid var(--ring, var(--hh-fb-focus, currentColor)); outline-offset: 2px; }

.hh-create { margin: 0; padding-top: 16px; border-top: 1px solid var(--border, var(--hh-fb-border, currentColor)); }
.hh-field { display: grid; gap: 4px; min-width: 0; }
.hh-field label { font-weight: 600; }
.hh-field input, .hh-field textarea { font: inherit; color: inherit; background: var(--input, var(--hh-fb-surface-raised, transparent));
  border: 1px solid var(--border-strong, var(--hh-fb-border, currentColor)); border-radius: 6px; padding: 6px 10px;
  width: 100%; min-width: 0; max-width: 24rem; box-sizing: border-box; }
.hh-field input[aria-invalid='true'], .hh-field textarea[aria-invalid='true'] { border-width: 2px; }
.hh-field textarea { resize: vertical; max-width: 36rem; min-height: 5rem; }
.hh-create .hh-field + .hh-field { margin-top: 12px; }

.hh-shell-eyebrow { margin: 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); font-size: 0.875rem; }
.hh-shell-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 12px 0; }
.hh-shell-facts dt { font-weight: 600; }
.hh-shell-facts dd { margin: 0; overflow-wrap: anywhere; }
.hh-shell-rooms { margin: 12px 0; color: var(--muted, var(--hh-fb-text-muted, inherit)); }

.hh-foyer-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (max-width: 640px) {
  .hh-foyer-hall, .hh-shell { padding: 14px 12px; }
}

@keyframes hh-foyer-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-foyer[data-motion='low-frequency'] .hh-foyer-spin { animation: hh-foyer-spin 2s linear infinite; }
}
`
