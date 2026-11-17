// The paint box of the painted rooms: one class per flat color. Each is a
// Scene Palette token, or a lighter or darker mix of one, so the paintings
// carry no color of their own. `--hh-w` is the wall color of the room on show.
const dark = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, black)`
const light = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, white)`
const veil = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`

const FILLS: Readonly<Record<string, string>> = {
  wall: 'var(--hh-w)',
  'wall-l': light('--hh-w', 78),
  'wall-d': dark('--hh-w', 72),
  'wall-dd': dark('--hh-w', 50),
  ceil: dark('--hh-w', 34),
  side: dark('--hh-w', 64),
  'side-d': dark('--hh-w', 48),
  wood: 'var(--hh-sc-wood)',
  'wood-l': light('--hh-sc-wood', 74),
  'wood-d': 'var(--hh-sc-wood-dark)',
  'wood-dd': dark('--hh-sc-wood-dark', 56),
  floor: 'var(--hh-sc-floor)',
  tile: 'var(--hh-sc-tile)',
  brass: 'var(--hh-sc-brass)',
  'brass-l': light('--hh-sc-brass', 60),
  'brass-d': dark('--hh-sc-brass', 62),
  cloth: 'var(--hh-sc-cloth)',
  'cloth-d': dark('--hh-sc-cloth', 62),
  paper: 'var(--hh-sc-paper)',
  'paper-d': dark('--hh-sc-paper', 78),
  bone: 'var(--hh-sc-bone)',
  'bone-d': dark('--hh-sc-bone', 76),
  ink: 'var(--hh-sc-ink)',
  moon: 'var(--hh-sc-moon)',
  'moon-d': dark('--hh-sc-moon', 84),
  'moon-halo': veil('--hh-sc-moon', 16),
  'moon-pool': veil('--hh-sc-moon', 10),
  lamp: 'var(--hh-sc-lamp)',
  'lamp-d': dark('--hh-sc-lamp', 70),
  'lamp-glow': veil('--hh-sc-lamp', 13),
  ecto: 'var(--hh-sc-ecto)',
  'ecto-d': dark('--hh-sc-ecto', 62),
  'ecto-glow': veil('--hh-sc-ecto', 13),
  'night-1': 'var(--hh-sc-night1)',
  'night-2': 'var(--hh-sc-night2)',
  'night-3': 'var(--hh-sc-night3)',
  'night-4': 'var(--hh-sc-night4)',
  'hill-1': 'var(--hh-sc-hill1)',
  'hill-2': 'var(--hh-sc-hill2)',
  glass: dark('--hh-sc-night2', 50),
  'glass-l': veil('--hh-sc-paper', 30),
  shade: veil('--hh-sc-ink', 34),
  stone: 'var(--hh-sc-stone)',
  'stone-l': light('--hh-sc-stone', 70),
  'stone-d': dark('--hh-sc-stone', 60),
  blueprint: 'var(--hh-sc-wall-drafting)',
  leather: 'var(--hh-sc-leather)',
  ghost: 'var(--hh-sc-spectre)',
  'ghost-d': dark('--hh-sc-spectre', 80),
  'ghost-faint': veil('--hh-sc-spectre', 22),
  door: 'var(--hh-sc-front-door)',
  'door-l': light('--hh-sc-front-door', 80),
  'door-d': dark('--hh-sc-front-door', 76),
  'door-dd': dark('--hh-sc-front-door', 52),
  iron: 'var(--hh-sc-iron)',
  'iron-l': light('--hh-sc-iron', 72),
  vignette: 'transparent',
  // The Warden: a dark robe with one lit side, so he reads as a shape first.
  robe: dark('--hh-sc-night2', 62),
  'robe-l': 'var(--hh-sc-night2)',
  'robe-d': 'var(--hh-sc-night1)',
  'robe-rim': 'var(--hh-sc-night3)',
  hood: 'var(--hh-sc-iron)',
}

const LINES: Readonly<Record<string, string>> = {
  web: veil('--hh-sc-bone', 46),
  'floor-line': dark('--hh-sc-floor', 62),
  'tile-line': dark('--hh-sc-tile', 58),
  paper: 'var(--hh-sc-paper)',
  'night-2': 'var(--hh-sc-night2)',
  'wood-dd': dark('--hh-sc-wood-dark', 56),
  'brass-d': dark('--hh-sc-brass', 62),
  'ink-soft': veil('--hh-sc-ink', 50),
  brass: 'var(--hh-sc-brass)',
  chain: light('--hh-sc-stone', 62),
}

export const PAINT_FILL_NAMES = Object.keys(FILLS)
export const PAINT_LINE_NAMES = Object.keys(LINES)

export const ROOM_PAINT_STYLES = `
.hh-paint { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
.hh-paint[data-scene='foyer'], .hh-paint { --hh-w: var(--hh-sc-wall-foyer); }
.hh-paint[data-scene='study'] { --hh-w: var(--hh-sc-wall-study); }
.hh-paint[data-scene='drafting-room'] { --hh-w: var(--hh-sc-wall-drafting); }
.hh-paint[data-scene='workshop'] { --hh-w: var(--hh-sc-wall-workshop); }
.hh-paint[data-scene='attic'] { --hh-w: var(--hh-sc-wall-attic); }
.hh-paint[data-scene='seance-room'] { --hh-w: var(--hh-sc-wall-seance); }
${Object.entries(FILLS)
  .map(([name, color]) => `.hh-p-${name} { fill: ${color}; }`)
  .join('\n')}
${Object.entries(LINES)
  .map(([name, color]) => `.hh-ps-${name} { fill: none; stroke: ${color}; }`)
  .join('\n')}
/* The Warden is told from the dark behind him by the light at his edge. */
.hh-paint-warden { filter: drop-shadow(0 0 9px var(--hh-sc-night3)) drop-shadow(0 0 2px var(--hh-sc-night3)); }
`
