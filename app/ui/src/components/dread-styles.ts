// The sheet of dread and night (Spec 9). Light is status: the darkness, the
// candle pool and the light under a waiting door are drawn here from the
// `data-light` value core/dread.ts gives. Atmosphere (fog, dust, rain) lies
// under every control and takes no pointer. Only `transform` and `opacity`
// move, nothing faster than once every two seconds, and only while the house
// may move and the Fright level is not Calm.
const veil = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`
const night = (percent: number) => `color-mix(in srgb, var(--hh-sc-night1) ${percent}%, black)`

const DREAD = `.hh-ui:is([data-fright='eerie'], [data-fright='dread'])`

const wood = (percent: number) => `color-mix(in srgb, var(--hh-sc-wood-dark) ${percent}%, black)`
const brass = (percent: number) => `color-mix(in srgb, var(--hh-sc-brass) ${percent}%, black)`

export const DREAD_STYLES = `
/* The séance board: the replay bar is a board of dark wood with a brass rim; the scrubber is its track, one mark for
   each recorded event (--hh-marks), and the thumb is a planchette with a window. The native range input, its label
   and its value text stay as they are. */
.hh-ui-replay-bar { font-family: var(--hh-font-serif); color: var(--hh-sc-slate-ink);
  background: radial-gradient(ellipse 70% 120% at 50% 0%, ${wood(60)} 0%, ${wood(30)} 100%);
  border: 2px solid ${brass(60)}; border-radius: 12px; box-shadow: inset 0 0 0 3px ${wood(22)}, 0 12px 30px ${veil('--hh-sc-poche', 80)}; }
.hh-ui-replay-bar .hh-ui-note, .hh-ui-replay-bar .hh-ui-replay-speed legend { color: var(--hh-sc-slate-ink); }
.hh-ui-replay-bar .hh-ui-button { font-family: var(--hh-font-serif); color: var(--hh-sc-slate-ink); background: ${wood(36)}; border: 2px solid ${brass(70)}; }
.hh-ui-replay-bar .hh-ui-button[data-variant='primary'] { color: var(--hh-sc-ink); background: var(--hh-sc-brass); border-color: var(--hh-sc-ink); }
.hh-ui-replay-range { appearance: none; -webkit-appearance: none; height: 34px; background: transparent; cursor: pointer; }
.hh-ui-replay-range::-webkit-slider-runnable-track { height: 22px; border-radius: 11px; border: 1px solid ${brass(70)};
  background: repeating-linear-gradient(90deg, ${brass(80)} 0 1px, transparent 1px calc(100% / var(--hh-marks, 1))), linear-gradient(180deg, ${wood(28)}, ${wood(48)}); }
.hh-ui-replay-range::-moz-range-track { height: 22px; border-radius: 11px; border: 1px solid ${brass(70)};
  background: repeating-linear-gradient(90deg, ${brass(80)} 0 1px, transparent 1px calc(100% / var(--hh-marks, 1))), linear-gradient(180deg, ${wood(28)}, ${wood(48)}); }
.hh-ui-replay-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 34px; margin-top: -7px; border: 0;
  clip-path: polygon(50% 0%, 96% 62%, 78% 100%, 22% 100%, 4% 62%);
  background: radial-gradient(circle at 50% 60%, ${wood(30)} 0 5px, var(--hh-sc-brass) 5.5px 8px, var(--hh-sc-bone) 8.5px); }
.hh-ui-replay-range::-moz-range-thumb { width: 30px; height: 34px; border: 0; border-radius: 0;
  clip-path: polygon(50% 0%, 96% 62%, 78% 100%, 22% 100%, 4% 62%);
  background: radial-gradient(circle at 50% 60%, ${wood(30)} 0 5px, var(--hh-sc-brass) 5.5px 8px, var(--hh-sc-bone) 8.5px); }
.hh-ui-replay-range:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 3px; border-radius: 12px; }
/* The map's windows from outside: lit where a ghost works, dark where nothing happens, red where something is held. */
.hh-ui-room-scene { position: relative; }
.hh-ui-window { position: absolute; z-index: 2; right: 8%; top: 10%; width: 9%; min-width: 12px; aspect-ratio: 2 / 3; border-radius: 50% 50% 2px 2px / 30% 30% 2px 2px;
  border: 2px solid ${wood(30)}; background: ${night(80)}; pointer-events: none; }
.hh-ui-window[data-glow='lit'] { background: var(--hh-sc-lamp); box-shadow: 0 0 14px ${veil('--hh-sc-lamp', 80)}; }
.hh-ui-window[data-glow='held'] { background: var(--hh-sc-cloth); box-shadow: 0 0 18px var(--hh-sc-cloth), 0 0 4px var(--hh-sc-lamp); }
/* The heading is a brass plate engraved with the house's name. */
.hh-status[data-compact='true'] h1 { display: inline-block; padding: 2px 16px 4px; font-size: 1.5rem; letter-spacing: 0.02em; color: var(--hh-sc-slate-ink);
  background: linear-gradient(180deg, ${wood(46)}, ${wood(26)}); border: 2px solid ${brass(70)}; border-radius: 6px;
  text-shadow: 0 0 10px ${veil('--hh-sc-lamp', 55)}; box-shadow: 0 6px 18px ${veil('--hh-sc-poche', 80)}; }

.hh-stage-spots { z-index: 2; }
.hh-dread-light, .hh-dread-air { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.hh-dread-light > span, .hh-dread-air > * { position: absolute; pointer-events: none; }
/* Moonlit: nothing happens here. The room sinks into blue dark; a cold shaft falls from above. */
.hh-dread-light { mix-blend-mode: multiply; background: linear-gradient(180deg, ${veil('--hh-sc-night2', 70)} 0%, ${night(88)} 100%); opacity: 0.86; }
.hh-dread-moon { inset: 0; mix-blend-mode: screen; background: radial-gradient(ellipse 40% 70% at 50% 18%, ${veil('--hh-sc-moon', 26)} 0%, transparent 70%); }
/* Candle: a ghost works. A warm pool on the desk pushes the dark back. */
.hh-dread-light[data-light='candle'] { background: radial-gradient(ellipse 46% 52% at 34% 82%, transparent 0%, transparent 30%, ${veil('--hh-sc-night2', 64)} 62%, ${night(86)} 100%); }
.hh-dread-candle { inset: 0; mix-blend-mode: screen; background: radial-gradient(ellipse 30% 34% at 34% 82%, ${veil('--hh-sc-lamp', 46)} 0%, transparent 72%); }
/* Leak: a door waits for you. The room is dark and light spills from under the door onto the floor. */
.hh-dread-light[data-light='leak'] { opacity: 0.92; }
.hh-dread-leak { mix-blend-mode: screen; filter: blur(3px); background: radial-gradient(ellipse 50% 50% at 50% 50%, ${veil('--hh-sc-lamp', 90)} 0%, ${veil('--hh-sc-lamp', 30)} 46%, transparent 72%); }
.hh-dread-leak[data-at='side'] { left: 84%; width: 16%; top: 70%; height: 20%; }
.hh-dread-leak[data-at='back'] { left: 66%; width: 20%; top: 62%; height: 14%; }
.hh-ui[data-fright='dread'] .hh-dread-light { opacity: 0.95; }
.hh-ui[data-fright='dread'] .hh-dread-light[data-light='candle'] { opacity: 0.9; }
/* Fog on the floor, dust in the moonlight, rain on the glass. */
.hh-dread-fog { left: -10%; right: -10%; bottom: -4%; height: 34%; filter: blur(8px);
  background: radial-gradient(ellipse 60% 70% at 30% 100%, ${veil('--hh-sc-moon', 22)} 0%, transparent 70%), radial-gradient(ellipse 50% 60% at 78% 100%, ${veil('--hh-sc-moon', 18)} 0%, transparent 72%); }
.hh-dread-dust { inset: 0; width: 100%; height: 100%; }
.hh-dread-rain { inset: -20% 0 0; opacity: 0.32;
  background: repeating-linear-gradient(104deg, transparent 0 26px, ${veil('--hh-sc-moon', 40)} 26px 27px, transparent 27px 61px); }
/* The Warden's shadow reaches across the floor toward the room. */
.hh-dread-shadow { position: absolute; z-index: 1; right: 4%; bottom: 0; width: 46%; height: 16%; pointer-events: none; transform-origin: 100% 100%;
  transform: skewX(-38deg); background: radial-gradient(ellipse 100% 90% at 100% 100%, ${night(70)} 0%, ${veil('--hh-sc-night1', 40)} 52%, transparent 76%); }
.hh-dread-shadow[data-stance='holding'] { width: 64%; height: 20%; }
/* He grows with what he holds: small at the edge when nothing waits, forward and brighter-eyed when something does. */
${DREAD} .hh-stage-warden .hh-paint-warden { transform-origin: 50% 100%; }
${DREAD} .hh-stage-room[data-stance='edge'] .hh-stage-warden .hh-paint-warden { transform: scale(0.78) translateX(14%); opacity: 0.86; }
${DREAD} .hh-stage-room[data-stance='forward'] .hh-stage-warden .hh-paint-warden,
${DREAD} .hh-stage-room[data-stance='holding'] .hh-stage-warden .hh-paint-warden {
  transform: scale(1.08) translateX(-6%); filter: drop-shadow(0 0 12px var(--hh-sc-lamp)) drop-shadow(0 0 3px var(--hh-sc-night3)); }
/* The night outside the house. */
.hh-house:not([data-landing='true']) { background: radial-gradient(ellipse 80% 50% at 75% -5%, ${veil('--hh-sc-night2', 55)} 0%, transparent 70%), ${night(40)}; }
@keyframes hh-dread-drift { 0%, 100% { transform: translateX(-3%); } 50% { transform: translateX(3%); } }
@keyframes hh-dread-fall { from { transform: translateY(-12%); } to { transform: translateY(0); } }
@keyframes hh-dread-motes { 0%, 100% { opacity: 0.5; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-1.5%); } }
@keyframes hh-dread-flame { 0%, 100% { opacity: 1; } 50% { opacity: 0.82; } }
@media (prefers-reduced-motion: no-preference) {
  ${DREAD}[data-motion='low-frequency'] .hh-dread-fog { animation: hh-dread-drift 24s ease-in-out infinite; }
  ${DREAD}[data-motion='low-frequency'] .hh-dread-rain { animation: hh-dread-fall 2.4s linear infinite; }
  ${DREAD}[data-motion='low-frequency'] .hh-dread-dust { animation: hh-dread-motes 9s ease-in-out infinite; }
  ${DREAD}[data-motion='low-frequency'] .hh-dread-candle { animation: hh-dread-flame 3.2s ease-in-out infinite; }
  ${DREAD}[data-motion='low-frequency'] .hh-dread-leak { animation: hh-dread-flame 4s ease-in-out infinite; }
  ${DREAD}[data-motion='low-frequency'] .hh-stage-warden .hh-paint-warden { transition: transform 1.6s cubic-bezier(0.3, 0.1, 0.2, 1); }
}
`
