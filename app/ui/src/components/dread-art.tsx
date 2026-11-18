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
// The ghosts, without the cuteness: long torn sheets with hollow eyes. Each
// state keeps a silhouette of its own; the text label stays beside it.

const HOLLOW_BODY =
  'M50 2 C30 2 20 22 20 48 C20 78 24 104 18 136 L26 128 L30 146 L38 132 L44 150 L50 134 L57 152 L62 132 L70 148 L74 128 L82 140 C76 108 80 78 80 48 C80 22 70 2 50 2 Z'
const HOLLOW_SHADE = 'M50 2 C70 2 80 22 80 48 C80 78 76 108 82 140 L74 128 L70 148 L64 134 C68 104 66 70 64 46 C62 24 58 8 50 2 Z'

const HOLLOW_FACE: Readonly<Record<PresentationGhostState, ReactNode>> = {
  // Head bowed; the eyes are two dark hollows.
  idle: (
    <>
      <ellipse className={p('ink')} cx={40} cy={44} rx={6} ry={8} />
      <ellipse className={p('ink')} cx={60} cy={44} rx={6} ry={8} />
    </>
  ),
  // Turned to the desk, one arm trailing to write; a pale wisp behind.
  working: (
    <>
      <ellipse className={p('ink')} cx={44} cy={42} rx={5} ry={8} />
      <ellipse className={p('ink')} cx={62} cy={42} rx={5} ry={8} />
      <path className={p('ghost-d')} d="M76 70 C92 76 104 90 108 104 L100 106 C96 94 88 84 74 80 Z" />
      <path className={p('bone-d')} d="M104 100 l10 -18 l3 2 l-9 18 Z" />
    </>
  ),
  // Facing out, staring at the Visitor: the hollows are lit from inside.
  waiting: (
    <>
      <ellipse className={p('ink')} cx={38} cy={44} rx={9} ry={12} />
      <ellipse className={p('ink')} cx={62} cy={44} rx={9} ry={12} />
      <circle className={p('lamp')} cx={38} cy={46} r={2.6} />
      <circle className={p('lamp')} cx={62} cy={46} r={2.6} />
      <ellipse className={p('ink')} cx={50} cy={74} rx={6} ry={10} />
    </>
  ),
  // Straining back against a chain to the floor.
  blocked: (
    <>
      <path className={p('ink')} d="M32 44 h14 v5 h-14 Z M54 44 h14 v5 h-14 Z" />
      <path className={p('ink')} d="M42 72 h16 v4 h-16 Z" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <ellipse key={index} className={p('stone')} cx={22 + index * 6} cy={96 + index * 9} rx={index % 2 === 0 ? 5 : 3} ry={index % 2 === 0 ? 3 : 5} />
      ))}
      <rect className={p('stone')} x={18} y={86} width={64} height={7} />
    </>
  ),
  // Only a scorched outline is left: the sheet is burnt through.
  failed: (
    <>
      <ellipse className={p('ink')} cx={40} cy={46} rx={7} ry={5} />
      <ellipse className={p('ink')} cx={60} cy={46} rx={7} ry={5} />
      <path className={p('ink')} d="M36 78 h28 v3 h-28 Z" />
    </>
  ),
  // Fading: a faint glow where it was.
  done: (
    <>
      <ellipse className={p('ink')} cx={40} cy={46} rx={4} ry={2} />
      <ellipse className={p('ink')} cx={60} cy={46} rx={4} ry={2} />
    </>
  ),
  not_applicable: null,
  unavailable: null,
}

const HOLLOW_POSE: Readonly<Partial<Record<PresentationGhostState, string>>> = {
  idle: 'rotate(4 50 140)',
  working: 'rotate(10 50 140)',
  blocked: 'rotate(-12 50 140)',
}

/** A ghost of the house at Eerie and Dread. The text label beside it names its state. */
export function HollowSpectre({ state, role = 'plain' }: { state: PresentationGhostState; role?: SpectreRole }) {
  const absent = state === 'not_applicable' || state === 'unavailable'
  const body =
    state === 'failed' ? p('scorch') : state === 'done' ? p('ghost-faint') : state === 'blocked' ? p('ghost-d') : absent ? p('ghost-faint') : p('ghost')
  return (
    <Svg viewBox="-30 -20 160 190" className="hh-paint hh-paint-spectre hh-paint-hollow" data={{ 'data-ghost': state, 'data-role': role, 'data-hollow': 'true' }}>
      <g stroke="none" transform={HOLLOW_POSE[state]}>
        {state === 'done' ? <ellipse className={p('ecto-glow')} cx={50} cy={80} rx={52} ry={78} /> : null}
        <path className={body} d={HOLLOW_BODY} />
        {absent || state === 'failed' || state === 'done' ? null : <path className={p('ghost-d')} d={HOLLOW_SHADE} />}
        {state === 'failed' ? <path className={p('ink')} d={HOLLOW_BODY} opacity={0.55} transform="translate(50 76) scale(0.86) translate(-50 -76)" /> : null}
        {HOLLOW_FACE[state]}
      </g>
    </Svg>
  )
}
