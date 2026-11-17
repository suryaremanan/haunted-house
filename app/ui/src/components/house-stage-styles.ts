// The stage sheet (the 3D overhaul): it turns the house map into an
// architect's model standing on a drafting sheet. Each room is a real box in
// one-point perspective; the wide layout gives the whole house one shared
// vanishing point, so rooms left and right of centre show their side walls
// the way a section perspective does.
//
// It is appended after house-styles.ts and only restyles what that sheet lays
// out. The rules it keeps:
// - Text never sits on scene colors. Controls stay on theme surfaces, in a
//   caption slab under each room; the box above them is decoration with no
//   pointer events.
// - Scene colors come from the Scene Palette (`--hh-sc-*`), never from a
//   literal here. Shading is color-mix of those tokens.
// - The 3D is a still drawing. Nothing follows the pointer or the scroll.
//   What moves (a Door leaf swinging, a ghost hovering, a lamp breathing) runs
//   only under `data-motion='low-frequency'` with no reduced-motion
//   preference, and no loop is shorter than the Motion Policy's 2 seconds.
// - The same ordered list in every layout: a model with one vanishing point
//   from 900px, separate small boxes below it.
import { GUIDE_RESERVE, SCENE_HEIGHT, SCENE_WIDTH, STAGE_GUTTER_PX, STAGE_REM, STRIP_OF_SCENE, WARDEN_WIDTH } from '../core/guide-layout'
import { MIN_MOTION_CYCLE_SECONDS } from '../core/motion-policy'
import { GUIDE_BALLOON_STYLES } from './guide-balloon-styles'
import { sceneCssVariables } from './house-palette'
import { LINEAR_BREAKPOINT_PX, WIDE_BREAKPOINT_PX } from './house-styles'

/** How far the model turns in the three-quarter view, in degrees. */
export const TURNED_VIEW_DEGREES = 16
/** The Door leaf's swing, in seconds. It answers a state change; it does not loop. */
export const DOOR_SWING_SECONDS = 1.2
export const STAGE_MIN_LOOP_SECONDS = MIN_MOTION_CYCLE_SECONDS

/** The room's height over its width, and the reverse. */
const SCENE_H_OF_W = SCENE_HEIGHT / SCENE_WIDTH
const SCENE_W_OF_H = SCENE_WIDTH / SCENE_HEIGHT
/** The open sheet and the map sheet start this far in from the room's left edge, in parts of its width. */
export const SHEET_LEFT = 0.03
/** The map sheet's width, in parts of the room's: it ends before the Guide Reserve begins. */
export const MAP_SHEET_WIDTH = 0.8
/** The open room sheet's width, in parts of the room's. */
export const ROOM_SHEET_WIDTH = 0.6

const shade = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, black)`
const tint = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`

export const HOUSE_STAGE_STYLES = `
.hh-ui { ${sceneCssVariables('light')}
  --hh-font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  --hh-font-label: var(--hh-font-sans);
  --hh-depth: 110px; --hh-room-h: clamp(130px, 30vw, 200px); border-radius: 16px; }
.hh-ui[data-theme='dark'] { ${sceneCssVariables('dark')} }

.hh-ui h2, .hh-ui h3 { letter-spacing: 0; }
.hh-ui-needs, .hh-ui-toggle, .hh-ui-button, .hh-ui-panel-close, .hh-ui-status > summary {
  font-family: var(--hh-font-label); font-weight: 600; border-width: 2px; border-radius: 6px; }
.hh-ui-needs { border-radius: 999px; }
.hh-ui-mansion-name .hh-ui-muted { font-family: var(--hh-font-label); letter-spacing: 0; text-transform: none; }
.hh-ui-replay-label { font-family: var(--hh-font-label); letter-spacing: 0; text-transform: none; font-size: 0.9375rem; }
.hh-ui-map-title { font-size: 1.5rem; }
.hh-ui-view-toggle { display: none; }

.hh-ui-house { position: relative; padding: 14px; border: 2px solid var(--hh-sc-sheet-ink); border-radius: 12px;
  background-color: var(--hh-sc-sheet);
  background-image: linear-gradient(var(--hh-sc-sheet-line) 1px, transparent 1px), linear-gradient(90deg, var(--hh-sc-sheet-line) 1px, transparent 1px),
    linear-gradient(${tint('--hh-sc-sheet-ink', 22)} 1px, transparent 1px), linear-gradient(90deg, ${tint('--hh-sc-sheet-ink', 22)} 1px, transparent 1px);
  background-size: 20px 20px, 20px 20px, 100px 100px, 100px 100px; background-position: -1px -1px; }
.hh-stage-art { display: block; pointer-events: none; color: var(--hh-sc-ink); }
.hh-stage-roof-art, .hh-stage-sky-art, .hh-stage-yard-art { display: none; }
.hh-stage-yard-art { color: var(--hh-sc-sheet-ink); }
.hh-stage-sky-art { color: var(--hh-sc-sheet-ink); }
.hh-stage-titleblock { display: none; }

.hh-ui-rooms { gap: 12px; }
.hh-ui-room-cell { padding: 0; gap: 0; grid-template-rows: auto minmax(0, 1fr); border-color: var(--hh-sc-poche);
  border-width: 4px; border-radius: 6px; background: var(--hh-sc-poche); }
.hh-ui-room-cell[data-integrity='corrupt'] { padding: 0; }
.hh-ui-room-cell[data-needs='true'] { padding-top: 0; }
.hh-ui-room-cell[data-locked='true'] { background: var(--hh-sc-poche); }
.hh-ui-room-scene { grid-row: 1; aspect-ratio: auto; height: var(--hh-room-h); container-type: normal; perspective: 700px; perspective-origin: 50% 42%; }
.hh-ui-room-controls { grid-row: 2; padding: 8px 10px 10px; background: var(--hh-surface); border-radius: 0 0 2px 2px; }
.hh-ui-room-control { border-color: transparent; background: transparent; padding: 2px 4px; }
.hh-ui-room-name { font-size: 1.25rem; }
.hh-ui-room-control .hh-ui-state, .hh-ui-ghost-control, .hh-ui-door-control { font-family: var(--hh-font-label); }
.hh-ui-ghost-control { border-radius: 22px 22px 10px 10px; }

.hh-stage { position: absolute; inset: 0; transform-style: preserve-3d; --hh-w: var(--hh-sc-wall-foyer); }
.hh-stage[data-scene='study'] { --hh-w: var(--hh-sc-wall-study); }
.hh-stage[data-scene='drafting-room'] { --hh-w: var(--hh-sc-wall-drafting); }
.hh-stage[data-scene='workshop'] { --hh-w: var(--hh-sc-wall-workshop); }
.hh-stage[data-scene='attic'] { --hh-w: var(--hh-sc-wall-attic); }
.hh-stage[data-scene='seance-room'] { --hh-w: var(--hh-sc-wall-seance); }
.hh-stage-plane { position: absolute; display: block; transform-style: preserve-3d; }
.hh-stage-back { inset: 0; transform: translateZ(calc(-1 * var(--hh-depth)));
  background:
    linear-gradient(to top, ${shade('--hh-w', 58)} 0 22%, ${shade('--hh-sc-wood-dark', 80)} 22% 24.5%, transparent 24.5%),
    repeating-linear-gradient(90deg, transparent 0 13px, ${tint('--hh-sc-bone', 9)} 13px 26px),
    var(--hh-w); }
.hh-stage-floor { left: 0; right: 0; bottom: 0; height: var(--hh-depth); transform-origin: 50% 100%; transform: rotateX(90deg);
  background:
    linear-gradient(to bottom, ${shade('--hh-sc-ink', 100)} -10%, transparent 55%),
    repeating-linear-gradient(90deg, var(--hh-sc-floor) 0 26px, ${shade('--hh-sc-floor', 62)} 26px 28px); }
.hh-stage-ceiling { left: 0; right: 0; top: 0; height: var(--hh-depth); transform-origin: 50% 0; transform: rotateX(-90deg);
  background: linear-gradient(to top, ${shade('--hh-w', 30)}, ${shade('--hh-w', 46)}); }
.hh-stage-left { left: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 0 50%; transform: rotateY(90deg);
  background: linear-gradient(to top, ${shade('--hh-w', 40)} 0 22%, ${shade('--hh-sc-wood-dark', 60)} 22% 24.5%, transparent 24.5%), ${shade('--hh-w', 70)}; }
.hh-stage-right { right: 0; top: 0; bottom: 0; width: var(--hh-depth); transform-origin: 100% 50%; transform: rotateY(-90deg);
  background: linear-gradient(to top, ${shade('--hh-w', 34)} 0 22%, ${shade('--hh-sc-wood-dark', 52)} 22% 24.5%, transparent 24.5%), ${shade('--hh-w', 58)}; }
.hh-stage[data-scene='workshop'] .hh-stage-back { background:
    repeating-linear-gradient(0deg, transparent 0 11px, ${shade('--hh-w', 55)} 11px 13px),
    repeating-linear-gradient(90deg, transparent 0 30px, ${shade('--hh-w', 55)} 30px 32px), var(--hh-w); }
.hh-stage[data-scene='attic'] .hh-stage-back { background:
    repeating-linear-gradient(90deg, transparent 0 22px, ${shade('--hh-w', 55)} 22px 24px), var(--hh-w); }

.hh-stage-wall-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; }
.hh-stage-back[data-doors='1'] .hh-stage-wall-art { left: 24%; width: 76%; }
.hh-stage-back[data-doors='2'] .hh-stage-wall-art { left: 42%; width: 58%; }
.hh-stage-props { position: absolute; inset: 0; transform: translateZ(calc(-0.42 * var(--hh-depth))); pointer-events: none; }
.hh-stage-prop-art { position: absolute; left: 0; bottom: 0; width: 100%; height: 92%; }
.hh-stage-glow { position: absolute; inset: -6%; transform: translateZ(calc(-0.7 * var(--hh-depth))); pointer-events: none;
  background: radial-gradient(closest-side, ${tint('--hh-sc-ink', 0)}, ${tint('--hh-sc-ink', 62)}); }
.hh-stage[data-lit='true'] .hh-stage-glow { background: radial-gradient(closest-side, ${tint('--hh-sc-lamp', 42)}, ${tint('--hh-sc-lamp', 8)} 70%, transparent); }
.hh-stage[data-locked='true'] .hh-stage-glow { background: repeating-linear-gradient(135deg, ${tint('--hh-sc-ink', 70)} 0 12px, ${tint('--hh-sc-ink', 40)} 12px 24px); }

.hh-stage-doors { position: absolute; left: 5%; bottom: 0; height: 68%; display: flex; align-items: flex-end; gap: 8%;
  width: 40%; transform-style: preserve-3d; }
.hh-stage-door { position: relative; display: block; flex: none; height: 100%; aspect-ratio: 5 / 9; transform-style: preserve-3d;
  background: var(--hh-sc-ink); border: 3px solid var(--hh-sc-wood-dark); border-bottom-width: 0;
  border-radius: 46% 46% 0 0 / 24% 24% 0 0; }
.hh-stage-doorway { position: absolute; inset: 0; display: block; border-radius: inherit; }
.hh-stage-door[data-door='open'] .hh-stage-doorway, .hh-stage-door[data-door='waiting'] .hh-stage-doorway {
  background: radial-gradient(ellipse at 50% 70%, var(--hh-sc-moon), var(--hh-sc-lamp) 55%, ${shade('--hh-sc-lamp', 45)}); }
.hh-stage-leaf { position: absolute; inset: 0; display: block; border-radius: inherit; transform-origin: 0 50%;
  border: 2px solid var(--hh-sc-ink);
  background:
    radial-gradient(circle at 82% 56%, var(--hh-sc-brass) 0 3px, var(--hh-sc-ink) 3px 4.5px, transparent 4.5px),
    linear-gradient(${shade('--hh-sc-wood', 70)}, ${shade('--hh-sc-wood', 70)}) 50% 30% / 56% 26% no-repeat,
    linear-gradient(${shade('--hh-sc-wood', 70)}, ${shade('--hh-sc-wood', 70)}) 50% 82% / 56% 30% no-repeat,
    var(--hh-sc-wood); }
.hh-stage-door[data-door='waiting'] .hh-stage-leaf { transform: rotateY(-22deg); }
.hh-stage-door[data-door='open'] .hh-stage-leaf { transform: rotateY(-78deg); }
.hh-stage-door[data-door='not_applicable'] .hh-stage-leaf, .hh-stage-door[data-door='unavailable'] .hh-stage-leaf {
  background: ${shade('--hh-w', 80)}; border-style: dashed; }
.hh-stage-mark { position: absolute; display: none; left: -18%; right: -18%; top: 42%; height: 11%;
  background: var(--hh-sc-wood-dark); border: 2px solid var(--hh-sc-ink); border-radius: 2px; }
.hh-stage-door[data-door='sealed'] .hh-stage-mark:first-child { display: block; background: var(--hh-sc-brass); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark { display: block; background: var(--hh-sc-bone); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark:first-child { transform: rotate(32deg); }
.hh-stage-door[data-door='rejected'] .hh-stage-mark:last-child { transform: rotate(-32deg); }

.hh-stage-ghosts { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
.hh-stage-ghost { position: absolute; display: block; bottom: 20%; width: clamp(48px, 22%, 96px);
  left: calc((var(--hh-i) + 1) / (var(--hh-n) + 1) * 100%); margin-left: clamp(-48px, -11%, -24px);
  transform: translateZ(calc(-0.18 * var(--hh-depth) - var(--hh-i) * 0.16 * var(--hh-depth)));
  --hh-surface-raised: var(--hh-sc-bone); --hh-glow: var(--hh-sc-ecto); }
.hh-stage-ghost .hh-ui-art-ghost { width: 100%; height: auto; color: var(--hh-sc-ink);
  filter: drop-shadow(0 0 7px var(--hh-glow)) drop-shadow(0 0 2px var(--hh-glow)); }
.hh-stage-ghost[data-ghost='working'] { --hh-glow: var(--hh-sc-paper); bottom: 24%; }
.hh-stage-ghost[data-ghost='waiting'] { --hh-glow: var(--hh-sc-lamp); }
.hh-stage-ghost[data-ghost='failed'] { --hh-glow: var(--hh-sc-cloth); bottom: 6%; }
.hh-stage-ghost[data-ghost='blocked'] { --hh-glow: var(--hh-sc-ink); bottom: 10%; }
.hh-stage-ghost[data-ghost='done'] { bottom: 28%; }
.hh-stage-ghost .hh-ui-art-check, .hh-stage-ghost .hh-ui-art-mark, .hh-stage-ghost .hh-ui-art-glow, .hh-stage-ghost .hh-ui-art-web { color: var(--hh-glow); }
.hh-stage-ghost[data-ghost='blocked'] .hh-ui-art-web { color: var(--hh-sc-bone); }

.hh-stage[data-pick], .hh-stage [data-pick] { pointer-events: auto; cursor: pointer; }
.hh-stage-ghost[data-pick]:hover .hh-ui-art-ghost { filter: drop-shadow(0 0 12px var(--hh-glow)) drop-shadow(0 0 4px var(--hh-sc-bone)); }
.hh-stage-door[data-pick]:hover { border-color: var(--hh-sc-lamp); }

.hh-stage-eyes { position: absolute; inset: 0; display: none; pointer-events: none; transform: translateZ(calc(-1 * var(--hh-depth) + 2px));
  background:
    radial-gradient(circle at 71% 34%, var(--hh-sc-lamp) 0 2px, transparent 3px),
    radial-gradient(circle at 74.5% 34%, var(--hh-sc-lamp) 0 2px, transparent 3px),
    radial-gradient(circle at 18% 58%, var(--hh-sc-ecto) 0 1.5px, transparent 2.5px),
    radial-gradient(circle at 20.5% 58%, var(--hh-sc-ecto) 0 1.5px, transparent 2.5px); }
.hh-stage[data-lit='false'] .hh-stage-eyes { display: block; }
.hh-stage-web { position: absolute; left: 0; top: 0; display: block; width: clamp(34px, 16%, 84px); aspect-ratio: 1; pointer-events: none;
  border-radius: 0 0 100% 0;
  background:
    repeating-radial-gradient(circle at 0 0, transparent 0 22%, ${tint('--hh-sc-bone', 55)} 22% 24%),
    conic-gradient(from 90deg at 0 0, ${tint('--hh-sc-bone', 55)} 0 2deg, transparent 2deg 28deg, ${tint('--hh-sc-bone', 55)} 28deg 30deg, transparent 30deg 58deg, ${tint('--hh-sc-bone', 55)} 58deg 60deg, transparent 60deg 88deg, ${tint('--hh-sc-bone', 55)} 88deg 90deg, transparent 90deg); }
.hh-stage-mist { position: absolute; left: 0; right: 0; bottom: 0; display: block; height: 26%; pointer-events: none;
  background: linear-gradient(to top, ${tint('--hh-sc-paper', 30)}, ${tint('--hh-sc-paper', 8)} 60%, transparent); }

.hh-ui { position: relative; padding: 0; gap: 0; border: 0; border-radius: 0; background: var(--hh-sc-poche); }
.hh-ui-behind { gap: 0; }
.hh-ui-behind ~ .hh-ui-behind { padding: 16px; gap: 14px; background: var(--hh-canvas); }
.hh-ui-replay-bar { margin: 10px 12px; }
.hh-ui-notes { padding: 10px 12px; }
.hh-ui-panel { width: auto; margin: 12px; border-width: 2px; border-radius: 6px; box-shadow: 0 10px 30px ${tint('--hh-sc-ink', 70)}; }
.hh-ui-panel-head h4 { font-family: var(--hh-font-serif); font-size: 1.375rem; }

.hh-ui-toolbar { padding: 10px 12px; gap: 6px 8px; }
.hh-ui-toolbar .hh-ui-mansion-name { flex: 0 1 auto; margin-right: auto; padding: 3px 12px; font-size: 1rem; line-height: 1.3;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-ui-toolbar .hh-ui-mansion-name .hh-ui-muted { display: inline; color: var(--hh-sc-ink); font-family: var(--hh-font-serif);
  font-size: 0.8125rem; font-weight: 400; }
.hh-ui-toolbar .hh-ui-needs, .hh-ui-toolbar .hh-ui-toggle, .hh-ui-toolbar .hh-ui-status > summary {
  font-family: var(--hh-font-serif); font-size: 0.875rem; font-weight: 700; color: var(--hh-sc-ink); background: var(--hh-sc-balloon);
  border: 2px solid var(--hh-sc-ink); border-radius: 999px; padding: 2px 12px; box-shadow: none; }
.hh-ui-toolbar .hh-ui-needs { background: var(--hh-sc-lamp); border-color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs svg, .hh-ui-toolbar .hh-ui-needs[data-count='0'] svg { color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs[data-count='0'] { background: var(--hh-sc-balloon); color: var(--hh-sc-ink); border-style: dashed; border-width: 2px; }
.hh-ui-toolbar .hh-ui-toggle[aria-pressed='true'] { background: var(--hh-sc-brass); border-style: double; border-width: 4px; padding: 0 10px; }
.hh-ui-toolbar [aria-disabled='true'] { color: var(--hh-sc-ink); }
.hh-ui-toolbar .hh-ui-needs:focus-visible, .hh-ui-toolbar .hh-ui-toggle:focus-visible, .hh-ui-toolbar .hh-ui-status > summary:focus-visible {
  outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }
.hh-ui-toolbar .hh-ui-reason { padding: 2px 10px; color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border-radius: 4px; }
.hh-ui-toolbar .hh-ui-status-body { color: var(--hh-text); background: var(--hh-surface); border: 2px solid var(--hh-sc-ink); }
.hh-ui-needs-list { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* The walk-in room, top to bottom: the painted room, the labels of its working things, its name plate, and the apron. */
.hh-stage-room { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'scene' 'labels' 'title' 'apron';
  min-width: 0; background: var(--hh-sc-poche); }
.hh-stage-room-title { grid-area: title; justify-self: start; margin: 10px 12px 0; padding: 2px 12px; font-size: 0.9375rem;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-stage-room-scene { grid-area: scene; position: relative; min-width: 0; width: 100%; aspect-ratio: ${SCENE_WIDTH} / ${SCENE_HEIGHT}; overflow: hidden; background: var(--hh-sc-poche); }
.hh-stage-room-scene::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 46%, transparent 52%, ${tint('--hh-sc-ink', 62)} 100%); }
.hh-stage-spots { position: absolute; inset: 0; pointer-events: none; }
/* Each spot and figure is placed by the layout table (core/guide-layout.ts), in percent of the room. */
.hh-stage-spot, .hh-stage-figure { position: absolute; display: block; pointer-events: auto; cursor: pointer; }
.hh-stage-spot:hover { background: ${tint('--hh-sc-moon', 14)}; outline: 2px solid var(--hh-sc-moon); outline-offset: -2px; border-radius: 4px; }
.hh-stage-figure .hh-paint-spectre { filter: drop-shadow(0 0 10px var(--hh-sc-ecto)); }
.hh-stage-figure[data-ghost='waiting'] .hh-paint-spectre { filter: drop-shadow(0 0 12px var(--hh-sc-lamp)); }
.hh-stage-figure[data-ghost='failed'] .hh-paint-spectre { filter: drop-shadow(0 0 10px var(--hh-sc-cloth)); }
.hh-stage-figure[data-ghost='blocked'] .hh-paint-spectre { filter: none; }
.hh-stage-figure:hover .hh-paint-spectre { filter: drop-shadow(0 0 16px var(--hh-sc-moon)); }
.hh-stage-spot[data-label]:hover::after, .hh-stage-figure[data-label]:hover::after { content: attr(data-label); position: absolute; left: 50%; bottom: 100%;
  translate: -50% -4px; padding: 2px 10px; font-family: var(--hh-font-serif); font-size: 0.8125rem; font-weight: 700; white-space: nowrap;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-stage-spot[data-spot='door']:hover::after, .hh-stage-spot[data-spot='next']:hover::after { left: auto; right: 0; translate: 0 -4px; }
.hh-stage-spot[data-spot='previous']:hover::after { left: 0; translate: 0 -4px; }

/* The labels of the working things. On a narrow page they are a plain list under the room. */
.hh-stage-labels { grid-area: labels; list-style: none; margin: 0; padding: 8px 12px 0; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.hh-stage-label { font: inherit; font-family: var(--hh-font-serif); font-size: 0.8125rem; font-weight: 700; line-height: 1.25; text-align: left;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 4px; padding: 2px 10px; cursor: pointer;
  overflow-wrap: anywhere; }
.hh-stage-label:hover { background: var(--hh-sc-brass); }
.hh-stage-label:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }

/* The apron: the Warden's balloon, the guide's settings and the Warden. None of it lies over the room. */
.hh-stage-apron { grid-area: apron; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 8px; padding: 8px 12px 12px; min-width: 0; }
${GUIDE_BALLOON_STYLES}/* The map is always on the page of a narrow layout, so there is nothing to put away there. */
.hh-stage-setting[data-map-toggle] { display: none; }
.hh-stage-settings { display: flex; flex-wrap: wrap; gap: 6px 8px; min-width: 0; }

.hh-stage-keeper { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
.hh-stage-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.hh-stage-warden { position: relative; display: block; flex: none; width: clamp(56px, 18vw, 96px); aspect-ratio: 200 / 300; }
.hh-stage-pose { margin: 0; font-family: var(--hh-font-serif); font-size: 0.8125rem; line-height: 1.3; color: var(--hh-sc-balloon); }
.hh-stage-exit { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--hh-font-serif); font-weight: 700;
  font-size: 0.8125rem; color: var(--hh-sc-ecto); background: var(--hh-sc-ink); border: 2px solid var(--hh-sc-ecto); border-radius: 3px;
  padding: 1px 12px; cursor: pointer; }
.hh-stage-exit:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }

.hh-sf-none { fill: none; }
.hh-sf-wood { fill: var(--hh-sc-wood); }
.hh-sf-wood-dark { fill: var(--hh-sc-wood-dark); }
.hh-sf-brass { fill: var(--hh-sc-brass); }
.hh-sf-cloth { fill: var(--hh-sc-cloth); }
.hh-sf-paper { fill: var(--hh-sc-paper); }
.hh-sf-bone { fill: var(--hh-sc-bone); }
.hh-sf-moon { fill: var(--hh-sc-moon); }
.hh-sf-lamp { fill: var(--hh-sc-lamp); }
.hh-sf-ecto { fill: var(--hh-sc-ecto); }
.hh-sf-ink { fill: var(--hh-sc-ink); }
.hh-sf-roof { fill: var(--hh-sc-roof); }
.hh-sf-sheet { fill: var(--hh-sc-wall-drafting); }
.hh-sf-wall-attic { fill: var(--hh-sc-wall-attic); }
.hh-sf-glass { fill: ${shade('--hh-sc-sheet-ink', 38)}; }
.hh-stage-yard-art .hh-sf-ink, .hh-stage-sky-art .hh-sf-ink { fill: var(--hh-sc-sheet-ink); }

@media (max-width: ${LINEAR_BREAKPOINT_PX}px) {
  .hh-ui { --hh-room-h: clamp(140px, 46vw, 220px); }
  .hh-ui-house { padding: 8px; }
}

@media (min-width: ${WIDE_BREAKPOINT_PX}px) {
  .hh-ui { --hh-depth: 170px; --hh-room-h: clamp(150px, 15.5vw, 230px); }
  .hh-ui-house { padding: 20px 7% 14px; perspective: 1500px; perspective-origin: 50% 46%; }
  .hh-stage-roof-art { display: block; width: 106%; margin: 0 -3% -3px; aspect-ratio: 400 / 70; }
  .hh-stage-sky-art { display: block; position: absolute; top: 6px; right: 8px; width: 30%; }
  .hh-stage-yard-art { display: block; width: 114%; margin: 0 -7%; aspect-ratio: 400 / 60; }
  .hh-stage-titleblock { display: grid; position: absolute; right: 10px; bottom: 10px; margin: 0; font-family: var(--hh-font-label);
    font-size: 0.75rem; line-height: 1.3; color: var(--hh-sc-sheet-ink); border: 1px solid var(--hh-sc-sheet-ink); background: var(--hh-sc-sheet); }
  .hh-stage-titleblock span { padding: 2px 8px; border-top: 1px solid var(--hh-sc-sheet-ink); }
  .hh-stage-titleblock span:first-child { border-top: 0; }
  .hh-ui-rooms { padding: 0; gap: 8px; border: 8px solid var(--hh-sc-poche); border-top-width: 8px; border-bottom-width: 10px; border-radius: 0 0 3px 3px;
    background: none; transform-style: preserve-3d; }
  .hh-ui-rooms::before { content: ''; position: absolute; inset: -8px; background: var(--hh-sc-poche);
    transform: translateZ(calc(-1 * var(--hh-depth) - 2px)); }
  .hh-ui-room-cell, .hh-ui-room-cell[data-locked='true'] { border-width: 0; border-radius: 0; background: none; transform-style: preserve-3d; }
  .hh-ui-room-cell[data-needs='true'] { border-top-width: 6px; }
  .hh-ui-room-cell, .hh-ui-room-cell[data-room='attic'] { grid-template-rows: minmax(var(--hh-room-h), 1fr) auto; grid-template-columns: minmax(0, 1fr); }
  .hh-ui-room-scene { height: auto; perspective: none; transform-style: preserve-3d; }
  .hh-ui-room-cell[data-room='attic'] { grid-template-rows: minmax(calc(var(--hh-room-h) * 0.8), 1fr) auto; }
  .hh-ui-room-cell[data-room='attic'] .hh-ui-room-scene { width: 100%; }
  .hh-ui-room-control .hh-ui-state[data-field='door'], .hh-ui-room-control .hh-ui-state[data-field='ghost'] {
    position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .hh-ui-view-toggle { display: inline-flex; }
  /* The room is sized as one length (--hh-scene-w), so that it and what stands under it fit one window, and so the
     Warden and the sheets laid over the room can be sized from it. How much the page has above the room
     (--hh-scene-top) and how tall the toolbar has wrapped (--hh-toolbar-h) are measured (use-stage-metrics.ts);
     the values here stand until then. The same lengths are in core/guide-layout.ts (stageFit). */
  .hh-ui { container-type: inline-size; grid-template-columns: minmax(0, 1fr); justify-items: center; --hh-scene-top: 7rem; --hh-toolbar-h: 3.4rem;
    --hh-scene-w: min(100cqw, max(${STAGE_REM.sceneMinStacked}rem, calc((100vh - var(--hh-scene-top) - ${STAGE_REM.apron}rem) * ${SCENE_W_OF_H})));
    --hh-stage-w: var(--hh-scene-w); --hh-scene-h: calc(var(--hh-scene-w) * ${SCENE_H_OF_W}); }
  .hh-ui[data-mode='replay'] { --hh-scene-top: 14rem; }
  /* The toolbar, the room and the notes sit on the house's own grid, so the open sheet can share the room's row. */
  .hh-ui > .hh-ui-behind:first-of-type { display: contents; }
  .hh-ui > .hh-ui-behind:first-of-type > * { width: var(--hh-stage-w); grid-column: 1; }
  .hh-ui-replay-bar { grid-row: 1; margin: 10px 0; }
  .hh-stage-room { grid-row: 2; }
  .hh-ui-toolbar { grid-row: 2; align-self: start; z-index: 5; }
  .hh-ui-notes { grid-row: 3; }
  .hh-ui-announcer { grid-row: 4; }
  /* The labels lie over the room, each above its object. An absolutely placed grid child is placed against its
     grid area, so the list is given the room's area: against its own, it would lie under the room, over the apron. */
  .hh-stage-labels { grid-area: scene; position: absolute; z-index: 2; left: 0; top: 0; width: var(--hh-scene-w); aspect-ratio: ${SCENE_WIDTH} / ${SCENE_HEIGHT}; padding: 0;
    display: block; pointer-events: none; }
  .hh-stage-label-place { position: absolute; padding-bottom: 4px; pointer-events: auto; }
  .hh-stage-label-place[data-anchor='centre'] { translate: -50% 0; }
  .hh-stage-label-place[data-raised='true'] { translate: -50% -1.9rem; }
  /* On a small room the labels are set a little smaller, so two that stand close (the ledger and the bell) do not touch. */
  .hh-stage-label { white-space: nowrap; font-size: clamp(0.6875rem, calc(var(--hh-scene-w) * 0.0118), 0.8125rem); padding: 1px 8px; }
  .hh-stage-setting[data-map-toggle] { display: inline-flex; }
  /* The Warden stands at the right end of the apron, twice a ghost's height: his width is WARDEN_WIDTH percent of the
     room's width, at his drawing's proportions. The apron is kept tall enough that he rises into the room only inside
     the Guide Reserve. */
  .hh-stage-apron { padding-right: calc(var(--hh-scene-w) * ${(WARDEN_WIDTH + 4) / 100}); min-height: calc(var(--hh-scene-w) * 0.085 + 4.5rem); }
  .hh-guide-balloon { grid-column: 1; grid-row: 1; align-self: start;
    max-height: max(15rem, calc(100vh - var(--hh-scene-top) - var(--hh-scene-h) - 6.5rem)); }
  .hh-guide-body { overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--hh-sc-ink) transparent; }
  .hh-stage-settings { grid-column: 1; grid-row: 2; align-self: start; }
  .hh-stage-room[data-quiet='true'] .hh-stage-settings { grid-row: 1; }
  .hh-guide-balloon::after { content: ''; position: absolute; right: -11px; bottom: 30px; width: 18px; aspect-ratio: 1; background: var(--hh-sc-balloon);
    border-top: 2px solid var(--hh-sc-ink); border-right: 2px solid var(--hh-sc-ink); transform: rotate(45deg); }
  .hh-stage-keeper { position: absolute; z-index: 3; right: calc(var(--hh-scene-w) * 0.016); bottom: 8px; width: calc(var(--hh-scene-w) * ${WARDEN_WIDTH / 100});
    display: grid; justify-items: center; gap: 3px; text-align: center; }
  .hh-stage-caption { justify-content: center; }
  .hh-stage-warden { width: 100%; }
  /* The open sheet and the map of the whole house lie over the left of the room: under the toolbar's tags, however
     many rows they take, and inside the room, so neither reaches the name plate, the balloon or the Guide Reserve. */
  .hh-ui-panel[data-mode='region'], .hh-ui > .hh-ui-behind ~ .hh-ui-behind { grid-row: 2; grid-column: 1; align-self: start; justify-self: start;
    margin: calc(var(--hh-toolbar-h) + 4px) 0 0 calc((100cqw - var(--hh-stage-w)) / 2 + var(--hh-scene-w) * ${SHEET_LEFT});
    max-height: calc(var(--hh-scene-h) - var(--hh-toolbar-h) - 1rem); min-height: 10rem; overflow-y: auto; }
  .hh-ui-panel[data-mode='region'] { z-index: 4; width: calc(var(--hh-scene-w) * ${ROOM_SHEET_WIDTH}); max-width: 54rem; }
  /* The map is laid over the room on request, and put away again. */
  .hh-ui > .hh-ui-behind ~ .hh-ui-behind { z-index: 6; width: calc(var(--hh-scene-w) * ${MAP_SHEET_WIDTH});
    border: 2px solid var(--hh-sc-ink); border-radius: 6px; box-shadow: 0 14px 40px ${tint('--hh-sc-ink', 80)}; }
  .hh-ui[data-map='closed'] > .hh-ui-behind ~ .hh-ui-behind:not(:focus-within) { position: absolute; width: 1px; height: 1px; min-height: 0; margin: -1px; padding: 0; border: 0;
    overflow: hidden; clip-path: inset(50%); }
  .hh-ui-door-control .hh-ui-door-words { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .hh-ui-house[data-view='turned'] { perspective-origin: 30% 44%; }
  .hh-ui-house[data-view='turned'] .hh-ui-rooms, .hh-ui-house[data-view='turned'] .hh-stage-roof-art { transform: rotateY(${TURNED_VIEW_DEGREES}deg); transform-origin: 50% 50%; }
}

/* A window too short for the balloon to lie under the room: the room takes the height and the Warden's balloon stands
   beside it. The shell asks for this layout where it gives the larger room (core/guide-layout.ts, stageFit). */
@media (min-width: ${WIDE_BREAKPOINT_PX}px) {
  .hh-ui[data-layout='side'] {
    --hh-fit-w: max(${STAGE_REM.sceneMinSide}rem, min(calc((100vh - var(--hh-scene-top) - ${STAGE_REM.strip}rem) * ${SCENE_W_OF_H}), calc((100vh - var(--hh-scene-top)) / ${SCENE_H_OF_W + STRIP_OF_SCENE})));
    --hh-guide-w: clamp(${STAGE_REM.guideMin}rem, calc(100cqw - ${STAGE_GUTTER_PX}px - var(--hh-fit-w)), ${STAGE_REM.guideMax}rem);
    --hh-scene-w: min(calc(100cqw - var(--hh-guide-w) - ${STAGE_GUTTER_PX}px), var(--hh-fit-w));
    --hh-stage-w: calc(var(--hh-scene-w) + var(--hh-guide-w) + ${STAGE_GUTTER_PX}px); }
  /* The tags of the toolbar stay over the room; the balloon's column is its own. */
  .hh-ui[data-layout='side'] > .hh-ui-behind:first-of-type > .hh-ui-toolbar { width: var(--hh-scene-w); justify-self: start; margin-left: calc((100cqw - var(--hh-stage-w)) / 2); }
  /* Two columns that do not push each other. Left: the room, and under it a strip with the guide's settings. Right:
     the room's name plate, the balloon and the words beside the Warden. The first two rows are exactly as tall as
     the room, so a tall balloon grows down past the strip and never opens a gap under the room. The strip and the
     last row together are tall enough that the Warden, whose head rises into the Guide Reserve, has floor to stand on. */
  .hh-ui[data-layout='side'] .hh-stage-room { grid-template-columns: var(--hh-scene-w) var(--hh-guide-w); column-gap: ${STAGE_GUTTER_PX}px;
    grid-template-rows: 2.75rem calc(var(--hh-scene-h) - 2.75rem) minmax(calc(var(--hh-scene-w) * ${STRIP_OF_SCENE} - 2.4rem), auto) auto;
    grid-template-areas: 'scene title' 'scene balloon' 'settings balloon' '. caption'; }
  .hh-ui[data-layout='side'] .hh-stage-room-scene { align-self: start; }
  .hh-ui[data-layout='side'] .hh-stage-room-title { align-self: start; margin: 10px 0 0; }
  .hh-ui[data-layout='side'] .hh-stage-apron, .hh-ui[data-layout='side'] .hh-stage-keeper { display: contents; }
  /* The balloon rises from where he stands. It may be as tall as the window has room for; past that it scrolls inside. */
  .hh-ui[data-layout='side'] .hh-guide-balloon { grid-area: balloon; align-self: end; margin: 0 10px 0 0; max-height: max(12rem, calc(100vh - var(--hh-scene-top) - 6rem)); }
  .hh-ui[data-layout='side'] .hh-guide-balloon::after { right: auto; left: -11px; bottom: 3.5rem; border-top: 0; border-right: 0; border-left: 2px solid var(--hh-sc-ink);
    border-bottom: 2px solid var(--hh-sc-ink); }
  .hh-ui[data-layout='side'] .hh-guide-options { grid-template-columns: minmax(0, 1fr); }
  .hh-ui[data-layout='side'] .hh-stage-settings { grid-area: settings; align-self: start; margin: 10px calc(var(--hh-scene-w) * ${(WARDEN_WIDTH + 4) / 100}) 8px 12px; }
  /* He stands in the room's own corner, in front of the right end of the desk: his head at the top of the Guide Reserve. */
  .hh-ui[data-layout='side'] .hh-stage-warden { position: absolute; z-index: 3; left: calc(var(--hh-scene-w) * ${(100 - WARDEN_WIDTH - 1.2) / 100});
    top: calc(var(--hh-scene-h) * ${GUIDE_RESERVE.top / 100} + 2px); width: calc(var(--hh-scene-w) * ${WARDEN_WIDTH / 100}); }
  .hh-ui[data-layout='side'] .hh-stage-caption { grid-area: caption; align-self: end; justify-content: flex-start; margin: 6px 10px 8px 0; }
}

@keyframes hh-stage-hover { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
@keyframes hh-stage-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.72; } }
@media (prefers-reduced-motion: no-preference) {
  .hh-ui[data-motion='low-frequency'] .hh-stage-leaf { transition: transform ${DOOR_SWING_SECONDS}s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-ui-rooms, .hh-ui[data-motion='low-frequency'] .hh-stage-roof-art { transition: transform 1.4s cubic-bezier(0.3, 0.1, 0.2, 1); }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='idle'] { animation: hh-stage-hover 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='working'] { animation: hh-stage-hover 2.4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='waiting'] { animation: hh-stage-hover 3s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-ghost .hh-ui-art-ghost[data-ghost='done'] { animation: hh-stage-hover 6s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage[data-lit='true'] .hh-stage-glow { animation: hh-stage-breathe 5s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-eyes { animation: hh-stage-breathe 4s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-mist { animation: hh-stage-breathe 7s ease-in-out infinite; }
  .hh-ui[data-motion='low-frequency'] .hh-stage-figure .hh-paint-spectre { animation: hh-stage-hover 4s ease-in-out infinite; }
}
`
