// The house's own sheet (Spec 6 task 4.1): Mansion Shell, toolbar, House Map,
// room cells with their room, ghost and Door controls, the art layer, the
// panel host and the one announcer. Plain CSS shipped as a string, because the
// live bundle is one ES module with no stylesheet beside it. Every class here
// starts with `hh-ui-` under the root `.hh-ui`; the Foyer and Spec 4 panel
// sheets keep their own classes and are not redefined.
//
// Rules this sheet keeps (theme-and-accessibility steering):
// - Semantic `--hh-*` tokens read a Crew theme variable first and a tested
//   fallback from house-palette.ts second (light by default, dark under
//   `data-theme='dark'`). The Crew names are the ones specs 1 to 4 already
//   use. HUI-S1, the live check of those host variables inside an installed
//   app page, is still pending; until it passes, the names are an assumption.
// - State is never color alone. Each Door and ghost state changes border
//   style, width or shape, and always sits next to its exact state word.
// - Every control shows a focus ring, drawn with an offset on the background.
// - One ordered list, three layouts: a cutaway grid from 900px, a compact
//   grid below it, one column at 640px and below. Rooms are placed by grid
//   area only, so DOM order, reading order and the arrow map never change.
// - Text wraps instead of overflowing; nothing has a fixed width, so the
//   house fits 320px and text enlarged to 200 percent.
// - Motion is optional and slow. It runs only when the shell says
//   `data-motion='low-frequency'` and the browser has no reduced-motion
//   preference, and no cycle is shorter than 2 seconds. Nothing follows the
//   pointer, shifts with scrolling, or flashes.
import { MIN_MOTION_CYCLE_SECONDS } from '../core/motion-policy'
import { paletteCssVariables } from './house-palette'

/** Layout switches from the compact grid to the cutaway at this width. */
export const WIDE_BREAKPOINT_PX = 900
/** At this width and below the rooms form one column. */
export const LINEAR_BREAKPOINT_PX = 640
/** The shortest cycle any optional animation may have: the Motion Policy's limit. */
export const MIN_ANIMATION_SECONDS = MIN_MOTION_CYCLE_SECONDS

export const HOUSE_UI_STYLES = `
.hh-ui { ${paletteCssVariables('light')}
  --hh-canvas: var(--card, var(--hh-fb-canvas));
  --hh-surface: var(--card, var(--hh-fb-surface));
  --hh-surface-raised: var(--input, var(--hh-fb-surface-raised));
  --hh-text: var(--card-fg, var(--text, var(--hh-fb-text)));
  --hh-text-muted: var(--muted, var(--hh-fb-text-muted));
  --hh-border: var(--border-strong, var(--hh-fb-border));
  --hh-border-soft: var(--border, var(--hh-fb-border));
  --hh-focus: var(--ring, var(--hh-fb-focus));
  --hh-accent: var(--warn, var(--hh-fb-accent));
  --hh-primary: var(--accent, var(--hh-fb-accent));
  --hh-primary-text: var(--accent-fg, var(--hh-fb-accent-text));
  --hh-danger: var(--warn, var(--hh-fb-danger));
  --hh-ok: var(--ok, var(--hh-fb-ok));
  --hh-candle: var(--warn, var(--hh-fb-candle));
  --hh-ghost: var(--hh-fb-ghost);
  color: var(--hh-text); background: var(--hh-canvas); font: inherit; line-height: 1.4;
  display: grid; gap: 12px; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 12px;
  border: 1px solid var(--hh-border-soft); border-radius: 8px; overflow-wrap: anywhere; }
.hh-ui[data-theme='dark'] { ${paletteCssVariables('dark')} }
.hh-ui *, .hh-ui *::before, .hh-ui *::after { box-sizing: border-box; }
.hh-ui h2, .hh-ui h3, .hh-ui h4, .hh-ui p { margin: 0; overflow-wrap: anywhere; }
.hh-ui h2 { font-size: 1.125rem; }
.hh-ui h3 { font-size: 1rem; }
.hh-ui h4 { font-size: 0.9375rem; }
.hh-ui h2:focus-visible, .hh-ui h3:focus-visible, .hh-ui h4:focus-visible { outline: 2px solid var(--hh-focus); outline-offset: 2px; }
.hh-ui-muted { color: var(--hh-text-muted); }

.hh-ui-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-width: 0; }
.hh-ui-mansion-name { font-weight: 600; min-width: 0; flex: 1 1 8rem; overflow-wrap: anywhere; }
.hh-ui-needs, .hh-ui-toggle, .hh-ui-button, .hh-ui-panel-close, .hh-ui-status > summary {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; font: inherit; text-align: left;
  color: var(--hh-text); background: var(--hh-surface-raised); border: 1px solid var(--hh-border);
  border-radius: 6px; padding: 6px 12px; cursor: pointer; overflow-wrap: anywhere; }
.hh-ui-needs { border-radius: 999px; border-width: 2px; font-weight: 600; }
.hh-ui-needs svg { flex: none; color: var(--hh-accent); }
.hh-ui-needs[data-count='0'] { border-style: dashed; border-width: 1px; font-weight: 400; color: var(--hh-text-muted); cursor: default; }
.hh-ui-needs[data-count='0'] svg { color: var(--hh-text-muted); }
.hh-ui-toggle[aria-pressed='true'] { border-style: double; border-width: 4px; padding: 3px 9px; font-weight: 600; }
.hh-ui-button[data-variant='primary'] { color: var(--hh-primary-text); background: var(--hh-primary); }
.hh-ui-status { min-width: 0; }
.hh-ui-status > summary { list-style-position: inside; }
.hh-ui-status-body { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--hh-border-soft); border-radius: 6px; }

.hh-ui-needs:focus-visible, .hh-ui-toggle:focus-visible, .hh-ui-button:focus-visible, .hh-ui-panel-close:focus-visible,
.hh-ui-status > summary:focus-visible, .hh-ui-room-control:focus-visible, .hh-ui-ghost-control:focus-visible,
.hh-ui-door-control:focus-visible, .hh-ui-panel:focus-visible, .hh-ui-map-title:focus-visible {
  outline: 2px solid var(--hh-focus); outline-offset: 2px; }

.hh-ui [aria-disabled='true'], .hh-ui button:disabled { cursor: not-allowed; border-style: dashed; color: var(--hh-text-muted); }
.hh-ui-reason { font-size: 0.875rem; color: var(--hh-text-muted); }

.hh-ui-note { display: flex; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px 10px;
  border: 1px solid var(--hh-border); border-left-width: 4px; border-radius: 6px; background: var(--hh-surface); }
.hh-ui-note svg { flex: none; margin-top: 2px; }
.hh-ui-note[data-kind='diagnostic'] { border-style: dashed; border-left-style: solid; }
.hh-ui-note[data-kind='diagnostic'] svg { color: var(--hh-danger); }
.hh-ui-note[data-kind='read-only'] { border-left-style: double; border-left-width: 6px; }
.hh-ui-note[data-kind='locked'] { border-style: dotted; border-left-style: dotted; }

.hh-ui-house { position: relative; min-width: 0; }
.hh-ui-map { position: relative; min-width: 0; }
.hh-ui-map-title { font-size: 1rem; margin: 0 0 8px; }
.hh-ui-house-art { display: none; position: absolute; inset: 0; width: 100%; height: 100%; color: var(--hh-border); pointer-events: none; }
.hh-ui-rooms { position: relative; list-style: none; margin: 0; padding: 0; min-width: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }

.hh-ui-room-cell { position: relative; min-width: 0; display: grid; align-content: start; gap: 6px; padding: 10px;
  background: var(--hh-surface); border: 2px solid var(--hh-border); border-radius: 4px; }
.hh-ui-room-cell[data-integrity='uncertain'], .hh-ui-room-cell[data-integrity='incompatible'] { border-style: dashed; }
.hh-ui-room-cell[data-integrity='corrupt'] { border-style: dotted; border-width: 3px; padding: 9px; }
.hh-ui-room-cell[data-locked='true'] { border-style: dotted;
  background: repeating-linear-gradient(135deg, var(--hh-surface) 0 10px, var(--hh-surface-raised) 10px 20px); }
.hh-ui-room-cell[data-needs='true'] { border-top-style: double; border-top-width: 6px; padding-top: 6px; }
.hh-ui-room-art { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--hh-border-soft); pointer-events: none; }
.hh-ui-room-controls { position: relative; display: grid; gap: 6px; min-width: 0; }

.hh-ui-room-control, .hh-ui-ghost-control, .hh-ui-door-control {
  display: grid; gap: 4px; justify-items: start; width: 100%; min-width: 0; font: inherit; text-align: left;
  color: var(--hh-text); background: var(--hh-surface-raised); border: 1px solid var(--hh-border);
  padding: 8px 10px; cursor: pointer; overflow-wrap: anywhere; }
.hh-ui-room-control { border-radius: 6px; border-width: 2px; }
.hh-ui-room-control[aria-expanded='true'] { border-style: double; border-width: 4px; padding: 6px 8px; }
.hh-ui-room-name { font-weight: 600; font-size: 1rem; }
.hh-ui-state { display: flex; align-items: flex-start; gap: 6px; min-width: 0; font-size: 0.875rem; }
.hh-ui-state svg { flex: none; margin-top: 2px; }
.hh-ui-state-word { font-weight: 600; }

.hh-ui-ghost-control { grid-template-columns: auto minmax(0, 1fr); align-items: center; border-radius: 18px 18px 6px 6px; }
.hh-ui-ghost-control[data-ghost='idle'] { border-style: solid; border-width: 1px; }
.hh-ui-ghost-control[data-ghost='working'] { border-style: solid; border-width: 3px; padding: 6px 8px; }
.hh-ui-ghost-control[data-ghost='waiting'] { border-style: double; border-width: 4px; padding: 5px 7px; }
.hh-ui-ghost-control[data-ghost='blocked'] { border-style: dashed; border-width: 2px; padding: 7px 9px; }
.hh-ui-ghost-control[data-ghost='failed'] { border-style: dotted; border-width: 3px; padding: 6px 8px; border-radius: 4px; }
.hh-ui-ghost-control[data-ghost='done'] { border-style: solid; border-width: 2px; padding: 7px 9px; border-radius: 6px; }
.hh-ui-ghost-control[data-ghost='not_applicable'], .hh-ui-ghost-control[data-ghost='unavailable'] {
  border-style: dashed; border-width: 1px; color: var(--hh-text-muted); }
.hh-ui-ghost-control[data-ghost='waiting'] .hh-ui-state svg, .hh-ui-ghost-control[data-ghost='blocked'] .hh-ui-state svg { color: var(--hh-accent); }
.hh-ui-ghost-control[data-ghost='failed'] .hh-ui-state svg { color: var(--hh-danger); }
.hh-ui-ghost-control[data-ghost='done'] .hh-ui-state svg { color: var(--hh-ok); }

.hh-ui-door-control { grid-template-columns: auto minmax(0, 1fr); align-items: center; border-radius: 14px 14px 2px 2px; }
.hh-ui-door-control[data-door='sealed'] { border-style: solid; border-width: 3px; padding: 6px 8px; }
.hh-ui-door-control[data-door='waiting'] { border-style: double; border-width: 4px; padding: 5px 7px; }
.hh-ui-door-control[data-door='open'] { border-style: solid; border-width: 1px; border-left-width: 6px; padding-left: 5px; }
.hh-ui-door-control[data-door='rejected'] { border-style: dotted; border-width: 3px; padding: 6px 8px; }
.hh-ui-door-control[data-door='not_applicable'], .hh-ui-door-control[data-door='unavailable'] {
  border-style: dashed; border-width: 1px; color: var(--hh-text-muted); }
.hh-ui-door-control[data-door='waiting'] .hh-ui-state svg { color: var(--hh-accent); }
.hh-ui-door-control[data-door='rejected'] .hh-ui-state svg { color: var(--hh-danger); }
.hh-ui-door-control[data-door='open'] .hh-ui-state svg { color: var(--hh-ok); }

.hh-ui-art { display: block; flex: none; max-width: 100%; }
.hh-ui-art-ghost { color: var(--hh-ghost); }
.hh-ui-art-door { color: var(--hh-border); }
.hh-ui-art-candle { color: var(--hh-border); }
.hh-ui-art-flame { color: var(--hh-candle); transform-box: fill-box; transform-origin: center bottom; }
.hh-ui-art-dust { color: var(--hh-text-muted); }

.hh-ui-backdrop { position: fixed; inset: 0; background: var(--hh-canvas); opacity: 0.85; }
.hh-ui-panel { display: grid; gap: 12px; align-content: start; min-width: 0; width: min(42rem, 100%); max-width: 100%;
  color: var(--hh-text); background: var(--hh-surface); border: 2px solid var(--hh-border); border-radius: 8px;
  padding: 12px 14px; overflow-wrap: anywhere; }
.hh-ui-panel[data-mode='dialog'] { position: fixed; top: 5vh; left: 50%; translate: -50% 0; max-height: 90vh; overflow-y: auto;
  width: min(42rem, calc(100% - 24px)); }
.hh-ui-panel[data-mode='region'] { position: static; }
.hh-ui-panel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.hh-ui-panel-body { display: grid; gap: 12px; min-width: 0; }
.hh-ui-panel-body code, .hh-ui-panel-body pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.hh-ui-panel-secondary { border-top: 1px solid var(--hh-border-soft); padding-top: 10px; }

.hh-ui-announcer { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

@media (max-width: ${LINEAR_BREAKPOINT_PX}px) {
  .hh-ui { padding: 8px; }
  .hh-ui-rooms { grid-template-columns: minmax(0, 1fr); }
  .hh-ui-panel[data-mode='dialog'] { top: 0; max-height: 100vh; width: 100%; }
}

@media (min-width: ${WIDE_BREAKPOINT_PX}px) {
  .hh-ui-house { padding: 3.5rem 1.5rem 1rem; }
  .hh-ui-house-art { display: block; }
  .hh-ui-rooms { grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas: 'attic attic attic' '. drafting .' 'study foyer workshop'; }
  .hh-ui-rooms[data-seance='shown'] { grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas: 'attic attic attic attic' '. drafting . .' 'study foyer workshop seance'; }
  .hh-ui-room-cell[data-room='foyer'] { grid-area: foyer; }
  .hh-ui-room-cell[data-room='study'] { grid-area: study; }
  .hh-ui-room-cell[data-room='drafting-room'] { grid-area: drafting; }
  .hh-ui-room-cell[data-room='workshop'] { grid-area: workshop; }
  .hh-ui-room-cell[data-room='attic'] { grid-area: attic; border-radius: 28px 28px 4px 4px; }
  .hh-ui-room-cell[data-room='seance-room'] { grid-area: seance; }
}

@keyframes hh-ui-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes hh-ui-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@keyframes hh-ui-drift { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost[data-ghost='idle'] { animation: hh-ui-float 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-ghost[data-ghost='working'] { animation: hh-ui-flicker 2s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-flame { animation: hh-ui-flicker 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-ui-art-dust { animation: hh-ui-drift 9s ease-in-out infinite; }
}
.hh-ui[data-motion='none'], .hh-ui[data-motion='none'] *, .hh-ui:not([data-motion]) * { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .hh-ui, .hh-ui * { animation: none !important; transition: none !important; }
}
`
