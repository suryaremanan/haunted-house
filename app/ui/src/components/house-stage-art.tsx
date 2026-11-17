// Original filled drawings for the 3D model of the house: what hangs on each
// room's back wall, the furniture that stands in it, the roof, the night sky
// and the yard. Every shape was drawn for this repository from plain paths,
// rectangles, circles and ellipses. Nothing is traced, copied or loaded.
//
// All of it is decoration, rendered through the one hidden wrapper of
// house-art.tsx: no name, no focus, no handler, no words. Fills come from the
// Scene Palette through the `hh-sf-*` classes of house-stage-styles.ts;
// outlines are `currentColor`, which the stage sets to the scene ink.
import type { ReactNode } from 'react'
import type { RoomId } from '../core/house-registry'
import { Svg } from './house-art'

const f = (name: string) => `hh-sf-${name}`

// ---------------------------------------------------------------------------
// Back walls. Each is drawn on a 200 by 120 wall whose floor line is y = 120.

const WALLS: Readonly<Record<RoomId, ReactNode>> = {
  // The front doors under a fanlight, and a sconce either side.
  foyer: (
    <>
      <path className={f('wood-dark')} d="M72 120 V52 a28 28 0 0 1 56 0 V120 z" />
      <path className={f('moon')} d="M78 52 a22 22 0 0 1 44 0 z" />
      <path d="M100 30 V52 M84 37 L100 52 L116 37" strokeWidth={1.5} />
      <path className={f('wood')} d="M78 56 H98 V120 H78 z M102 56 H122 V120 H102 z" />
      <path d="M82 62 h12 v22 h-12 z M106 62 h12 v22 h-12 z M82 90 h12 v24 h-12 z M106 90 h12 v24 h-12 z" strokeWidth={1.2} />
      <circle className={f('brass')} cx="96" cy="88" r="2" />
      <circle className={f('brass')} cx="104" cy="88" r="2" />
      <path className={f('brass')} d="M38 58 h10 l-2 8 h-6 z M152 58 h10 l-2 8 h-6 z" />
      <path className={f('lamp')} d="M43 44 q5 7 0 13 q-5 -6 0 -13 z M157 44 q5 7 0 13 q-5 -6 0 -13 z" strokeWidth={1.2} />
    </>
  ),
  // A tall arched window with the moon in it, drawn curtains, a small portrait.
  study: (
    <>
      <path className={f('glass')} d="M40 96 V40 a22 22 0 0 1 44 0 V96 z" />
      <circle className={f('moon')} cx="70" cy="44" r="9" />
      <path d="M62 18 V96 M40 58 H84" strokeWidth={1.5} />
      <path className={f('cloth')} d="M30 14 H94 V22 H30 z M32 22 q10 40 -2 78 h12 q6 -40 0 -78 z M92 22 q-10 40 2 78 h-12 q-6 -40 0 -78 z" />
      <rect className={f('brass')} x="124" y="30" width="34" height="42" rx="2" />
      <rect className={f('paper')} x="129" y="35" width="24" height="32" />
      <circle className={f('bone')} cx="141" cy="47" r="6" />
      <path d="M133 67 q8 -12 16 0" strokeWidth={1.5} />
    </>
  ),
  // A pinned blueprint of a house, a T-square, a shelf of rolled plans.
  'drafting-room': (
    <>
      <rect className={f('sheet')} x="26" y="24" width="84" height="60" />
      <path className={f('none')} d="M40 72 V48 L60 34 L80 48 V72 z M52 72 V58 h10 v14 M68 52 h8 v8 h-8 z M34 78 H102" stroke="var(--hh-sc-paper, none)" strokeWidth={1.5} />
      <circle className={f('cloth')} cx="30" cy="28" r="2.5" />
      <circle className={f('cloth')} cx="106" cy="28" r="2.5" />
      <path className={f('wood')} d="M124 22 h52 v7 h-22 v58 h-8 v-58 h-22 z" />
      <path className={f('wood-dark')} d="M118 98 h64 v5 h-64 z" />
      <path className={f('paper')} d="M124 98 v-9 a4 4 0 0 1 8 0 v9 z M136 98 v-13 a4 4 0 0 1 8 0 v13 z M150 98 v-8 a4 4 0 0 1 8 0 v8 z M164 98 v-11 a4 4 0 0 1 8 0 v11 z" />
    </>
  ),
  // A pegboard of tools and a small square window.
  workshop: (
    <>
      <rect className={f('wood')} x="24" y="22" width="96" height="58" rx="2" />
      <path d="M36 32 v6 M52 32 v6 M68 32 v6 M84 32 v6 M100 32 v6" strokeWidth={1} strokeDasharray="1 5" />
      <path className={f('brass')} d="M34 40 h8 v8 h-3 v26 h-2 v-26 h-3 z" />
      <path className={f('bone')} d="M52 40 l16 6 l-2 5 l-16 -6 z" />
      <path className={f('wood-dark')} d="M58 49 l4 2 l-9 23 l-4 -2 z" />
      <path className={f('bone')} d="M80 40 h26 l-6 10 h-20 z" />
      <path d="M84 50 v-4 M90 50 v-4 M96 50 v-4" strokeWidth={1} />
      <path className={f('cloth')} d="M82 60 a7 7 0 1 1 9 9 l8 8 l-4 4 l-8 -8 a7 7 0 0 1 -5 -13 z" />
      <rect className={f('glass')} x="138" y="26" width="38" height="38" />
      <path d="M157 26 V64 M138 45 H176" strokeWidth={1.5} />
      <path className={f('wood-dark')} d="M134 64 h46 v5 h-46 z" />
    </>
  ),
  // A round window with the moon in it, rafters, and a cobweb in the corner.
  attic: (
    <>
      <path className={f('wood-dark')} d="M0 0 H200 V10 H0 z" />
      <path className={f('wood-dark')} d="M56 10 h8 v110 h-8 z M136 10 h8 v110 h-8 z" />
      <circle className={f('glass')} cx="100" cy="58" r="26" />
      <circle className={f('moon')} cx="108" cy="52" r="11" />
      <path d="M74 58 H126 M100 32 V84" strokeWidth={2} />
      <path d="M200 10 L168 10 M200 10 L200 44 M200 10 L174 36 M184 10 q2 9 -6 16 q8 -5 22 -3 M192 10 q0 5 -3 8 q4 -2 11 -1" strokeWidth={1} />
    </>
  ),
  // Heavy curtains, a banner of moon phases, and two candle sconces.
  'seance-room': (
    <>
      <path className={f('cloth')} d="M0 0 H200 V16 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 q-25 12 -50 0 z" />
      <path className={f('cloth')} d="M0 16 q14 50 0 104 h20 q10 -54 0 -104 z M200 16 q-14 50 0 104 h-20 q-10 -54 0 -104 z" />
      <circle className={f('moon')} cx="100" cy="52" r="12" />
      <path className={f('moon')} d="M70 42 a10 10 0 1 0 0 20 a13 13 0 0 1 0 -20 z M130 42 a10 10 0 1 1 0 20 a13 13 0 0 0 0 -20 z" />
      <circle className={f('ink')} cx="48" cy="52" r="6" />
      <circle className={f('ink')} cx="152" cy="52" r="6" />
      <path d="M40 30 q60 16 120 0" strokeWidth={1} strokeDasharray="2 4" />
    </>
  ),
}

// ---------------------------------------------------------------------------
// Furniture. Each stands on the floor line y = 120 of a 200 by 120 drawing.

const PROPS: Readonly<Record<RoomId, ReactNode>> = {
  // A grandfather clock, a coat stand with a hat, a side table and a pumpkin.
  foyer: (
    <>
      <path className={f('wood-dark')} d="M18 120 V40 q14 -14 28 0 V120 z" />
      <circle className={f('bone')} cx="32" cy="50" r="9" />
      <path d="M32 50 V44 M32 50 l4 3" strokeWidth={1.5} />
      <rect className={f('glass')} x="25" y="66" width="14" height="44" />
      <path d="M32 66 V98" strokeWidth={1.2} />
      <circle className={f('brass')} cx="32" cy="101" r="4" />
      <path d="M168 120 V40 M158 120 h20 M168 52 l-10 -8 M168 52 l10 -8 M168 64 l-8 -6" strokeWidth={3} />
      <path className={f('ink')} d="M150 40 h22 l-4 -10 h-14 z" />
      <path className={f('wood')} d="M118 96 h34 v5 h-34 z M122 101 h4 v19 h-4 z M144 101 h4 v19 h-4 z" />
      <path className={f('lamp')} d="M127 96 q-4 -9 3 -15 q4 -3 5 0 q4 -3 5 0 q7 6 3 15 z" />
      <path className={f('ink')} d="M133 86 l2 3 l-4 0 z M139 86 l2 3 l-4 0 z M132 92 h8 l-2 2 h-4 z" stroke="none" />
      <path d="M135 81 q0 -5 3 -6" strokeWidth={2} />
    </>
  ),
  // A bookshelf, a writing desk with a shaded lamp, a quill, and a chair.
  study: (
    <>
      <rect className={f('wood-dark')} x="136" y="26" width="54" height="94" />
      <path className={f('wood')} d="M140 30 h46 v24 h-46 z M140 58 h46 v24 h-46 z M140 86 h46 v30 h-46 z" />
      <path className={f('cloth')} d="M143 34 h6 v20 h-6 z M158 38 h5 v16 h-5 z M146 62 h7 v20 h-7 z M172 90 h8 v26 h-8 z" />
      <path className={f('brass')} d="M149 36 h5 v18 h-5 z M168 32 h7 v22 h-7 z M158 60 h6 v22 h-6 z M144 92 h6 v24 h-6 z" />
      <path className={f('ecto')} d="M163 34 h5 v20 h-5 z M176 36 h6 v18 h-6 z M168 64 h8 v18 h-8 z M154 94 h7 v22 h-7 z" />
      <path className={f('bone')} d="M176 60 l8 22 h-12 z M163 98 h7 v18 h-7 z" />
      <path className={f('wood')} d="M34 84 h82 v7 h-82 z M40 91 h6 v29 h-6 z M104 91 h6 v29 h-6 z M52 91 h46 v12 h-46 z" />
      <path className={f('ecto')} d="M56 66 h26 l-5 -12 h-16 z" />
      <path className={f('brass')} d="M67 66 h4 v14 h8 v4 h-20 v-4 h8 z" />
      <path className={f('paper')} d="M86 78 l18 -3 l2 8 l-18 2 z" />
      <path className={f('bone')} d="M104 74 q8 -16 16 -18 q-3 12 -13 20 z" />
      <path className={f('cloth')} d="M2 120 V70 q10 -8 20 0 V120 h-4 V98 H6 v22 z" />
    </>
  ),
  // A tilted drawing table with a sheet on it, a stool, and a basket of plans.
  'drafting-room': (
    <>
      <path className={f('wood')} d="M44 74 L132 50 l3 8 L47 82 z" />
      <path className={f('sheet')} d="M56 66 L120 49 l3 9 L60 75 z" />
      <path d="M68 66 l40 -11 M72 71 l28 -8" stroke="var(--hh-sc-paper, none)" strokeWidth={1.5} />
      <path className={f('wood-dark')} d="M66 78 h7 v42 h-7 z M112 64 h7 v56 h-7 z M58 112 h70 v6 h-70 z" />
      <path className={f('brass')} d="M124 46 l14 -26 l4 2 l-13 26 z" />
      <path className={f('lamp')} d="M132 16 l18 6 l-8 12 l-14 -5 z" />
      <path className={f('wood')} d="M18 92 h24 v6 h-24 z M22 98 h4 v22 h-4 z M34 98 h4 v22 h-4 z" />
      <path className={f('wood-dark')} d="M154 92 h36 l-4 28 h-28 z" />
      <path className={f('paper')} d="M160 92 V72 a4 4 0 0 1 8 0 v20 z M170 92 V62 a4 4 0 0 1 8 0 v30 z M180 92 V78 a3 3 0 0 1 6 0 v14 z" />
    </>
  ),
  // A workbench with a vise, a red toolbox, a sawhorse and a crate.
  workshop: (
    <>
      <path className={f('wood')} d="M60 74 h104 v9 h-104 z" />
      <path className={f('wood-dark')} d="M66 83 h8 v37 h-8 z M150 83 h8 v37 h-8 z M74 98 h76 v6 h-76 z" />
      <path className={f('ink')} d="M142 74 v-12 h16 v12 z M146 62 v-8 h8 v8 z" />
      <path d="M134 56 h32" strokeWidth={3} />
      <path className={f('cloth')} d="M78 74 v-14 h34 v14 z" />
      <path className={f('brass')} d="M88 60 v-6 h14 v6 M92 66 h6" />
      <path className={f('bone')} d="M118 74 l14 -20 l4 3 l-12 17 z" />
      <path className={f('wood')} d="M8 86 h40 v6 h-40 z" />
      <path d="M14 92 l-6 28 M22 92 l6 28 M42 92 l6 28 M34 92 l-6 28" strokeWidth={3} />
      <path className={f('wood-dark')} d="M172 96 h24 v24 h-24 z" />
      <path d="M172 96 l24 24 M196 96 l-24 24" strokeWidth={1.5} />
    </>
  ),
  // A travel trunk, a film projector on it, stacked boxes and a sheeted mirror.
  attic: (
    <>
      <path className={f('wood-dark')} d="M64 92 q0 -8 8 -8 h52 q8 0 8 8 v28 h-68 z" />
      <path className={f('brass')} d="M64 98 h68 v5 h-68 z M94 98 h8 v10 h-8 z" />
      <path className={f('ink')} d="M82 84 v-14 h30 v14 z" />
      <circle className={f('bone')} cx="88" cy="62" r="9" />
      <circle className={f('bone')} cx="108" cy="60" r="11" />
      <circle className={f('ink')} cx="88" cy="62" r="2" stroke="none" />
      <circle className={f('ink')} cx="108" cy="60" r="2" stroke="none" />
      <path className={f('lamp')} d="M112 73 l34 -12 v24 z" fillOpacity={0.45} stroke="none" />
      <path className={f('brass')} d="M112 72 h8 v8 h-8 z" />
      <path className={f('paper')} d="M10 96 h34 v24 h-34 z M16 76 h24 v20 h-24 z" />
      <path d="M10 104 h34 M27 96 v8 M16 84 h24" strokeWidth={1.2} />
      <path className={f('bone')} d="M158 120 V62 q14 -20 28 0 V120 q-5 -5 -9 0 q-5 -5 -10 0 q-4 -5 -9 0 z" />
      <path d="M166 76 q6 -8 12 0 M165 92 q7 5 14 0" strokeWidth={1.2} />
    </>
  ),
  // A round table under a cloth, a glowing glass ball, two chairs, a candle.
  'seance-room': (
    <>
      <ellipse className={f('cloth')} cx="100" cy="86" rx="46" ry="9" />
      <path className={f('cloth')} d="M54 86 q4 22 12 34 h68 q8 -12 12 -34 q-46 14 -92 0 z" />
      <path d="M70 96 q4 12 8 22 M130 96 q-4 12 -8 22 M100 96 v24" strokeWidth={1} />
      <path className={f('brass')} d="M90 84 h20 l-3 -6 h-14 z" />
      <circle className={f('ecto')} cx="100" cy="64" r="15" />
      <path d="M92 60 q4 -7 12 -6" stroke="var(--hh-sc-bone, none)" strokeWidth={2} />
      <path className={f('wood-dark')} d="M18 120 V66 h8 v26 h20 v28 h-6 v-20 H26 v20 z M182 120 V66 h-8 v26 h-20 v28 h6 v-20 h14 v20 z" />
      <path className={f('bone')} d="M134 78 h6 v-14 h-6 z" />
      <path className={f('lamp')} d="M137 52 q4 6 0 11 q-4 -5 0 -11 z" strokeWidth={1.2} />
    </>
  ),
}

export interface StageArtProps {
  readonly room: RoomId
}

/** What hangs on the back wall of a room. */
export function StageWallArt({ room }: StageArtProps) {
  return (
    <Svg viewBox="0 0 200 120" className="hh-stage-art hh-stage-wall-art" preserveAspectRatio="xMidYMax meet" data={{ 'data-scene': room }}>
      {WALLS[room]}
    </Svg>
  )
}

/** The furniture that stands in a room, in front of its back wall. */
export function StagePropArt({ room }: StageArtProps) {
  return (
    <Svg viewBox="0 0 200 120" className="hh-stage-art hh-stage-prop-art" preserveAspectRatio="xMidYMax meet" data={{ 'data-scene': room }}>
      {PROPS[room]}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Outside: the roof over the model, the night sky, and the yard.

/** The gable roof with its shingles, a chimney, an attic vent and a weather vane. */
export function StageRoofArt() {
  return (
    <Svg viewBox="0 0 400 70" className="hh-stage-art hh-stage-roof-art" preserveAspectRatio="none">
      <path className={f('wall-attic')} d="M286 44 V10 h26 v40 z" />
      <path className={f('ink')} d="M282 10 h34 v6 h-34 z" />
      <path className={f('roof')} d="M2 70 L200 4 L398 70 z" strokeWidth={2.5} />
      <path d="M40 60 H360 M74 49 H326 M108 38 H292 M142 27 H258 M176 16 H224" strokeWidth={1} strokeDasharray="14 6" />
      <circle className={f('glass')} cx="200" cy="44" r="9" />
      <path d="M191 44 H209 M200 35 V53" strokeWidth={1.2} />
    </Svg>
  )
}

/** The moon, a few stars and three bats. */
export function StageSkyArt() {
  return (
    <Svg viewBox="0 0 200 90" className="hh-stage-art hh-stage-sky-art" preserveAspectRatio="xMaxYMin meet">
      <circle className={f('moon')} cx="160" cy="30" r="20" />
      <path d="M150 22 a4 4 0 1 0 0.1 0 M166 36 a6 6 0 1 0 0.1 0 M168 20 a2 2 0 1 0 0.1 0" strokeWidth={1} />
      <path className={f('ink')} d="M100 34 q5 -7 10 0 q3 -3 6 0 q5 -7 10 0 q-7 -1 -9 5 q-2 -3 -4 -3 q-2 0 -4 3 q-2 -6 -9 -5 z" />
      <path className={f('ink')} d="M58 58 q4 -6 8 0 q2 -2 4 0 q4 -6 8 0 q-5 -1 -7 4 q-1 -2 -3 -2 q-2 0 -3 2 q-2 -5 -7 -4 z" />
      <path className={f('ink')} d="M124 66 q3 -5 6 0 q2 -2 4 0 q3 -5 6 0 q-4 -1 -5 3 q-1 -2 -3 -2 q-2 0 -3 2 q-1 -4 -5 -3 z" />
      <path d="M20 16 v6 M17 19 h6 M84 10 v4 M82 12 h4 M40 44 v4 M38 46 h4" strokeWidth={1.2} />
    </Svg>
  )
}

/** A bare tree, a leaning fence, two gravestones and a lit pumpkin. */
export function StageYardArt() {
  return (
    <Svg viewBox="0 0 400 60" className="hh-stage-art hh-stage-yard-art" preserveAspectRatio="xMidYMax meet">
      <path d="M0 58 H400" strokeWidth={2} />
      <path className={f('ink')} d="M26 58 V30 q-10 -8 -14 -20 q8 8 14 10 q-2 -12 4 -20 q0 12 4 18 q8 -4 12 -14 q-2 16 -12 24 V58 z" />
      <path d="M58 58 V40 l3 -4 l3 4 V58 M72 58 V38 l3 -4 l3 4 V58 M86 58 V42 l3 -4 l3 4 V58 M54 46 H96 M54 52 H96" strokeWidth={1.5} />
      <path className={f('bone')} d="M316 58 V40 a8 8 0 0 1 16 0 V58 z M344 58 V46 a6 6 0 0 1 12 0 V58 z" />
      <path d="M320 44 h8 M324 40 v10" strokeWidth={1.2} />
      <path className={f('lamp')} d="M372 58 q-12 -2 -10 -12 q2 -8 12 -7 q10 -1 12 7 q2 10 -10 12 z" />
      <path className={f('ink')} d="M368 46 l3 4 h-6 z M378 46 l3 4 h-6 z M367 53 h14 l-3 3 h-8 z" stroke="none" />
      <path d="M374 39 q0 -5 4 -6" strokeWidth={2} />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// The desk across the front of the walk-in room, and the things on it. Each
// thing is a pointer shortcut to a control that exists elsewhere on the page.

export const DESK_ITEMS = ['book', 'bell', 'horn', 'model', 'candle'] as const
export type DeskItem = (typeof DESK_ITEMS)[number]

const DESK_ART: Readonly<Record<DeskItem, ReactNode>> = {
  // An open ledger with a ribbon and a quill laid across it.
  book: (
    <>
      <path className={f('cloth')} d="M4 46 L40 54 L76 46 V52 L40 60 L4 52 z" />
      <path className={f('paper')} d="M6 44 q16 -8 34 4 q18 -12 34 -4 L74 20 q-16 -8 -34 4 q-18 -12 -34 -4 z" />
      <path d="M40 24 V48 M12 26 q12 -4 22 2 M12 33 q12 -4 22 2 M46 28 q10 -6 22 -2 M46 35 q10 -6 22 -2" strokeWidth={1.2} />
      <path className={f('bone')} d="M44 44 q14 -26 30 -34 q-2 18 -22 36 z" />
      <path d="M46 46 l-4 8" strokeWidth={2} />
    </>
  ),
  // A brass desk bell on its plate.
  bell: (
    <>
      <path className={f('brass')} d="M10 50 q0 -30 30 -30 q30 0 30 30 z" />
      <path className={f('wood-dark')} d="M4 50 h72 v8 h-72 z" />
      <path className={f('brass')} d="M36 20 v-8 h8 v8 z" />
      <circle className={f('bone')} cx="40" cy="9" r="5" />
      <path d="M22 44 q2 -14 14 -18" strokeWidth={2} stroke="var(--hh-sc-bone, none)" />
    </>
  ),
  // A wind-up gramophone with a flared horn.
  horn: (
    <>
      <path className={f('wood-dark')} d="M8 40 h44 v20 h-44 z" />
      <path className={f('ink')} d="M14 40 a16 5 0 0 1 32 0 z" />
      <path className={f('brass')} d="M34 36 q4 -20 18 -22 l22 -12 q6 16 -4 34 l-24 -6 q-6 2 -8 8 z" />
      <path d="M52 14 q8 10 16 22" strokeWidth={1.2} />
      <path d="M52 50 h10 v-6" strokeWidth={3} />
      <circle className={f('brass')} cx="62" cy="42" r="3" />
    </>
  ),
  // A small card model of the house.
  model: (
    <>
      <path className={f('wall-attic')} d="M52 22 V10 h8 v18 z" />
      <path className={f('bone')} d="M12 60 V32 h56 V60 z" />
      <path className={f('roof')} d="M4 34 L40 6 L76 34 z" />
      <path className={f('lamp')} d="M20 40 h10 v10 h-10 z M50 40 h10 v10 h-10 z" />
      <path className={f('wood')} d="M35 60 V46 a5 5 0 0 1 10 0 V60 z" />
      <path d="M2 60 H78" strokeWidth={2} />
    </>
  ),
  // A fat candle burning in a dish, with a run of wax.
  candle: (
    <>
      <path className={f('lamp')} d="M40 4 q10 12 0 22 q-10 -10 0 -22 z" strokeWidth={1.5} />
      <path className={f('bone')} d="M28 30 h24 v26 h-24 z" />
      <path d="M40 26 v6 M46 30 q4 10 0 16" strokeWidth={2} />
      <path className={f('brass')} d="M14 56 h52 l-6 6 h-40 z" />
    </>
  ),
}

/** One thing on the desk. */
export function StageDeskArt({ item }: { readonly item: DeskItem }) {
  return (
    <Svg viewBox="0 0 80 64" className="hh-stage-art hh-stage-desk-art" data={{ 'data-item': item }}>
      {DESK_ART[item]}
    </Svg>
  )
}

