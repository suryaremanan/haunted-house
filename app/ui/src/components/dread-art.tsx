// Dread and night (Spec 9): the frightening layer of the walk-in room. Every
// piece here draws a value from core/dread.ts, so it shows something true:
// moonlight where nothing happens, a candle pool where a ghost works, light
// under a door that waits, a chain and a wax seal on a sealed door, ghosts
// whose silhouette is their state. Fog, dust and rain are atmosphere only and
// lie under every control. All of it is decoration, hidden from assistive
// technology; the words for each state are on the controls and labels.
//
// Original SVG and CSS, composed for this repository.
import type { ReactNode } from 'react'
import type { DreadEffects, RoomLight } from '../core/dread'
import type { PresentationDoorState, PresentationGhostState } from '../core/house-registry'
import { Svg } from './house-art'
import type { SpectreRole } from './room-paint'

const p = (name: string) => `hh-p-${name}`

/** Where the waiting door's light leaks out: under the right-hand door, or the one in the back wall. */
export type LeakAt = 'side' | 'back' | null

/** The light of the room, over the painting and under everything that can be pressed. */
export function StateLight({ light, leakAt, effects }: { light: RoomLight; leakAt: LeakAt; effects: DreadEffects }) {
  if (!effects.stateLight) return null
  return (
    <span className="hh-dread-light" data-light={light} aria-hidden="true">
      <span className="hh-dread-moon" />
      {light === 'candle' ? <span className="hh-dread-candle" /> : null}
      {light === 'leak' && leakAt !== null ? <span className="hh-dread-leak" data-at={leakAt} /> : null}
    </span>
  )
}

/** Fog on the floor, dust in the air, rain on the glass. Never above a control; never takes a pointer. */
export function Atmosphere({ effects }: { effects: DreadEffects }) {
  if (!effects.fog && !effects.dust && !effects.rain) return null
  return (
    <span className="hh-dread-air" aria-hidden="true">
      {effects.rain ? <span className="hh-dread-rain" /> : null}
      {effects.fog ? <span className="hh-dread-fog" /> : null}
      {effects.dust ? (
        <Svg viewBox="0 0 1200 750" className="hh-dread-dust" preserveAspectRatio="none">
          {DUST.map(([x, y, r], index) => (
            <circle key={index} className={p('moon')} cx={x} cy={y} r={r} opacity={0.35} />
          ))}
        </Svg>
      ) : null}
    </span>
  )
}

// Fixed motes, placed once by hand: no randomness, so live and replay draw the same.
const DUST: readonly (readonly [number, number, number])[] = [
  [140, 210, 1.6], [260, 330, 1.2], [390, 160, 1.4], [455, 420, 1], [530, 260, 1.8], [610, 380, 1.1], [700, 190, 1.3],
  [780, 300, 1.5], [860, 440, 1], [930, 230, 1.2], [1010, 350, 1.6], [1080, 180, 1], [320, 480, 1.2], [680, 470, 1.4],
]

/** The Warden's shadow, stretched across the floor toward the room when something needs the Visitor. */
export function WardenShadow({ stance }: { stance: 'edge' | 'forward' | 'holding' }) {
  if (stance === 'edge') return null
  return <span className="hh-dread-shadow" data-stance={stance} aria-hidden="true" />
}

// ---------------------------------------------------------------------------
// Door bindings: drawn in the painting's own 1200 by 750 coordinates.

/** A sealed door is chained and sealed in red wax; an open one shows the seal broken and the chain fallen. */
export function DoorBinding({ where, state }: { where: 'side' | 'back'; state: PresentationDoorState }) {
  if (state !== 'sealed' && state !== 'open' && state !== 'waiting') return null
  const seal = where === 'side' ? { x: 1118, y: 388 } : { x: 910, y: 412 }
  const span = where === 'side' ? { left: 1068, right: 1170, top: 300, bottom: 470 } : { left: 842, right: 978, top: 318, bottom: 488 }
  if (state === 'open') {
    // The chain lies on the floor and the seal is in two halves.
    const floorY = where === 'side' ? 612 : 530
    return (
      <g data-binding="broken">
        <Links from={[seal.x - 70, floorY]} to={[seal.x + 30, floorY + 8]} />
        <path className={p('cloth-d')} d={`M${seal.x - 34} ${floorY - 6} a12 12 0 0 1 12 -12 l4 14 Z`} />
        <path className={p('cloth-d')} d={`M${seal.x - 14} ${floorY - 4} l6 -12 a12 12 0 0 1 10 14 Z`} />
      </g>
    )
  }
  return (
    <g data-binding={state === 'waiting' ? 'straining' : 'sealed'}>
      <Links from={[span.left, span.top]} to={[span.right, span.bottom]} />
      <Links from={[span.right, span.top]} to={[span.left, span.bottom]} />
      <circle className={p('cloth-d')} cx={seal.x} cy={seal.y} r={19} />
      <circle className={p('cloth')} cx={seal.x} cy={seal.y} r={14} />
      <circle className={p('cloth-d')} cx={seal.x} cy={seal.y} r={6} />
      <path className={p('cloth-d')} d={`M${seal.x - 4} ${seal.y + 16} l-6 18 l8 -4 Z M${seal.x + 6} ${seal.y + 16} l4 16 l4 -10 Z`} />
    </g>
  )
}

function Links({ from, to }: { from: readonly [number, number]; to: readonly [number, number] }) {
  const count = 9
  const links: ReactNode[] = []
  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const x = from[0] + (to[0] - from[0]) * t
    const y = from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * 10
    links.push(<ellipse key={index} className={p('stone')} cx={x} cy={y} rx={index % 2 === 0 ? 8 : 4} ry={index % 2 === 0 ? 4 : 7} />)
  }
  return <g>{links}</g>
}

// ---------------------------------------------------------------------------
// The ghosts, without the cuteness: tall, half-seen shapes in torn shrouds,
// with long reaching hands, dark eye sockets and an open mouth. No smile, no
// prop. Each state keeps a silhouette of its own; the text label stays beside it.

/** The shroud: a hooded head, narrow shoulders, and a torn hem that hangs in tatters. */
const SHROUD =
  'M50 0 C33 0 24 16 23 36 C22 52 18 62 14 78 C10 98 12 126 8 160 L16 150 L19 172 L27 154 L32 182 L40 158 L46 186 L52 160 L58 184 L64 156 L70 178 L74 152 L82 170 L86 150 L92 160 C88 126 90 98 86 78 C82 62 78 52 77 36 C76 16 67 0 50 0 Z'
/** The side turned from the light. */
const SHROUD_SHADE = 'M50 0 C67 0 76 16 77 36 C78 52 82 62 86 78 C90 98 88 126 92 160 L86 150 L82 170 L76 154 C78 120 72 84 66 56 C62 30 58 10 50 0 Z'
/** Wisps that trail below the hem, fainter the further they reach. */
const WISPS = 'M18 160 C16 176 10 186 4 196 C14 190 20 180 24 168 Z M44 182 C44 194 40 204 34 214 C44 206 50 196 50 184 Z M70 176 C72 190 78 200 86 208 C80 196 76 186 76 172 Z'
/** Long hands reaching forward from the shroud. */
const HANDS = 'M18 74 C8 84 0 96 -8 108 L-12 118 L-6 112 L-8 122 L-2 114 L0 124 L4 112 C8 100 16 90 24 84 Z M82 74 C92 84 100 96 108 108 L112 118 L106 112 L108 122 L102 114 L100 124 L96 112 C92 100 84 90 76 84 Z'

const p2 = (name: string) => `hh-p-${name}`

const SOCKETS = (
  <>
    <path className={p2('ink')} d="M34 30 C30 36 31 50 37 54 C43 50 44 36 40 30 Z" />
    <path className={p2('ink')} d="M60 30 C56 36 57 50 63 54 C69 50 70 36 66 30 Z" />
  </>
)

const HOLLOW_FACE: Readonly<Record<PresentationGhostState, ReactNode>> = {
  // Still, head bowed: two dark sockets and a closed seam of a mouth.
  idle: (
    <>
      {SOCKETS}
      <path className={p2('ink')} d="M42 66 h16 v2 h-16 Z" />
    </>
  ),
  // Bent to its work: sockets with a faint light in them, one hand at the page.
  working: (
    <>
      {SOCKETS}
      <circle className={p2('lamp')} cx={37} cy={44} r={1.6} />
      <circle className={p2('lamp')} cx={63} cy={44} r={1.6} />
      <ellipse className={p2('ink')} cx={50} cy={68} rx={3} ry={4} />
    </>
  ),
  // Turned to stare out at you, mouth open, the light in its sockets bright.
  waiting: (
    <>
      <path className={p2('ink')} d="M32 26 C27 34 28 52 36 58 C44 52 45 34 40 26 Z" />
      <path className={p2('ink')} d="M60 26 C55 34 56 52 64 58 C72 52 73 34 68 26 Z" />
      <circle className={p2('lamp')} cx={36} cy={44} r={2.6} />
      <circle className={p2('lamp')} cx={64} cy={44} r={2.6} />
      <path className={p2('ink')} d="M44 64 C42 74 44 88 50 92 C56 88 58 74 56 64 Z" />
    </>
  ),
  // Straining back against a chain staked to the floor.
  blocked: (
    <>
      {SOCKETS}
      <path className={p2('ink')} d="M44 64 C43 70 45 76 50 78 C55 76 57 70 56 64 Z" />
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <ellipse key={index} className={p2('stone')} cx={30 - index * 5} cy={100 + index * 11} rx={index % 2 === 0 ? 5 : 3} ry={index % 2 === 0 ? 3 : 5} />
      ))}
      <path className={p2('stone')} d="M16 96 H84 v6 H16 Z" />
    </>
  ),
  // Burnt through: only the outline is left, and the sockets.
  failed: SOCKETS,
  // Fading: a faint glow where it was.
  done: (
    <>
      <path className={p2('ink')} d="M36 40 h6 v2 h-6 Z M58 40 h6 v2 h-6 Z" opacity={0.6} />
    </>
  ),
  not_applicable: null,
  unavailable: null,
}

const HOLLOW_POSE: Readonly<Partial<Record<PresentationGhostState, string>>> = {
  idle: 'rotate(5 50 180)',
  working: 'rotate(12 50 180)',
  blocked: 'rotate(-14 50 180)',
}

/** A ghost of the house at Eerie and Dread. The text label beside it names its state. */
export function HollowSpectre({ state, role = 'plain' }: { state: PresentationGhostState; role?: SpectreRole }) {
  const absent = state === 'not_applicable' || state === 'unavailable'
  const body = state === 'failed' ? p2('scorch') : state === 'done' || absent ? p2('ghost-faint') : state === 'blocked' ? p2('ghost-d') : p2('ghost')
  const reaching = state === 'waiting' || state === 'working' || state === 'blocked'
  return (
    <Svg viewBox="-24 -10 148 230" className="hh-paint hh-paint-spectre hh-paint-hollow" data={{ 'data-ghost': state, 'data-role': role, 'data-hollow': 'true' }}>
      <g stroke="none" transform={HOLLOW_POSE[state]}>
        {state === 'done' ? <ellipse className={p2('ecto-glow')} cx={50} cy={100} rx={60} ry={100} /> : null}
        {state === 'failed' || state === 'done' || absent ? null : <path className={p2('ghost-faint')} d={WISPS} />}
        <path className={body} d={SHROUD} opacity={state === 'failed' || state === 'done' ? 1 : 0.88} />
        {absent || state === 'failed' || state === 'done' ? null : <path className={p2('ghost-d')} d={SHROUD_SHADE} opacity={0.7} />}
        {reaching ? <path className={p2(state === 'blocked' ? 'ghost-d' : 'ghost')} d={HANDS} opacity={0.85} /> : null}
        {state === 'failed' ? <path className={p2('ink')} d={SHROUD} opacity={0.5} transform="translate(50 90) scale(0.86) translate(-50 -90)" /> : null}
        {HOLLOW_FACE[state]}
      </g>
    </Svg>
  )
}

/** Released: the chain drops and the ghost flees the Warden, up and out of the room. Played once, then gone. */
export function FleeingGhost() {
  return (
    <span className="hh-dread-flee" data-aftermath="released" aria-hidden="true">
      <HollowSpectre state="working" />
    </span>
  )
}
