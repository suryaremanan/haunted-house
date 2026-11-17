// The painted rooms (the walk-in view): one full interior per room, drawn
// straight on in one-point perspective and filled with flat color, the way
// home software of the 1990s painted its rooms, but at night. Every shape
// was composed for this repository from rectangles, circles, ellipses and
// paths, many of them placed by the small generators below. Nothing is
// traced, copied or loaded.
//
// All of it is decoration, rendered through the one hidden wrapper of
// house-art.tsx: no name, no focus, no handler, no words. Fills come from the
// Scene Palette through the `hh-p-*` classes of house-stage-styles.ts. There
// are no outlines: form is carried by lighter and darker shapes.
import type { ReactNode } from 'react'
import type { WardenPose } from '../core/house-guide'
import type { PresentationDoorState, PresentationGhostState, RoomId } from '../core/house-registry'
import { Svg } from './house-art'

const p = (name: string) => `hh-p-${name}`
/** A line paint: no fill, stroked in the named color. */
const ps = (name: string) => `hh-ps-${name}`

/** The painting is 1200 by 750. Its vanishing point sits a little above centre. */
export const PAINT_W = 1200
export const PAINT_H = 750

/** A small repeatable generator, so shelves fill the same way on every render. */
function sequence(seed: number): () => number {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

const BOOK_PAINTS = ['cloth', 'brass', 'ecto-d', 'paper-d', 'night-2', 'cloth-d', 'wall-l', 'brass-d'] as const

/** A row of books standing on the line y + h, between x and x + w. */
function books(x: number, y: number, w: number, h: number, seed: number): ReactNode[] {
  const next = sequence(seed)
  const out: ReactNode[] = []
  let at = x + 2
  let index = 0
  while (at < x + w - 8) {
    const width = 7 + Math.round(next() * 9)
    const height = Math.round(h * (0.62 + next() * 0.36))
    const paint = BOOK_PAINTS[Math.floor(next() * BOOK_PAINTS.length)]
    // Now and then a gap, where a book is out on loan or something small is kept.
    if (next() < 0.1) {
      at += width + 6
      continue
    }
    out.push(<rect key={`b${index}`} className={p(paint)} x={at} y={y + h - height} width={width} height={height} />)
    out.push(<rect key={`s${index}`} className={p('shade')} x={at + width - 2} y={y + h - height} width={2} height={height} />)
    if (next() < 0.5) out.push(<rect key={`t${index}`} className={p('brass-l')} x={at + 1} y={y + h - height + 6} width={width - 3} height={2} />)
    at += width + 1
    index += 1
  }
  return out
}

/** A built-in bookcase with full shelves. */
function Bookcase({ x, y, w, h, seed, shelves = 4 }: { x: number; y: number; w: number; h: number; seed: number; shelves?: number }) {
  const gap = (h - 16) / shelves
  return (
    <g>
      <rect className={p('wood-d')} x={x} y={y} width={w} height={h} />
      <rect className={p('wood-dd')} x={x + 10} y={y + 10} width={w - 20} height={h - 20} />
      <rect className={p('wood-l')} x={x} y={y} width={w} height={5} />
      {Array.from({ length: shelves }, (_, row) => {
        const top = y + 10 + row * gap
        return (
          <g key={row}>
            {books(x + 12, top + 6, w - 24, gap - 14, seed + row * 31)}
            <rect className={p('wood')} x={x + 8} y={top + gap - 8} width={w - 16} height={8} />
            <rect className={p('wood-l')} x={x + 8} y={top + gap - 8} width={w - 16} height={2} />
          </g>
        )
      })}
    </g>
  )
}

/** The night outside: banded sky, a low moon, hills, a bare tree, a fence and stones. */
function NightView({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const sx = (value: number) => x + (value / 100) * w
  const sy = (value: number) => y + (value / 100) * h
  return (
    <g>
      <rect className={p('night-1')} x={x} y={y} width={w} height={h} />
      <rect className={p('night-2')} x={x} y={sy(34)} width={w} height={h * 0.2} />
      <rect className={p('night-3')} x={x} y={sy(50)} width={w} height={h * 0.14} />
      <rect className={p('night-4')} x={x} y={sy(62)} width={w} height={h * 0.1} />
      <circle className={p('moon-halo')} cx={sx(68)} cy={sy(30)} r={w * 0.2} />
      <circle className={p('moon')} cx={sx(68)} cy={sy(30)} r={w * 0.115} />
      <circle className={p('moon-d')} cx={sx(64)} cy={sy(25)} r={w * 0.022} />
      <circle className={p('moon-d')} cx={sx(72)} cy={sy(35)} r={w * 0.03} />
      <path className={p('hill-1')} d={`M${x} ${sy(70)} Q${sx(22)} ${sy(52)} ${sx(46)} ${sy(68)} T${sx(100)} ${sy(60)} V${sy(100)} H${x} Z`} />
      <path className={p('hill-2')} d={`M${x} ${sy(84)} Q${sx(30)} ${sy(70)} ${sx(58)} ${sy(84)} T${sx(100)} ${sy(78)} V${sy(100)} H${x} Z`} />
      {/* A bare tree against the sky. */}
      <path
        className={p('hill-2')}
        d={`M${sx(20)} ${sy(86)} L${sx(21)} ${sy(52)} L${sx(14)} ${sy(38)} L${sx(16)} ${sy(37)} L${sx(22)} ${sy(47)} L${sx(23)} ${sy(30)} L${sx(25)} ${sy(30)} L${sx(25)} ${sy(46)} L${sx(33)} ${sy(34)} L${sx(35)} ${sy(36)} L${sx(26)} ${sy(54)} L${sx(27)} ${sy(86)} Z`}
      />
      {/* Stones and a leaning fence on the near hill. */}
      {[44, 54, 82].map((at, index) => (
        <path key={at} className={p('hill-1')} d={`M${sx(at)} ${sy(82 - index)} v${-h * 0.07} a${w * 0.022} ${w * 0.022} 0 0 1 ${w * 0.044} 0 v${h * 0.07} Z`} />
      ))}
      {[62, 66, 70, 74].map((at) => (
        <rect key={at} className={p('hill-2')} x={sx(at)} y={sy(72)} width={w * 0.012} height={h * 0.12} />
      ))}
      <rect className={p('hill-2')} x={sx(60)} y={sy(76)} width={w * 0.17} height={h * 0.015} />
    </g>
  )
}

/** The tall window of a room: the night, its bars, and heavy curtains drawn back. */
function TallWindow({ x, y, w, h, curtains = true }: { x: number; y: number; w: number; h: number; curtains?: boolean }) {
  const bars = [1, 2, 3].map((n) => x + (w / 4) * n)
  const rails = [1, 2].map((n) => y + (h / 3) * n)
  return (
    <g>
      <rect className={p('wood-dd')} x={x - 18} y={y - 18} width={w + 36} height={h + 36} />
      <NightView x={x} y={y} w={w} h={h} />
      {bars.map((at) => (
        <rect key={at} className={p('wood-d')} x={at - 4} y={y} width={8} height={h} />
      ))}
      {rails.map((at) => (
        <rect key={at} className={p('wood-d')} x={x} y={at - 4} width={w} height={8} />
      ))}
      <rect className={p('wood')} x={x - 26} y={y + h + 12} width={w + 52} height={14} />
      <rect className={p('wood-l')} x={x - 26} y={y + h + 12} width={w + 52} height={3} />
      {/* Moonlight thrown on the floor comes from here; see the room shell. */}
      {curtains ? (
        <g>
          <rect className={p('brass-d')} x={x - 44} y={y - 36} width={w + 88} height={8} />
          {[x - 40, x + w - 30].map((left, side) => (
            <g key={left}>
              <path
                className={p('cloth')}
                d={`M${left} ${y - 30} h70 q${side === 0 ? -10 : 10} ${h * 0.5} ${side === 0 ? -34 : 34} ${h * 0.62} q${side === 0 ? 22 : -22} ${h * 0.2} ${side === 0 ? 10 : -10} ${h * 0.5} h${side === 0 ? -46 : -46 + 0} Z`}
              />
              <path className={p('cloth-d')} d={`M${left + 18} ${y - 30} h10 q-6 ${h * 0.6} -8 ${h * 1.1} h-8 q8 -${h * 0.5} 6 -${h * 1.1} Z`} />
              <path className={p('cloth-d')} d={`M${left + 46} ${y - 30} h8 q-4 ${h * 0.5} -12 ${h * 0.7} h-6 q10 -${h * 0.3} 10 -${h * 0.7} Z`} />
            </g>
          ))}
          <rect className={p('brass')} x={x - 46} y={y + h * 0.56} width={26} height={8} />
          <rect className={p('brass')} x={x + w + 20} y={y + h * 0.56} width={26} height={8} />
        </g>
      ) : null}
    </g>
  )
}

/** A long-case clock. */
function LongClock({ x, y, h }: { x: number; y: number; h: number }) {
  const w = h * 0.26
  return (
    <g>
      <path className={p('wood-d')} d={`M${x} ${y + h} V${y + h * 0.12} q${w / 2} ${-h * 0.14} ${w} 0 V${y + h} Z`} />
      <rect className={p('wood-dd')} x={x + w * 0.16} y={y + h * 0.34} width={w * 0.68} height={h * 0.5} />
      <rect className={p('glass')} x={x + w * 0.22} y={y + h * 0.36} width={w * 0.56} height={h * 0.46} />
      <rect className={p('brass-d')} x={x + w * 0.47} y={y + h * 0.36} width={w * 0.06} height={h * 0.3} />
      <circle className={p('brass')} cx={x + w * 0.5} cy={y + h * 0.7} r={w * 0.16} />
      <circle className={p('brass-l')} cx={x + w * 0.45} cy={y + h * 0.685} r={w * 0.05} />
      <circle className={p('brass-d')} cx={x + w * 0.5} cy={y + h * 0.2} r={w * 0.4} />
      <circle className={p('bone')} cx={x + w * 0.5} cy={y + h * 0.2} r={w * 0.33} />
      <path className={p('ink')} d={`M${x + w * 0.48} ${y + h * 0.2} v${-h * 0.065} h${w * 0.04} v${h * 0.065} l${w * 0.2} ${h * 0.03} l${-w * 0.02} ${h * 0.012} Z`} />
      <rect className={p('wood')} x={x - 6} y={y + h - 14} width={w + 12} height={14} />
      <rect className={p('wood-l')} x={x - 6} y={y + h - 14} width={w + 12} height={3} />
      <rect className={p('shade')} x={x + w * 0.82} y={y + h * 0.14} width={w * 0.18} height={h * 0.86} />
    </g>
  )
}

/** A stone hearth with a cold green fire. */
function Hearth({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect className={p('stone')} x={x} y={y + h * 0.16} width={w} height={h * 0.84} />
      <rect className={p('stone-l')} x={x - 12} y={y} width={w + 24} height={h * 0.16} />
      <rect className={p('stone-d')} x={x - 12} y={y + h * 0.13} width={w + 24} height={h * 0.04} />
      <path className={p('ink')} d={`M${x + w * 0.16} ${y + h} V${y + h * 0.5} q${w * 0.34} ${-h * 0.22} ${w * 0.68} 0 V${y + h} Z`} />
      <ellipse className={p('ecto-glow')} cx={x + w * 0.5} cy={y + h * 0.86} rx={w * 0.3} ry={h * 0.2} />
      <path
        className={p('ecto-d')}
        d={`M${x + w * 0.3} ${y + h * 0.97} q${-w * 0.04} ${-h * 0.2} ${w * 0.06} ${-h * 0.3} q${w * 0.02} ${h * 0.1} ${w * 0.08} ${h * 0.06} q${-w * 0.02} ${-h * 0.18} ${w * 0.08} ${-h * 0.26} q${w * 0.04} ${h * 0.16} ${w * 0.1} ${h * 0.2} q${w * 0.06} ${-h * 0.04} ${w * 0.04} ${-h * 0.14} q${w * 0.1} ${h * 0.14} ${w * 0.06} ${h * 0.44} Z`}
      />
      <path
        className={p('ecto')}
        d={`M${x + w * 0.4} ${y + h * 0.97} q${-w * 0.03} ${-h * 0.14} ${w * 0.05} ${-h * 0.2} q${w * 0.02} ${h * 0.06} ${w * 0.06} ${h * 0.02} q${0} ${-h * 0.1} ${w * 0.05} ${-h * 0.14} q${w * 0.07} ${h * 0.12} ${w * 0.04} ${h * 0.32} Z`}
      />
      <rect className={p('wood-dd')} x={x + w * 0.24} y={y + h * 0.94} width={w * 0.52} height={h * 0.06} />
      {[0.08, 0.3, 0.52, 0.74].map((at, index) => (
        <rect key={at} className={p('stone-d')} x={x + w * at} y={y + h * (index % 2 === 0 ? 0.3 : 0.24)} width={w * 0.16} height={3} />
      ))}
    </g>
  )
}

/** A gilt-framed portrait whose sitter has long since faded to a pale shape. */
function Portrait({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect className={p('brass-d')} x={x} y={y} width={w} height={h} />
      <rect className={p('brass')} x={x + 4} y={y + 4} width={w - 8} height={h - 8} />
      <rect className={p('night-1')} x={x + 11} y={y + 11} width={w - 22} height={h - 22} />
      <ellipse className={p('paper-d')} cx={x + w * 0.5} cy={y + h * 0.42} rx={w * 0.15} ry={h * 0.16} />
      <path className={p('cloth-d')} d={`M${x + 11} ${y + h - 11} q${w * 0.39 - 11} ${-h * 0.5} ${w - 22} 0 Z`} />
      <ellipse className={p('ink')} cx={x + w * 0.44} cy={y + h * 0.41} rx={w * 0.03} ry={h * 0.035} />
      <ellipse className={p('ink')} cx={x + w * 0.56} cy={y + h * 0.41} rx={w * 0.03} ry={h * 0.035} />
    </g>
  )
}

/** A wall sconce with a lit candle and its pool of light. */
function Sconce({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className={p('lamp-glow')} cx={x} cy={y - 20} r={70} />
      <path className={p('brass-d')} d={`M${x - 16} ${y + 12} h32 l-6 12 h-20 Z`} />
      <rect className={p('bone')} x={x - 6} y={y - 14} width={12} height={26} />
      <path className={p('lamp')} d={`M${x} ${y - 44} q11 16 0 28 q-11 -12 0 -28 Z`} />
      <path className={p('moon')} d={`M${x} ${y - 34} q5 9 0 16 q-5 -7 0 -16 Z`} />
    </g>
  )
}

/** An iron chandelier on its chain. */
function Chandelier({ x }: { x: number }) {
  return (
    <g>
      <rect className={p('ink')} x={x - 2} y={0} width={4} height={96} />
      <circle className={p('lamp-glow')} cx={x} cy={130} r={150} />
      <path className={p('ink')} d={`M${x - 110} 122 q110 54 220 0 v10 q-110 54 -220 0 Z`} />
      {[-104, -52, 0, 52, 104].map((dx) => (
        <g key={dx}>
          <rect className={p('bone')} x={x + dx - 5} y={dx === 0 ? 118 : 100 + Math.abs(dx) * 0.06} width={10} height={24} />
          <path className={p('lamp')} d={`M${x + dx} ${dx === 0 ? 92 : 74 + Math.abs(dx) * 0.06} q9 14 0 24 q-9 -10 0 -24 Z`} />
        </g>
      ))}
    </g>
  )
}

/** A cobweb spun into an upper corner. `flip` puts it in the right-hand one. */
function Cobweb({ x, y, size, flip = false }: { x: number; y: number; size: number; flip?: boolean }) {
  const d = flip ? -1 : 1
  const ray = (angle: number) => {
    const rad = (angle * Math.PI) / 180
    return `M${x} ${y} l${d * Math.cos(rad) * size} ${Math.sin(rad) * size}`
  }
  const ring = (r: number) => `M${x + d * r} ${y} Q${x + d * r * 0.62} ${y + r * 0.62} ${x} ${y + r}`
  return (
    <g className={ps('web')} fill="none" strokeWidth={1.4}>
      <path d={[8, 30, 52, 74].map(ray).join(' ')} />
      <path d={[0.34, 0.6, 0.86].map((part) => ring(size * part)).join(' ')} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// The shell every room shares: ceiling, three walls, floor, and a door in
// each side wall. The left door leads back; the right one is the room's Door.

function leftWallY(x: number): { top: number; bottom: number } {
  return { top: (90 * x) / 160, bottom: 640 - (120 * x) / 160 }
}

/** The four corners of a door standing in a side wall between x1 and x2 (left wall coordinates). */
function sideDoor(x1: number, x2: number, mirror: boolean): string {
  const a = leftWallY(x1)
  const b = leftWallY(x2)
  const topA = a.bottom - (a.bottom - a.top) * 0.66
  const topB = b.bottom - (b.bottom - b.top) * 0.66
  const fx = (value: number) => (mirror ? PAINT_W - value : value)
  return `M${fx(x1)} ${topA} L${fx(x2)} ${topB} L${fx(x2)} ${b.bottom} L${fx(x1)} ${a.bottom} Z`
}

function SideDoor({ mirror, state }: { mirror: boolean; state: PresentationDoorState | 'plain' }) {
  const fx = (value: number) => (mirror ? PAINT_W - value : value)
  const open = state === 'open'
  const ajar = state === 'waiting'
  return (
    <g data-paint-door={state}>
      <path className={p('wood-dd')} d={sideDoor(30, 132, mirror)} />
      {open || ajar ? <path className={p('lamp')} d={sideDoor(38, 124, mirror)} /> : null}
      {open || ajar ? <path className={p('moon-halo')} d={sideDoor(38, 124, mirror)} /> : null}
      {open ? (
        // The leaf has swung into the room and is seen nearly edge on.
        <path className={p('wood')} d={`M${fx(124)} 232 L${fx(150)} 214 L${fx(150)} 582 L${fx(124)} 548 Z`} />
      ) : (
        <g>
          <path className={p('wood')} d={sideDoor(ajar ? 62 : 38, 124, mirror)} />
          <path className={p('wood-d')} d={`M${fx(ajar ? 74 : 56)} 290 L${fx(108)} 286 L${fx(108)} 380 L${fx(ajar ? 74 : 56)} 392 Z`} />
          <path className={p('wood-d')} d={`M${fx(ajar ? 74 : 56)} 420 L${fx(108)} 404 L${fx(108)} 528 L${fx(ajar ? 74 : 56)} 560 Z`} />
          <circle className={p('brass')} cx={fx(ajar ? 70 : 48)} cy={404} r={7} />
          <circle className={p('brass-l')} cx={fx(ajar ? 69 : 47)} cy={402} r={2.5} />
        </g>
      )}
      {state === 'sealed' ? (
        <g>
          <path className={p('ink')} d={`M${fx(30)} 380 L${fx(132)} 362 L${fx(132)} 382 L${fx(30)} 402 Z`} />
          <circle className={p('brass')} cx={fx(82)} cy={382} r={13} />
          <circle className={p('ink')} cx={fx(82)} cy={380} r={4} />
          <rect className={p('ink')} x={fx(82) - 2} y={380} width={4} height={9} />
        </g>
      ) : null}
      {state === 'rejected' ? (
        <g>
          <path className={p('bone-d')} d={`M${fx(26)} 300 L${fx(136)} 420 L${fx(136)} 442 L${fx(26)} 324 Z`} />
          <path className={p('bone')} d={`M${fx(26)} 470 L${fx(136)} 300 L${fx(136)} 324 L${fx(26)} 496 Z`} />
        </g>
      ) : null}
    </g>
  )
}

interface ShellProps {
  floor: 'planks' | 'tiles'
  beams?: boolean
  leftDoor: boolean
  rightDoor: PresentationDoorState | 'plain' | null
  children: ReactNode
}

function Shell({ floor, beams = false, leftDoor, rightDoor, children }: ShellProps) {
  const vx = 600
  const vy = 300
  // Floor lines run to the vanishing point; cross lines close up as they recede.
  const runs = Array.from({ length: 17 }, (_, index) => -400 + index * 125)
  const cross = [540, 566, 598, 640, 694]
  return (
    <>
      <path className={p('ceil')} d="M0 0 H1200 L1040 90 H160 Z" />
      <path className={p('side')} d="M0 0 L160 90 V520 L0 640 Z" />
      <path className={p('side-d')} d="M1200 0 L1040 90 V520 L1200 640 Z" />
      <rect className={p('wall')} x={160} y={90} width={880} height={430} />
      {/* Paper stripes, a picture rail, panelling and a skirting board. */}
      {Array.from({ length: 22 }, (_, index) => (
        <rect key={index} className={p('wall-l')} x={170 + index * 40} y={112} width={14} height={318} opacity={0.18} />
      ))}
      <rect className={p('wall-dd')} x={160} y={90} width={880} height={22} />
      <rect className={p('wall-l')} x={160} y={108} width={880} height={4} />
      <rect className={p('wall-d')} x={160} y={430} width={880} height={90} />
      <rect className={p('wall-l')} x={160} y={430} width={880} height={5} />
      {Array.from({ length: 8 }, (_, index) => (
        <rect key={index} className={p('wall-dd')} x={176 + index * 110} y={448} width={94} height={52} />
      ))}
      <rect className={p('wood-dd')} x={160} y={508} width={880} height={12} />
      <path className={p('wall-dd')} d="M0 484 L160 430 V520 L0 640 Z" opacity={0.55} />
      <path className={p('wall-dd')} d="M1200 484 L1040 430 V520 L1200 640 Z" opacity={0.7} />
      {/* The floor. */}
      <path className={p(floor === 'tiles' ? 'tile' : 'floor')} d="M160 520 H1040 L1200 640 V750 H0 V640 Z" />
      <g className={ps(floor === 'tiles' ? 'tile-line' : 'floor-line')} fill="none" strokeWidth={floor === 'tiles' ? 3 : 2}>
        <path d={runs.map((x) => `M${vx + ((x - vx) * (520 - vy)) / (750 - vy)} 520 L${x} 750`).join(' ')} />
        {floor === 'tiles' ? <path d={cross.map((y) => `M${160 - ((y - 520) * 160) / 120} ${y} H${1040 + ((y - 520) * 160) / 120}`).join(' ')} /> : null}
      </g>
      <path className={p('shade')} d="M160 520 H1040 L1090 558 H110 Z" opacity={0.6} />
      {beams ? (
        <g>
          <path className={p('wood-dd')} d="M0 0 H70 L250 90 H160 Z" />
          <path className={p('wood-dd')} d="M1200 0 H1130 L950 90 H1040 Z" />
          {[330, 600, 870].map((x) => (
            <path key={x} className={p('wood-dd')} d={`M${vx + (x - vx) * 1.36 - 26} 0 h52 L${x + 18} 90 h-36 Z`} />
          ))}
          <rect className={p('wood-dd')} x={160} y={90} width={880} height={30} />
          <rect className={p('wood-d')} x={160} y={116} width={880} height={5} />
        </g>
      ) : null}
      {leftDoor ? <SideDoor mirror={false} state="plain" /> : null}
      {rightDoor === null ? null : <SideDoor mirror state={rightDoor} />}
      {children}
      <Cobweb x={0} y={0} size={170} />
      <Cobweb x={1200} y={0} size={120} flip />
      {/* The corners fall away into the dark. */}
      <path className={p('vignette')} d="M0 0 H1200 V750 H0 Z" />
    </>
  )
}

/** Moonlight from the tall window, laid across the floor. */
function MoonPool() {
  return <path className={p('moon-pool')} d="M452 520 H748 L900 750 H300 Z" />
}

// ---------------------------------------------------------------------------
// Set pieces of single rooms.

function CoatStand({ x }: { x: number }) {
  return (
    <g>
      <rect className={p('wood-dd')} x={x - 4} y={230} width={8} height={300} />
      <path className={p('wood-dd')} d={`M${x - 34} 536 q34 -22 68 0 v8 h-68 Z`} />
      <path className={p('wood-dd')} d={`M${x - 4} 250 l-34 -22 l4 -6 l30 18 Z M${x + 4} 250 l34 -22 l-4 -6 l-30 18 Z`} />
      <path className={p('cloth-d')} d={`M${x + 8} 250 q40 30 34 150 q-22 14 -44 0 Z`} />
      <path className={p('ink')} d={`M${x - 50} 224 h40 l-6 -30 h-28 Z M${x - 58} 224 h56 v7 h-56 Z`} />
    </g>
  )
}

function Globe({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect className={p('wood-dd')} x={x - 5} y={y} width={10} height={92} />
      <path className={p('wood-dd')} d={`M${x - 36} ${y + 100} q36 -22 72 0 v8 h-72 Z`} />
      <circle className={p('night-3')} cx={x} cy={y - 34} r={42} />
      <path className={p('ecto-d')} d={`M${x - 26} ${y - 56} q20 -10 30 6 q-6 16 -22 10 Z M${x + 4} ${y - 26} q22 -6 26 10 q-10 18 -26 6 Z M${x - 30} ${y - 22} q10 4 8 16 q-10 2 -12 -8 Z`} />
      <path className={p('brass')} d={`M${x - 48} ${y - 34} a48 48 0 0 0 96 0 h-6 a42 42 0 0 1 -84 0 Z`} />
    </g>
  )
}

function DraftingTable({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('wood-dd')} d={`M${x + 40} ${y + 60} h14 v150 h-14 Z M${x + 210} ${y + 20} h14 v190 h-14 Z M${x + 20} ${y + 200} h230 v12 h-230 Z`} />
      <path className={p('wood')} d={`M${x} ${y + 70} L${x + 280} ${y} l8 24 L${x + 8} ${y + 96} Z`} />
      <path className={p('wood-l')} d={`M${x} ${y + 70} L${x + 280} ${y} l1.5 5 L${x + 1.5} ${y + 75} Z`} />
      <path className={p('blueprint')} d={`M${x + 40} ${y + 54} L${x + 244} ${y + 4} l7 22 L${x + 47} ${y + 76} Z`} />
      <path className={ps('paper')} fill="none" d={`M${x + 70} ${y + 56} l70 -17 M${x + 80} ${y + 66} l44 -11 M${x + 160} ${y + 30} l50 -12 l4 12 l-50 12 Z`} strokeWidth={2} />
      <path className={p('brass')} d={`M${x + 250} ${y - 6} l40 -84 l8 4 l-38 84 Z`} />
      <path className={p('lamp')} d={`M${x + 276} ${y - 104} l52 16 l-22 34 l-42 -14 Z`} />
      <path className={p('lamp-glow')} d={`M${x + 264} ${y - 70} l42 14 l-60 90 l-110 -30 Z`} />
    </g>
  )
}

function PlanChest({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect className={p('wood-d')} x={x} y={y} width={w} height={h} />
      <rect className={p('wood-l')} x={x} y={y} width={w} height={4} />
      {Array.from({ length: 6 }, (_, row) => (
        <g key={row}>
          <rect className={p('wood')} x={x + 8} y={y + 10 + row * ((h - 14) / 6)} width={w - 16} height={(h - 14) / 6 - 6} />
          <rect className={p('brass')} x={x + w / 2 - 14} y={y + 10 + row * ((h - 14) / 6) + ((h - 14) / 6 - 6) / 2 - 2} width={28} height={4} />
        </g>
      ))}
      {[0.1, 0.3, 0.52, 0.72].map((at, index) => (
        <g key={at}>
          <rect className={p(index % 2 === 0 ? 'paper' : 'blueprint')} x={x + w * at} y={y - 62 - index * 6} width={w * 0.14} height={62 + index * 6} />
          <ellipse className={p(index % 2 === 0 ? 'paper-d' : 'night-2')} cx={x + w * (at + 0.07)} cy={y - 62 - index * 6} rx={w * 0.07} ry={5} />
        </g>
      ))}
    </g>
  )
}

function PinnedPlans({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect className={p('blueprint')} x={x} y={y} width={190} height={130} />
      <g className={ps('paper')} fill="none" strokeWidth={2.5}>
        <path d={`M${x + 34} ${y + 104} V${y + 60} L${x + 82} ${y + 28} L${x + 130} ${y + 60} V${y + 104} Z M${x + 66} ${y + 104} V${y + 78} h26 v26 M${x + 104} ${y + 66} h16 v16 h-16 Z M${x + 20} ${y + 116} H${x + 170}`} />
      </g>
      <rect className={p('paper')} x={x + 26} y={y + 150} width={120} height={84} />
      <g className={ps('night-2')} fill="none" strokeWidth={2}>
        <path d={`M${x + 40} ${y + 170} h92 M${x + 40} ${y + 186} h70 M${x + 40} ${y + 202} h84 M${x + 40} ${y + 218} h50`} />
      </g>
      {[
        [x + 8, y + 8],
        [x + 182, y + 8],
        [x + 34, y + 156],
        [x + 138, y + 156],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} className={p('cloth')} cx={cx} cy={cy} r={5} />
      ))}
      <path className={p('wood')} d={`M${x + 160} ${y + 144} h56 v12 h-22 v96 h-12 v-96 h-22 Z`} />
    </g>
  )
}

function Pegboard({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect className={p('wood')} x={x} y={y} width={220} height={190} />
      <rect className={p('wood-l')} x={x} y={y} width={220} height={4} />
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 9 }, (_, column) => <circle key={`${row}-${column}`} className={p('wood-dd')} cx={x + 22 + column * 22} cy={y + 24 + row * 36} r={2.5} />),
      )}
      <path className={p('bone-d')} d={`M${x + 20} ${y + 34} h30 v22 h-11 v80 h-8 v-80 h-11 Z`} />
      <path className={p('brass-d')} d={`M${x + 70} ${y + 40} l64 22 l-6 16 l-64 -22 Z`} />
      <path className={p('wood-dd')} d={`M${x + 96} ${y + 72} l14 5 l-26 80 l-14 -5 Z`} />
      <path className={p('bone-d')} d={`M${x + 150} ${y + 34} a22 22 0 1 0 30 30 l22 70 l14 -4 l-22 -70 a22 22 0 0 0 -44 -26 Z`} />
      <path className={p('cloth')} d={`M${x + 150} ${y + 150} h52 v22 h-52 Z`} />
      <rect className={p('ink')} x={x + 160} y={y + 140} width={8} height={12} />
    </g>
  )
}

function Workbench({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('wood-dd')} d={`M${x + 24} ${y + 30} h20 v170 h-20 Z M${x + 396} ${y + 30} h20 v170 h-20 Z M${x + 44} ${y + 120} h352 v14 h-352 Z`} />
      <rect className={p('wood')} x={x} y={y} width={440} height={32} />
      <rect className={p('wood-l')} x={x} y={y} width={440} height={5} />
      <path className={p('ink')} d={`M${x + 330} ${y} v-34 h64 v34 Z M${x + 346} ${y - 34} v-22 h32 v22 Z`} />
      <rect className={p('stone-l')} x={x + 310} y={y - 66} width={104} height={8} />
      <path className={p('cloth')} d={`M${x + 60} ${y} v-46 h120 v46 Z`} />
      <rect className={p('cloth-d')} x={x + 60} y={y - 22} width={120} height={6} />
      <path className={p('brass')} d={`M${x + 96} ${y - 46} v-18 h48 v18 h-8 v-10 h-32 v10 Z`} />
      <path className={p('bone-d')} d={`M${x + 220} ${y} l52 -74 l14 10 l-46 64 Z`} />
      <rect className={p('wood-d')} x={x + 470} y={y + 110} width={96} height={90} />
      <path className={p('wood-dd')} d={`M${x + 470} ${y + 110} l96 90 h-10 l-86 -80 Z M${x + 566} ${y + 110} l-96 90 h10 l86 -80 Z`} />
    </g>
  )
}

function Jars({ x, y, w }: { x: number; y: number; w: number }) {
  const shelf = (top: number, seed: number) => {
    const next = sequence(seed)
    const out: ReactNode[] = [<rect key="s" className={p('wood')} x={x} y={top + 62} width={w} height={10} />, <rect key="l" className={p('wood-l')} x={x} y={top + 62} width={w} height={2} />]
    let at = x + 10
    let index = 0
    while (at < x + w - 34) {
      const width = 22 + Math.round(next() * 16)
      const height = 30 + Math.round(next() * 30)
      const paint = ['ecto-d', 'night-3', 'cloth-d', 'brass-d'][Math.floor(next() * 4)]
      out.push(
        <g key={index}>
          <rect className={p('glass-l')} x={at} y={top + 62 - height} width={width} height={height} />
          <rect className={p(paint)} x={at + 2} y={top + 62 - height * 0.6} width={width - 4} height={height * 0.6 - 2} />
          <rect className={p('wood-dd')} x={at - 1} y={top + 56 - height} width={width + 2} height={7} />
        </g>,
      )
      at += width + 10
      index += 1
    }
    return <g key={top}>{out}</g>
  }
  return <g>{[y, y + 86, y + 172].map((top, index) => shelf(top, 41 + index * 17))}</g>
}

function Trunks({ x, y }: { x: number; y: number }) {
  const trunk = (tx: number, ty: number, w: number, h: number, paint: string) => (
    <g key={`${tx}-${ty}`}>
      <rect className={p(paint)} x={tx} y={ty} width={w} height={h} />
      <rect className={p('shade')} x={tx} y={ty + h * 0.34} width={w} height={4} />
      <rect className={p('brass-d')} x={tx + w * 0.12} y={ty} width={10} height={h} />
      <rect className={p('brass-d')} x={tx + w * 0.82} y={ty} width={10} height={h} />
      <rect className={p('brass')} x={tx + w * 0.46} y={ty + h * 0.26} width={w * 0.08} height={h * 0.2} />
    </g>
  )
  return (
    <g>
      {trunk(x, y + 96, 210, 104, 'wood-d')}
      {trunk(x + 24, y + 22, 150, 76, 'cloth-d')}
      {trunk(x + 46, y - 30, 96, 54, 'wood')}
    </g>
  )
}

function Projector({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('lamp-glow')} d={`M${x + 96} ${y + 44} L${x + 420} ${y - 70} V${y + 190} Z`} />
      <path className={p('wood-dd')} d={`M${x + 30} ${y + 80} l-40 150 h10 l40 -150 Z M${x + 70} ${y + 80} l40 150 h-10 l-40 -150 Z M${x + 46} ${y + 80} h8 v150 h-8 Z`} />
      <rect className={p('ink')} x={x} y={y + 20} width={100} height={62} />
      <circle className={p('stone')} cx={x + 22} cy={y + 2} r={34} />
      <circle className={p('ink')} cx={x + 22} cy={y + 2} r={8} />
      <circle className={p('stone')} cx={x + 84} cy={y - 14} r={42} />
      <circle className={p('ink')} cx={x + 84} cy={y - 14} r={9} />
      {[0, 72, 144, 216, 288].map((angle) => {
        const rad = (angle * Math.PI) / 180
        return <circle key={angle} className={p('stone-d')} cx={x + 84 + Math.cos(rad) * 24} cy={y - 14 + Math.sin(rad) * 24} r={7} />
      })}
      <rect className={p('brass')} x={x + 96} y={y + 34} width={28} height={22} />
      <circle className={p('moon')} cx={x + 124} cy={y + 45} r={9} />
    </g>
  )
}

function DustSheet({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <path
        className={p('bone-d')}
        d={`M${x} ${y + h} V${y + h * 0.3} q${w * 0.1} ${-h * 0.34} ${w * 0.5} ${-h * 0.3} q${w * 0.4} ${-h * 0.04} ${w * 0.5} ${h * 0.3} V${y + h} q${-w * 0.1} ${-h * 0.05} ${-w * 0.2} 0 q${-w * 0.1} ${-h * 0.06} ${-w * 0.2} 0 q${-w * 0.1} ${-h * 0.05} ${-w * 0.2} 0 q${-w * 0.1} ${-h * 0.06} ${-w * 0.2} 0 q${-w * 0.1} ${-h * 0.05} ${-w * 0.2} 0 Z`}
      />
      <path className={p('bone')} d={`M${x + w * 0.1} ${y + h * 0.9} V${y + h * 0.34} q${w * 0.1} ${-h * 0.24} ${w * 0.3} ${-h * 0.24} q${-w * 0.14} ${h * 0.1} ${-w * 0.14} ${h * 0.8} Z`} />
      <path className={p('shade')} d={`M${x + w * 0.62} ${y + h * 0.14} q${w * 0.3} ${h * 0.06} ${w * 0.38} ${h * 0.3} V${y + h * 0.96} h${-w * 0.14} Z`} />
    </g>
  )
}

function SeanceTable({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('wood-dd')} d={`M${x - 250} ${y + 190} v-150 h26 v70 h60 v80 h-18 v-56 h-42 v56 Z M${x + 250} ${y + 190} v-150 h-26 v70 h-60 v80 h18 v-56 h42 v56 Z`} />
      <path className={p('cloth-d')} d={`M${x - 170} ${y + 30} q20 110 46 170 h248 q26 -60 46 -170 Z`} />
      <ellipse className={p('cloth')} cx={x} cy={y + 30} rx={170} ry={30} />
      <path className={p('shade')} d={`M${x - 110} ${y + 70} q8 70 22 130 h10 q-12 -60 -18 -130 Z M${x + 20} ${y + 64} h14 v136 h-14 Z M${x + 110} ${y + 70} q-8 70 -22 130 h-10 q12 -60 18 -130 Z`} />
      <circle className={p('ecto-glow')} cx={x} cy={y - 34} r={130} />
      <path className={p('brass-d')} d={`M${x - 40} ${y + 26} h80 l-12 -24 h-56 Z`} />
      <circle className={p('ecto-d')} cx={x} cy={y - 42} r={56} />
      <circle className={p('ecto')} cx={x - 8} cy={y - 50} r={42} />
      <ellipse className={p('moon')} cx={x - 22} cy={y - 66} rx={12} ry={18} />
      <rect className={p('bone')} x={x + 104} y={y - 24} width={14} height={50} />
      <path className={p('lamp')} d={`M${x + 111} ${y - 56} q10 16 0 28 q-10 -12 0 -28 Z`} />
      <rect className={p('brass-d')} x={x + 96} y={y + 22} width={30} height={8} />
    </g>
  )
}

function MoonPhases({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('cloth-d')} d="M160 112 H1040 V150 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 q-110 44 -220 0 Z" />
      <path className={p('cloth')} d="M160 112 H1040 V132 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 q-110 40 -220 0 Z" />
      {[-150, -75, 0, 75, 150].map((dx, index) => (
        <g key={dx}>
          <circle className={p('ink')} cx={x + dx} cy={y} r={26} />
          {index === 2 ? <circle className={p('moon')} cx={x + dx} cy={y} r={24} /> : null}
          {index === 1 ? <path className={p('moon')} d={`M${x + dx} ${y - 24} a24 24 0 0 1 0 48 a14 24 0 0 0 0 -48 Z`} /> : null}
          {index === 3 ? <path className={p('moon')} d={`M${x + dx} ${y - 24} a24 24 0 0 0 0 48 a14 24 0 0 1 0 -48 Z`} /> : null}
        </g>
      ))}
    </g>
  )
}

function TallMirror({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('brass-d')} d={`M${x} ${y + 300} V${y + 60} a70 70 0 0 1 140 0 V${y + 300} Z`} />
      <path className={p('night-2')} d={`M${x + 14} ${y + 286} V${y + 60} a56 56 0 0 1 112 0 V${y + 286} Z`} />
      <path className={p('night-3')} d={`M${x + 30} ${y + 286} L${x + 96} ${y + 16} l14 6 L${x + 60} ${y + 286} Z`} />
      <ellipse className={p('paper-d')} cx={x + 78} cy={y + 130} rx={20} ry={28} opacity={0.5} />
    </g>
  )
}

function FrontDoors({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={p('wood-dd')} d={`M${x - 26} ${y + 380} V${y + 110} a176 176 0 0 1 352 0 V${y + 380} Z`} />
      <path className={p('night-2')} d={`M${x} ${y + 110} a150 150 0 0 1 300 0 Z`} />
      <circle className={p('moon')} cx={x + 196} cy={y + 52} r={34} />
      <g className={ps('wood-dd')} fill="none" strokeWidth={8}>
        <path d={`M${x + 150} ${y - 36} V${y + 110} M${x + 44} ${y + 4} L${x + 150} ${y + 110} L${x + 256} ${y + 4}`} />
      </g>
      <rect className={p('wood')} x={x} y={y + 118} width={146} height={262} />
      <rect className={p('wood')} x={x + 154} y={y + 118} width={146} height={262} />
      {[x + 18, x + 172].map((left) => (
        <g key={left}>
          <rect className={p('wood-d')} x={left} y={y + 138} width={110} height={96} />
          <rect className={p('wood-d')} x={left} y={y + 252} width={110} height={110} />
        </g>
      ))}
      <circle className={p('brass')} cx={x + 134} cy={y + 252} r={8} />
      <circle className={p('brass')} cx={x + 166} cy={y + 252} r={8} />
      <rect className={p('shade')} x={x + 146} y={y + 118} width={8} height={262} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// The rooms.

export interface RoomPaintingProps {
  readonly room: RoomId
  /** The Door in the right-hand wall. Null for a room with no Door of its own. */
  readonly door: PresentationDoorState | null
  /** A second Door, set in the back wall. */
  readonly secondDoor?: PresentationDoorState | null
  /** Lamps and fire burn brighter while a ghost is at work. */
  readonly lit?: boolean
  /** Whether a room lies before this one, behind the left-hand door. */
  readonly hasPrevious: boolean
  readonly hasNext: boolean
}

function BackDoor({ state }: { state: PresentationDoorState }) {
  const open = state === 'open'
  return (
    <g data-paint-door={state}>
      <path className={p('wood-dd')} d="M836 520 V284 a74 74 0 0 1 148 0 V520 Z" />
      {open || state === 'waiting' ? <path className={p('lamp')} d="M848 520 V284 a62 62 0 0 1 124 0 V520 Z" /> : null}
      {open ? (
        <path className={p('wood')} d="M972 240 L1010 262 V546 L972 520 Z" />
      ) : (
        <g>
          <path className={p('wood')} d={state === 'waiting' ? 'M872 520 V284 a50 62 0 0 1 100 0 V520 Z' : 'M848 520 V284 a62 62 0 0 1 124 0 V520 Z'} />
          <rect className={p('wood-d')} x={886} y={300} width={70} height={84} />
          <rect className={p('wood-d')} x={886} y={404} width={70} height={96} />
          <circle className={p('brass')} cx={state === 'waiting' ? 884 : 864} cy={398} r={7} />
        </g>
      )}
      {state === 'sealed' ? (
        <g>
          <rect className={p('ink')} x={830} y={372} width={160} height={20} />
          <circle className={p('brass')} cx={910} cy={382} r={14} />
          <circle className={p('ink')} cx={910} cy={380} r={4} />
        </g>
      ) : null}
      {state === 'rejected' ? (
        <g>
          <path className={p('bone-d')} d="M826 300 L994 440 V462 L826 322 Z" />
          <path className={p('bone')} d="M826 480 L994 300 V324 L826 504 Z" />
        </g>
      ) : null}
    </g>
  )
}

function roomBody(room: RoomId, lit: boolean): ReactNode {
  switch (room) {
    case 'foyer':
      return (
        <>
          <FrontDoors x={450} y={140} />
          <LongClock x={212} y={170} h={350} />
          <Portrait x={352} y={170} w={70} h={92} />
          <Portrait x={790} y={150} w={96} h={124} />
          <Portrait x={906} y={186} w={74} h={96} />
          <Sconce x={400} y={340} />
          <Sconce x={800} y={340} />
          <CoatStand x={950} />
          <Chandelier x={600} />
          <path className={p('cloth-d')} d="M380 600 Q600 548 820 600 Q600 668 380 600 Z" />
          <path className={p('cloth')} d="M420 600 Q600 562 780 600 Q600 650 420 600 Z" />
        </>
      )
    case 'study':
      return (
        <>
          <TallWindow x={470} y={170} w={260} h={230} />
          <MoonPool />
          <Bookcase x={176} y={128} w={216} h={392} seed={7} shelves={5} />
          <Hearth x={804} y={300} w={196} h={220} />
          <Portrait x={846} y={150} w={112} h={132} />
          <Globe x={420} y={436} />
          <Sconce x={770} y={250} />
          {lit ? <circle className={p('lamp-glow')} cx={600} cy={420} r={320} /> : null}
          <path className={p('cloth-d')} d="M300 610 Q600 560 900 610 Q600 676 300 610 Z" />
        </>
      )
    case 'drafting-room':
      return (
        <>
          <TallWindow x={470} y={170} w={260} h={230} curtains={false} />
          <MoonPool />
          <PinnedPlans x={186} y={150} />
          <PlanChest x={806} y={352} w={206} h={168} />
          <Sconce x={420} y={270} />
          <DraftingTable x={300} y={400} />
          {lit ? <circle className={p('lamp-glow')} cx={560} cy={380} r={300} /> : null}
        </>
      )
    case 'workshop':
      return (
        <>
          <TallWindow x={500} y={170} w={200} h={180} curtains={false} />
          <Pegboard x={196} y={150} />
          <Jars x={770} y={140} w={250} />
          <rect className={p('ink')} x={598} y={0} width={4} height={150} />
          <path className={p('ink')} d="M560 150 h80 l24 40 h-128 Z" />
          <path className={p('lamp-glow')} d="M536 190 h128 l150 340 H386 Z" />
          <Workbench x={300} y={430} />
          {lit ? <circle className={p('lamp-glow')} cx={600} cy={420} r={320} /> : null}
        </>
      )
    case 'attic':
      return (
        <>
          <circle className={p('wood-dd')} cx={600} cy={280} r={126} />
          <g>
            <circle className={p('night-1')} cx={600} cy={280} r={108} />
            <circle className={p('moon-halo')} cx={628} cy={262} r={76} />
            <circle className={p('moon')} cx={628} cy={262} r={46} />
            <circle className={p('moon-d')} cx={614} cy={250} r={9} />
            <rect className={p('wood-dd')} x={594} y={172} width={12} height={216} />
            <rect className={p('wood-dd')} x={492} y={274} width={216} height={12} />
          </g>
          <path className={p('moon-pool')} d="M500 520 H700 L860 750 H340 Z" />
          <Trunks x={196} y={320} />
          <DustSheet x={800} y={240} w={210} h={280} />
          <Projector x={470} y={420} />
        </>
      )
    case 'seance-room':
      return (
        <>
          <MoonPhases x={600} y={216} />
          <Jars x={186} y={176} w={190} />
          <TallMirror x={846} y={196} />
          <Sconce x={420} y={300} />
          <Sconce x={780} y={300} />
          <SeanceTable x={600} y={470} />
        </>
      )
  }
}

/** The whole painted interior of one room. */
export function RoomPainting({ room, door, secondDoor = null, lit = false, hasPrevious, hasNext }: RoomPaintingProps) {
  return (
    <Svg
      viewBox={`0 0 ${PAINT_W} ${PAINT_H}`}
      className="hh-paint"
      preserveAspectRatio="xMidYMid slice"
      data={{ 'data-scene': room, 'data-lit': lit ? 'true' : 'false' }}
    >
      <g stroke="none">
        <Shell floor={room === 'foyer' || room === 'study' ? 'tiles' : 'planks'} beams={room === 'attic'} leftDoor={hasPrevious} rightDoor={door ?? (hasNext ? 'plain' : null)}>
          {roomBody(room, lit)}
          {secondDoor === null ? null : <BackDoor state={secondDoor} />}
        </Shell>
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// The desk across the front, with the things kept on it.

/** The desk and its still life, drawn on the same 1200 by 750 sheet as the room. */
export function DeskPainting() {
  return (
    <Svg viewBox={`0 0 ${PAINT_W} ${PAINT_H}`} className="hh-paint hh-paint-desk" preserveAspectRatio="xMidYMid slice">
      <g stroke="none">
        <path className={p('shade')} d="M40 640 H820 L900 750 H0 Z" opacity={0.7} />
        <path className={p('wood')} d="M60 622 H800 L880 750 H0 V690 Z" />
        <path className={p('wood-l')} d="M60 622 H800 L804 629 H56 Z" />
        <path className={p('wood-d')} d="M0 716 H858 L880 750 H0 Z" />
        {/* A green leather top, tooled in gilt. */}
        <path className={p('leather')} d="M110 640 H770 L818 706 H66 Z" />
        <g className={ps('brass-d')} fill="none" strokeWidth={2}>
          <path d="M124 648 H762 L798 698 H88 Z" />
        </g>
        {/* Candle. */}
        <ellipse className={p('lamp-glow')} cx={118} cy={610} rx={120} ry={90} />
        <path className={p('brass-d')} d="M84 668 h68 l-10 12 h-48 Z" />
        <rect className={p('bone')} x={104} y={612} width={28} height={58} />
        <path className={p('bone-d')} d="M124 612 h8 v58 h-8 Z M108 620 q-6 16 0 30 h6 q-4 -14 0 -30 Z" />
        <path className={p('lamp')} d="M118 566 q18 26 0 46 q-18 -20 0 -46 Z" />
        <path className={p('moon')} d="M118 584 q8 14 0 26 q-8 -12 0 -26 Z" />
        {/* The open ledger, a ribbon, a quill and an inkwell. */}
        <path className={p('cloth-d')} d="M190 690 L330 706 L470 688 V698 L330 716 L190 700 Z" />
        <path className={p('paper')} d="M196 686 q66 -26 134 14 q68 -40 134 -16 V640 q-66 -24 -134 16 q-68 -40 -134 -14 Z" />
        <path className={p('paper-d')} d="M330 656 v44 q30 -16 60 -22 v-44 q-30 6 -60 22 Z" opacity={0.5} />
        <g className={ps('ink-soft')} fill="none" strokeWidth={2}>
          <path d="M216 652 q46 -12 96 12 M216 664 q46 -12 96 12 M216 676 q46 -12 96 12 M350 664 q46 -24 96 -14 M350 676 q46 -24 96 -14" />
        </g>
        <path className={p('cloth')} d="M326 656 h8 v62 l-4 -6 l-4 6 Z" />
        <path className={p('bone')} d="M396 676 q40 -70 100 -96 q-8 54 -84 106 Z" />
        <path className={p('bone-d')} d="M396 676 q44 -52 100 -96 q-52 54 -90 102 Z" />
        <path className={p('ink')} d="M490 660 h44 v26 h-44 Z M498 650 h28 v10 h-28 Z" />
        <ellipse className={p('night-3')} cx={512} cy={651} rx={10} ry={3} />
        {/* The bell. */}
        <path className={p('wood-dd')} d="M560 690 h108 v10 h-108 Z" />
        <path className={p('brass')} d="M570 690 q0 -50 44 -50 q44 0 44 50 Z" />
        <path className={p('brass-l')} d="M584 684 q2 -30 22 -38 q-12 14 -12 38 Z" />
        <path className={p('brass-d')} d="M636 690 q-2 -34 -22 -50 q44 0 44 50 Z" />
        <rect className={p('brass-d')} x={608} y={628} width={12} height={14} />
        <circle className={p('brass-l')} cx={614} cy={624} r={8} />
        {/* A paperweight no one asks about. */}
        <path className={p('bone')} d="M704 692 q-20 -4 -20 -28 q0 -26 28 -26 q28 0 28 26 q0 24 -20 28 v8 h-16 Z" />
        <ellipse className={p('ink')} cx={702} cy={664} rx={6} ry={8} />
        <ellipse className={p('ink')} cx={722} cy={664} rx={6} ry={8} />
        <path className={p('ink')} d="M712 674 l4 8 h-8 Z" />
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Figures: the ghosts of a room.

export const SPECTRE_ROLES = ['plain', 'archivist', 'draughtsman', 'foreman', 'tinker', 'medium'] as const
export type SpectreRole = (typeof SPECTRE_ROLES)[number]

export function spectreRoleOf(ghostId: string): SpectreRole {
  return SPECTRE_ROLES.find((role) => role !== 'plain' && (ghostId === role || ghostId.startsWith(`${role}-`))) ?? 'plain'
}

const SPECTRE_BODY =
  'M50 6 C26 6 14 28 14 56 C14 84 20 100 15 122 C23 114 30 126 38 116 C45 128 52 114 60 122 C70 130 84 128 94 112 C81 117 76 106 80 90 C84 72 86 62 86 54 C86 28 74 6 50 6 Z'
const SPECTRE_SHADE = 'M50 6 C74 6 86 28 86 54 C86 62 84 72 80 90 C76 106 81 117 94 112 C84 128 70 130 60 122 C66 110 70 92 70 60 C70 34 64 14 50 6 Z'

const ROLE_PROP: Readonly<Record<SpectreRole, ReactNode>> = {
  plain: null,
  // A bound book under one arm.
  archivist: (
    <g>
      <rect className={p('cloth')} x={66} y={70} width={26} height={34} />
      <rect className={p('paper')} x={88} y={72} width={5} height={30} />
      <rect className={p('brass')} x={70} y={78} width={14} height={3} />
    </g>
  ),
  // A long pencil.
  draughtsman: (
    <g>
      <path className={p('brass')} d="M70 104 L92 58 l7 4 L77 108 Z" />
      <path className={p('bone-d')} d="M70 104 l2 9 l5 -5 Z" />
    </g>
  ),
  // A hard hat.
  foreman: (
    <g>
      <path className={p('lamp')} d="M22 30 q28 -34 56 0 Z" />
      <rect className={p('lamp-d')} x={16} y={28} width={70} height={7} />
    </g>
  ),
  // A spanner.
  tinker: <path className={p('stone-l')} d="M74 108 L88 68 a12 12 0 1 1 9 4 L83 110 Z" />,
  // A small star above the brow.
  medium: <path className={p('moon')} d="M50 -14 l4 9 l10 1 l-7 7 l2 10 l-9 -5 l-9 5 l2 -10 l-7 -7 l10 -1 Z" />,
}

const FACE: Readonly<Record<PresentationGhostState, ReactNode>> = {
  idle: (
    <>
      <ellipse className={p('ink')} cx={38} cy={50} rx={6} ry={3} />
      <ellipse className={p('ink')} cx={62} cy={50} rx={6} ry={3} />
    </>
  ),
  working: (
    <>
      <ellipse className={p('ink')} cx={38} cy={50} rx={6} ry={9} />
      <ellipse className={p('ink')} cx={62} cy={50} rx={6} ry={9} />
      <path className={p('moon')} d="M4 34 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z M98 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
    </>
  ),
  waiting: (
    <>
      <ellipse className={p('ink')} cx={38} cy={50} rx={6} ry={9} />
      <ellipse className={p('ink')} cx={62} cy={50} rx={6} ry={9} />
      <ellipse className={p('ink')} cx={50} cy={72} rx={5} ry={6} />
      <circle className={p('lamp-glow')} cx={6} cy={36} r={30} />
      <path className={p('ghost')} d="M16 62 L8 44 l6 -3 L24 60 Z" />
      <path className={p('brass-d')} d="M-2 22 h18 v6 h-18 Z M0 28 h14 v20 h-14 Z" />
      <rect className={p('lamp')} x={3} y={31} width={8} height={14} />
    </>
  ),
  blocked: (
    <>
      <rect className={p('ink')} x={31} y={48} width={14} height={4} />
      <rect className={p('ink')} x={55} y={48} width={14} height={4} />
      <rect className={p('ink')} x={40} y={70} width={20} height={3} />
      <path className={p('ghost-d')} d="M24 84 L76 76 l1 9 L25 93 Z M24 76 L76 84 l-1 9 L23 85 Z" />
    </>
  ),
  failed: (
    <>
      <path className={p('ink')} d="M32 44 l12 12 l-3 3 l-12 -12 Z M44 44 l3 3 l-12 12 l-3 -3 Z M56 44 l12 12 l-3 3 l-12 -12 Z M68 44 l3 3 l-12 12 l-3 -3 Z" />
      <path className={p('ink')} d="M40 76 q10 -8 20 0 l-2 3 q-8 -6 -16 0 Z" />
    </>
  ),
  done: (
    <>
      <ellipse className={p('brass')} cx={50} cy={-6} rx={24} ry={6} />
      <ellipse className={p('night-1')} cx={50} cy={-6} rx={16} ry={3} />
      <path className={p('ink')} d="M31 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z M55 52 q7 -9 14 0 l-2 2 q-5 -6 -10 0 Z" />
    </>
  ),
  not_applicable: null,
  unavailable: null,
}

const TILT: Readonly<Partial<Record<PresentationGhostState, string>>> = {
  working: 'rotate(7 50 120)',
  failed: 'rotate(-26 50 120)',
}

export interface SpectreArtProps {
  readonly state: PresentationGhostState
  readonly role?: SpectreRole
}

/** A ghost of the house: a tall pale sheet with hollow eyes, posed by its state. */
export function SpectreArt({ state, role = 'plain' }: SpectreArtProps) {
  const absent = state === 'not_applicable' || state === 'unavailable'
  return (
    <Svg viewBox="-30 -30 160 170" className="hh-paint hh-paint-spectre" data={{ 'data-ghost': state, 'data-role': role }}>
      <g stroke="none" transform={TILT[state]}>
        <path className={p(absent ? 'ghost-faint' : state === 'blocked' ? 'ghost-d' : 'ghost')} d={SPECTRE_BODY} />
        {absent ? null : <path className={p('ghost-d')} d={SPECTRE_SHADE} opacity={state === 'blocked' ? 0.4 : 1} />}
        {absent ? null : ROLE_PROP[role]}
        {FACE[state]}
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// The Warden: the guide. A tall hooded figure with two lantern eyes, a ring of
// heavy keys at his hands and a chain trailing from one cuff. He is the
// house's guardrail drawn as a person: a danger to a ghost that strays, never
// to the visitor. He does not move on his own; he only changes how he stands.
//
// The drawing is 200 by 300, so at the width `core/guide-layout.ts` gives him
// he is exactly twice as tall as a ghost of the room.

const WARDEN_BODY =
  'M110 4 C94 10 82 34 80 62 C80 74 80 82 78 88 C70 92 66 100 66 110 C64 170 62 230 56 288 L66 281 L76 294 L88 282 L100 295 L112 283 L124 295 L136 282 L148 294 L158 282 L166 290 C160 230 158 170 154 110 C154 100 150 92 142 88 C140 82 140 74 140 62 C138 34 126 10 110 4 Z'
/** The side turned from the light. */
const WARDEN_SHADE =
  'M110 4 C126 10 138 34 140 62 C140 74 140 82 142 88 C150 92 154 100 154 110 C158 170 160 230 166 290 L158 282 L148 294 L136 282 L124 295 L118 289 C122 230 124 170 122 116 C120 80 116 40 110 4 Z'
/** The edge the moon catches. */
const WARDEN_RIM = 'M110 4 C94 10 82 34 80 62 C80 74 80 82 78 88 C70 92 66 100 66 110 C64 170 62 230 56 288 L62 284 C67 230 69 170 71 112 C71 104 75 97 83 93 C85 86 85 76 85 64 C87 38 97 16 110 4 Z'
/** The dark inside the hood. */
const WARDEN_VOID = 'M110 22 C98 26 89 42 89 62 C89 78 98 88 110 88 C122 88 131 78 131 62 C131 42 122 26 110 22 Z'

type Link = readonly [x: number, y: number, turn: number]

/** The chain that hangs from his right cuff and trails along the floor. */
const WARDEN_CHAIN: readonly Link[] = [
  [144, 196, 8],
  [146, 211, -8],
  [148, 226, 8],
  [150, 241, -8],
  [152, 256, 8],
  [155, 270, -14],
  [163, 282, -52],
  [176, 289, -80],
  [190, 291, -90],
]

function Links({ at }: { at: readonly Link[] }) {
  return (
    <>
      {at.map(([x, y, turn]) => (
        <ellipse key={`${x}-${y}`} className={ps('chain')} cx={x} cy={y} rx={4} ry={8.5} strokeWidth={3} transform={`rotate(${turn} ${x} ${y})`} />
      ))}
    </>
  )
}

/** One key of the ring, hanging from (110, 221) and turned by `turn` degrees. */
function HangingKey({ turn }: { turn: number }) {
  return (
    <g transform={`rotate(${turn} 110 221)`}>
      <circle className={ps('brass')} cx={110} cy={226} r={4.5} strokeWidth={3} />
      <rect className={p('brass')} x={108} y={231} width={4} height={34} />
      <rect className={p('brass')} x={112} y={252} width={8} height={4} />
      <rect className={p('brass')} x={112} y={259} width={6} height={4} />
      <rect className={p('brass-d')} x={108} y={231} width={1.5} height={34} />
    </g>
  )
}

/** The ring of keys he keeps at his hands: the visitor's approvals. */
function KeyRing({ keys = 3 }: { keys?: number }) {
  return (
    <g>
      {[-26, 0, 24].slice(0, keys).map((turn) => (
        <HangingKey key={turn} turn={turn} />
      ))}
      <circle className={ps('brass-d')} cx={110} cy={206} r={17.5} strokeWidth={1.5} />
      <circle className={ps('brass')} cx={110} cy={206} r={15} strokeWidth={4.5} />
    </g>
  )
}

/** The right sleeve, which comes to the middle and holds the ring in every standing pose. */
function RingArm() {
  return (
    <g>
      <path className={p('robe')} d="M152 106 C154 140 148 170 134 196 C126 190 118 184 110 180 L110 168 C124 150 134 128 138 102 Z" />
      <ellipse className={p('hood')} cx={112} cy={180} rx={9} ry={7} />
      <path className={p('bone')} d="M105 185 q5 5 12 0 l0 5 q-7 5 -12 0 Z" />
    </g>
  )
}

/** The arms, which are the whole difference between the standing poses. */
const WARDEN_ARMS: Readonly<Record<Exclude<WardenPose, 'stepped-back'>, ReactNode>> = {
  // Both hands on the ring of keys.
  watching: (
    <g>
      <KeyRing />
      <RingArm />
      <path className={p('robe-l')} d="M68 106 C66 140 72 170 86 196 C94 190 102 184 110 180 L110 168 C96 150 86 128 82 102 Z" />
      <path className={p('robe-rim')} d="M68 106 C66 140 72 170 86 196 L90 193 C78 168 73 140 74 108 Z" />
      <ellipse className={p('hood')} cx={108} cy={180} rx={9} ry={7} />
      <path className={p('bone')} d="M103 185 q5 5 12 0 l0 5 q-7 5 -12 0 Z" />
    </g>
  ),
  // One arm out toward the room.
  pointing: (
    <g>
      <KeyRing />
      <RingArm />
      <path className={p('robe-l')} d="M80 100 L16 118 L18 134 C34 142 50 158 58 178 C68 162 76 144 82 128 Z" />
      <path className={p('robe-rim')} d="M80 100 L16 118 L17 124 L80 108 Z" />
      <ellipse className={p('hood')} cx={18} cy={126} rx={4} ry={8} />
      <path className={p('bone')} d="M19 120 L1 123 L1 127 L10 128 L10 133 L19 134 Z" />
    </g>
  ),
  // One key held out on the open hand.
  'offering-key': (
    <g>
      <KeyRing keys={2} />
      <RingArm />
      <circle className={p('lamp-glow')} cx={24} cy={152} r={38} />
      <circle className={p('moon-halo')} cx={24} cy={152} r={24} />
      <path className={p('robe-l')} d="M80 102 C58 112 36 132 26 156 L30 172 C44 176 60 172 72 160 C78 146 82 132 84 122 Z" />
      <path className={p('robe-rim')} d="M80 102 C58 112 36 132 26 156 L28 162 C38 138 58 120 80 110 Z" />
      <ellipse className={p('hood')} cx={29} cy={164} rx={5} ry={9} transform="rotate(-20 29 164)" />
      <path className={p('bone')} d="M4 163 L28 159 L30 167 L6 173 Z" />
      <g transform="rotate(-9 22 152)">
        <rect className={p('brass')} x={0} y={150} width={38} height={5} />
        <rect className={p('brass')} x={0} y={155} width={5} height={9} />
        <rect className={p('brass')} x={8} y={155} width={4} height={6} />
        <rect className={p('brass-l')} x={2} y={151} width={34} height={1.5} />
        <circle className={ps('brass')} cx={45} cy={152.5} r={8} strokeWidth={4.5} />
      </g>
    </g>
  ),
  // The chain drawn tight around a small ghost at his side.
  holding: (
    <g>
      <KeyRing />
      <RingArm />
      <path className={p('ghost')} d="M26 208 C12 208 5 221 5 236 C5 250 8 258 6 270 C10 266 14 272 18 267 C21 273 25 266 29 270 C34 274 42 272 48 264 C41 266 39 260 41 252 C43 243 46 238 46 234 C46 220 39 208 26 208 Z" />
      <path className={p('ghost-d')} d="M26 208 C39 208 46 220 46 234 C46 238 43 243 41 252 C39 260 41 266 48 264 C42 272 34 274 29 270 C32 262 36 250 36 234 C36 222 32 212 26 208 Z" />
      <ellipse className={p('ink')} cx={18} cy={230} rx={3} ry={4.5} />
      <ellipse className={p('ink')} cx={30} cy={230} rx={3} ry={4.5} />
      <ellipse className={p('ink')} cx={24} cy={241} rx={2.5} ry={3} />
      <path className={p('robe-l')} d="M80 102 C68 120 56 150 50 182 L64 190 C73 170 80 146 86 126 Z" />
      <path className={p('robe-rim')} d="M80 102 C68 120 56 150 50 182 L55 185 C60 154 70 126 84 108 Z" />
      <circle className={p('bone')} cx={56} cy={190} r={6} />
      <Links
        at={[
          [52, 201, 28],
          [44, 211, 46],
          [9, 251, 72],
          [20, 254, 94],
          [31, 254, 86],
          [42, 250, 108],
        ]}
      />
    </g>
  ),
}

export interface WardenArtProps {
  readonly pose: WardenPose
}

/** The Warden, standing as the moment asks. Decoration: the words beside him say the same thing. */
export function WardenArt({ pose }: WardenArtProps) {
  const away = pose === 'stepped-back'
  return (
    <Svg viewBox="0 0 200 300" className="hh-paint hh-paint-warden" data={{ 'data-pose': pose }}>
      <g stroke="none">
        <ellipse className={p('shade')} cx={110} cy={291} rx={62} ry={6} />
        {/* Stepped back: turned away, smaller and dimmer, hands out of sight. */}
        <g transform={away ? 'translate(110 292) scale(0.84) translate(-110 -292)' : undefined} opacity={away ? 0.6 : 1}>
          <path className={p('robe')} d={WARDEN_BODY} />
          <path className={p('robe-d')} d={WARDEN_SHADE} />
          <path className={p('robe-rim')} d={WARDEN_RIM} />
          <path className={p('robe-d')} opacity={0.55} d="M84 196 C82 226 80 258 76 290 L82 286 C86 258 88 226 89 198 Z M100 204 C100 234 100 262 98 291 L103 288 C105 262 105 234 104 206 Z" />
          <Links at={WARDEN_CHAIN} />
          {away ? (
            <path className={p('robe-d')} d="M110 8 C107 60 106 130 107 286 L113 286 C114 130 113 60 110 8 Z" />
          ) : (
            <>
              <path className={p('hood')} d={WARDEN_VOID} />
              <circle className={p('lamp-glow')} cx={100} cy={57} r={13} />
              <circle className={p('lamp-glow')} cx={120} cy={57} r={13} />
              <path className={p('lamp')} d="M93 52 L108 58 L106 62.5 L94 57.5 Z M127 52 L112 58 L114 62.5 L126 57.5 Z" />
              <path className={p('moon')} d="M97 55 L106 58.6 L105 60.3 L98 57.4 Z M123 55 L114 58.6 L115 60.3 L122 57.4 Z" />
              {WARDEN_ARMS[pose]}
            </>
          )}
        </g>
        <ellipse className={p('ghost-faint')} cx={84} cy={293} rx={26} ry={4.5} />
        <ellipse className={p('ghost-faint')} cx={140} cy={294} rx={28} ry={4.5} />
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// The front of the house, for the way in.

/** The front door at night: panelled, with an iron knocker and a lit fanlight. */
export function FrontDoorPainting() {
  return (
    <Svg viewBox={`0 0 ${PAINT_W} ${PAINT_H}`} className="hh-paint hh-paint-front" preserveAspectRatio="xMidYMid slice">
      <g stroke="none">
        <rect className={p('door')} x={0} y={0} width={1200} height={750} />
        {/* Deep panels, each with a lit and a shadowed edge. */}
        {[
          [70, 60, 460, 300],
          [670, 60, 460, 300],
          [70, 430, 460, 400],
          [670, 430, 460, 400],
        ].map(([x, y, w, h]) => (
          <g key={`${x}-${y}`}>
            <rect className={p('door-d')} x={x} y={y} width={w} height={h} />
            <path className={p('door-dd')} d={`M${x} ${y} h${w} l-26 26 h${-(w - 52)} v${h - 52} l-26 26 Z`} />
            <path className={p('door-l')} d={`M${x + w} ${y + h} h${-w} l26 -26 h${w - 52} v${-(h - 52)} l26 -26 Z`} />
            <rect className={p('door')} x={x + 26} y={y + 26} width={w - 52} height={h - 52} />
          </g>
        ))}
        <rect className={p('door-dd')} x={594} y={0} width={12} height={750} />
        {/* The knocker: an iron bat holding a ring. */}
        <circle className={p('lamp-glow')} cx={600} cy={330} r={260} />
        <path className={p('iron')} d="M600 250 q-30 -40 -80 -30 q20 10 22 30 q-40 -12 -70 14 q30 0 40 22 q40 -22 88 -6 q48 -16 88 6 q10 -22 40 -22 q-30 -26 -70 -14 q2 -20 22 -30 q-50 -10 -80 30 Z" />
        <circle className={p('iron')} cx={600} cy={262} r={30} />
        <circle className={p('lamp')} cx={589} cy={258} r={5} />
        <circle className={p('lamp')} cx={611} cy={258} r={5} />
        <path className={p('iron')} d="M588 232 l-6 -22 l16 14 Z M612 232 l6 -22 l-16 14 Z" />
        <circle className={p('iron')} cx={600} cy={364} r={74} />
        <circle className={p('door')} cx={600} cy={364} r={52} />
        <circle className={p('iron-l')} cx={600} cy={438} r={20} />
        <circle className={p('iron')} cx={600} cy={438} r={12} />
        <path className={p('vignette')} d="M0 0 H1200 V750 H0 Z" />
      </g>
    </Svg>
  )
}
