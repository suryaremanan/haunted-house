// House map, room panel, Door and risky-action styles. Plain CSS on Crew's
// theme variables with fallbacks, shipped as a string because the live bundle
// is one ES module with no stylesheet beside it.
//
// Rules this sheet keeps (theme-and-accessibility steering):
// - Text sits on its paired Crew surface, so the host's contrast carries over
//   in light and dark themes. Our only accent is a warm candle tone used for
//   borders and icons, never for text on its own.
// - State is never color alone: every phase, Door, ghost and proposal state
//   has an icon and words. Borders change style (solid, dashed, double), not
//   only color.
// - Everything focusable shows a ring from --ring.
// - The only animation is the working spinner: one turn every 2 seconds, and
//   only when the browser allows motion and Still House is off.
export const HOUSE_STYLES = `
.hh-house-map { --hh-candle: var(--warn, currentColor); margin: 16px 0 0; }
.hh-house-map h3 { font-size: 1rem; margin: 0 0 4px; }
.hh-house-map h4 { font-size: 0.9375rem; margin: 0; }
.hh-house-map h5 { font-size: 0.875rem; margin: 0; }
.hh-house-map h3:focus-visible, .hh-house-map h4:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-house-lede { margin: 0 0 12px; color: var(--muted, inherit); font-size: 0.875rem; }
.hh-house-note { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 12px; overflow-wrap: anywhere; }
.hh-house-note svg { flex: none; margin-top: 2px; }
.hh-house-blocked { border: 1px dashed var(--border-strong, currentColor); border-radius: 6px; padding: 8px 10px; }
.hh-house-blocked svg, .hh-house-problem svg { color: var(--hh-candle); }
.hh-house-muted { color: var(--muted, inherit); }

.hh-needs { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer; color: inherit;
  background: transparent; border: 1px solid var(--border-strong, currentColor); border-radius: 999px;
  padding: 4px 12px; margin: 0 0 8px; }
.hh-needs[data-count='0'] { border-style: dashed; cursor: default; color: var(--muted, inherit); }
.hh-needs:not([data-count='0']) { border-width: 2px; padding: 3px 11px; font-weight: 600; }
.hh-needs:not([data-count='0']) svg { color: var(--hh-candle); }
.hh-needs:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-needs-list { margin: 0 0 12px; padding: 0 0 0 1.25rem; font-size: 0.875rem; }

.hh-map { margin: 0 0 12px; }
.hh-map-rooms { list-style: none; margin: 0; padding: 0; display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.hh-room { display: grid; gap: 6px; width: 100%; height: 100%; text-align: left; font: inherit; color: inherit;
  cursor: pointer; background: var(--card, transparent); border: 1px solid var(--border, currentColor);
  border-top: 3px solid var(--border-strong, currentColor); border-radius: 10px 10px 4px 4px; padding: 10px 12px;
  align-content: start; }
.hh-room[aria-expanded='true'] { border-color: var(--border-strong, currentColor); border-width: 2px;
  border-top-width: 3px; padding: 10px 11px 9px; }
.hh-room[data-needs='true'] { border-top-style: double; border-top-width: 5px; padding-top: 8px; }
.hh-room:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
.hh-room-name { font-weight: 600; }
.hh-room-line { display: flex; align-items: flex-start; gap: 6px; font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-room-line svg { flex: none; margin-top: 2px; color: var(--muted, currentColor); }
.hh-room-line[data-tone='ok'] svg { color: var(--ok, currentColor); }
.hh-room-line[data-tone='attention'] svg { color: var(--hh-candle); }
.hh-room-needs { font-weight: 600; }

.hh-room-panel { border: 1px solid var(--border-strong, currentColor); border-radius: 8px; padding: 12px 14px;
  display: grid; gap: 12px; }
.hh-room-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.hh-phase { display: grid; gap: 6px; border-top: 1px solid var(--border, currentColor); padding-top: 10px; }
.hh-facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0; font-size: 0.875rem; }
.hh-facts dt { color: var(--muted, inherit); }
.hh-facts dd { margin: 0; overflow-wrap: anywhere; }
.hh-facts code, .hh-proposal code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem; overflow-wrap: anywhere; }
.hh-ghost-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }

.hh-proposal { border: 1px solid var(--border, currentColor); border-left: 4px solid var(--border-strong, currentColor);
  border-radius: 6px; padding: 10px 12px; display: grid; gap: 8px; }
.hh-proposal[data-state='pending'] { border-left-style: double; border-left-width: 6px; }
.hh-proposal[data-blocked='true'] { border-style: dashed; border-left-style: dashed; }
.hh-proposal-head { display: flex; align-items: flex-start; gap: 6px; }
.hh-proposal-head svg { flex: none; margin-top: 2px; color: var(--hh-candle); }
.hh-proposal-sub { font-size: 0.875rem; margin: 0; }
.hh-proposal-group { font-size: 0.8125rem; font-weight: 600; margin: 4px 0 0; color: var(--muted, inherit); }
.hh-proposal-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-proposal-note svg { flex: none; margin-top: 2px; }
.hh-proposal-blocked svg { color: var(--hh-candle); }
.hh-proposal-outcome[data-outcome='approved'] svg { color: var(--ok, currentColor); }
.hh-decide { display: flex; flex-wrap: wrap; gap: 8px; }
.hh-house-map .hh-button[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; border-style: dashed; }
.hh-button-reject { border-style: double; border-width: 3px; padding: 4px 10px; }

@keyframes hh-house-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-house-map:not([data-still='true']) .hh-spin { animation: hh-house-spin 2s linear infinite; }
}
`
