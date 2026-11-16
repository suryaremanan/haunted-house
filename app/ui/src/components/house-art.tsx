// Original decorative art for the house (Spec 6 task 4.2; Requirements 5.1 to
// 5.3, 5.8): the cutaway frame, room furniture, friendly ghosts, Doors,
// candles and dust. Every shape here was drawn for this repository from plain
// lines, rectangles, circles and short paths. Nothing is traced, copied or
// loaded from elsewhere.
//
// All of it is decoration. Each <svg> is hidden from assistive technology and
// cannot take focus; names, states and controls are HTML beside it. A ghost
// pose or Door shape repeats a state that is always also written in words.
// Colors come from `currentColor` and the house tokens, so the art follows
// the theme. Motion, when allowed, is applied by house-styles.ts through the
// classes set here; the art itself contains no animation.
import type { ReactNode } from 'react'
import type { PresentationDoorState, PresentationGhostState, RoomId } from '../core/house-registry'

interface SvgProps {
  readonly viewBox: string
  readonly className: string
  readonly width?: number
  readonly height?: number
  readonly preserveAspectRatio?: string
  readonly data?: Readonly<Record<string, string>>
  readonly children: ReactNode
}

/** The one <svg> wrapper: always hidden from the accessibility tree and never focusable. */
function Svg({ viewBox, className, width, height, preserveAspectRatio, data = {}, children }: SvgProps) {
  return (
    <svg
      viewBox={viewBox}
      className={`hh-ui-art ${className}`}
      width={width}
      height={height}
      preserveAspectRatio={preserveAspectRatio}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...data}
    >
      {children}
    </svg>
  )
}

const RAISED = 'var(--hh-surface-raised, none)'

// ---------------------------------------------------------------------------
// The cutaway: the roof, eaves and chimney drawn over the room grid. The walls
// and the ground are the room grid's own borders, so no line of this drawing
// ever crosses a room. Its height follows its width (no stretching).

export interface HouseCutawayArtProps {
  /** Marks the drawing for the wider bay when the Séance Room is shown. */
  readonly seanceRoom?: boolean
}

export function HouseCutawayArt({ seanceRoom = false }: HouseCutawayArtProps) {
  return (
    <Svg viewBox="0 0 400 44" className="hh-ui-house-art" data={{ 'data-seance': seanceRoom ? 'shown' : 'hidden' }}>
      {/* Chimney with a wisp of smoke, then the roof over it. */}
      <path d="M298 30 V8 H316 V22" fill={RAISED} />
      <path d="M305 4 q4 -3 0 -6" strokeWidth={1} />
      <path d="M8 43 L200 3 L392 43 z" fill={RAISED} strokeWidth={2.5} />
      {/* Shingle rows and a round attic vent. */}
      <path d="M120 27 H280 M156 19 H244 M88 35 H312" strokeDasharray="6 6" strokeWidth={1} />
      <circle cx="200" cy="22" r="5" />
      <path d="M195 22 H205 M200 17 V27" strokeWidth={1} />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Furniture: one small still life per room, tucked into the room's corner.

const ROOM_FURNITURE: Readonly<Record<RoomId, ReactNode>> = {
  // Front door with a fanlight, a coat stand and a rug.
  foyer: (
    <>
      <path d="M78 74 V40 a14 14 0 0 1 28 0 V74" />
      <path d="M78 40 H106 M92 26 V40" strokeWidth={1} />
      <circle cx="101" cy="58" r="1.5" />
      <path d="M62 74 V34 M56 40 l6 -6 l6 6 M57 74 h10" />
      <ellipse cx="92" cy="77" rx="20" ry="2" strokeWidth={1} />
    </>
  ),
  // Bookshelf, writing desk and a quill in its inkwell.
  study: (
    <>
      <rect x="84" y="24" width="30" height="50" />
      <path d="M84 40 H114 M84 57 H114" strokeWidth={1} />
      <path d="M89 27 v11 M94 29 v9 M100 27 v11 M106 30 v8 M90 44 v11 M97 45 v10 M104 43 v12" strokeWidth={1} />
      <path d="M50 58 H78 M54 58 V74 M74 58 V74" />
      <path d="M66 58 v-5 h6 v5 M69 53 q2 -12 9 -16" strokeWidth={1} />
    </>
  ),
  // Tilted drafting table, a set square and rolled plans.
  'drafting-room': (
    <>
      <path d="M62 44 L108 34 M72 42 V74 M100 36 V74 M66 74 H106" />
      <path d="M70 39 l24 -5 l-20 -8 z" strokeWidth={1} />
      <circle cx="48" cy="70" r="4" />
      <path d="M48 66 H30 M48 74 H30 M30 66 a4 4 0 0 0 0 8" strokeWidth={1} />
    </>
  ),
  // Workbench with a vise, a mallet and a peg rail.
  workshop: (
    <>
      <path d="M56 52 H112 M62 52 V74 M106 52 V74 M62 64 H106" />
      <path d="M94 52 v-8 h10 v8 M99 44 v-5 M95 39 h8" />
      <path d="M70 50 l10 -12 M76 34 l8 7" />
      <path d="M58 24 H110 M66 24 v6 M82 24 v9 M98 24 v5" strokeWidth={1} />
    </>
  ),
  // Travel trunk, a round window and a cobweb in the corner.
  attic: (
    <>
      <rect x="74" y="54" width="36" height="20" rx="2" />
      <path d="M74 62 H110 M88 54 V74 M96 54 V74" strokeWidth={1} />
      <circle cx="52" cy="40" r="10" />
      <path d="M42 40 H62 M52 30 V50" strokeWidth={1} />
      <path d="M118 4 L98 4 M118 4 L118 24 M118 4 L102 20 M108 4 q1 6 -4 10 q5 -3 14 -2" strokeWidth={1} />
    </>
  ),
  // Round table with a cloth, two stools and a glass lamp.
  'seance-room': (
    <>
      <ellipse cx="88" cy="54" rx="22" ry="5" />
      <path d="M68 55 q3 12 8 19 M108 55 q-3 12 -8 19 M76 74 H100" />
      <circle cx="88" cy="42" r="7" />
      <path d="M83 49 h10" strokeWidth={1} />
      <path d="M54 62 h10 M59 62 V74 M112 62 h6 M115 62 V74" strokeWidth={1} />
    </>
  ),
}

export interface RoomArtProps {
  readonly room: RoomId
}

export function RoomArt({ room }: RoomArtProps) {
  return (
    <Svg
      viewBox="0 0 120 80"
      className="hh-ui-room-art"
      preserveAspectRatio={room === 'foyer' ? 'xMidYMax meet' : 'xMaxYMax meet'}
      data={{ 'data-room': room }}
    >
      <g strokeWidth={1.5}>{ROOM_FURNITURE[room]}</g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Wall pieces: what hangs above the furniture when a room has the height for it.

const ROOM_WALL: Readonly<Record<RoomId, ReactNode>> = {
  // A chandelier on its chain over the stairs that climb to the upper floor.
  foyer: (
    <>
      <path d="M60 0 V22" strokeWidth={1} />
      <path d="M42 30 q18 10 36 0 M46 30 V24 M60 34 V26 M74 30 V24" />
      <path d="M44 22 h4 M58 24 h4 M72 22 h4" strokeWidth={1} />
      <path d="M8 98 h12 v-12 h12 v-12 h12 v-12 h12 v-12 h12" />
      <path d="M8 98 L68 38" strokeWidth={1} strokeDasharray="2 4" />
    </>
  ),
  // A tall window with the moon in it, and its curtains drawn back.
  study: (
    <>
      <path d="M44 92 V24 a16 16 0 0 1 32 0 V92 z" />
      <path d="M60 8 V92 M44 52 H76" strokeWidth={1} />
      <path d="M68 24 a6 6 0 1 0 4 8 a4.5 4.5 0 1 1 -4 -8 z" fill="currentColor" fillOpacity={0.3} strokeWidth={1} />
      <path d="M38 6 q4 40 -2 86 M82 6 q-4 40 2 86 M34 4 H86" />
    </>
  ),
  // A blueprint pinned to the wall.
  'drafting-room': (
    <>
      <rect x="30" y="14" width="60" height="44" />
      <path d="M38 48 H60 V26 H82 M60 38 H72 V48" strokeWidth={1} />
      <circle cx="34" cy="18" r="1.5" fill="currentColor" />
      <circle cx="86" cy="18" r="1.5" fill="currentColor" />
    </>
  ),
  // A rack of hanging tools.
  workshop: (
    <>
      <path d="M20 16 H100" />
      <path d="M34 16 v10 l-4 4 h8 l-4 -4 M54 16 v26 M50 42 h8 M76 16 v8 a6 6 0 1 0 0.1 0 M92 16 l4 24" strokeWidth={1.5} />
    </>
  ),
  // A round window with its rafters.
  attic: (
    <>
      <circle cx="60" cy="30" r="14" />
      <path d="M46 30 H74 M60 16 V44" strokeWidth={1} />
    </>
  ),
  // A hanging lamp with a crescent in its glass.
  'seance-room': (
    <>
      <path d="M60 0 V18" strokeWidth={1} />
      <path d="M48 30 q12 -16 24 0 z" />
      <path d="M62 22 a3 3 0 1 0 2 4 a2 2 0 1 1 -2 -4 z" fill="currentColor" fillOpacity={0.3} strokeWidth={1} />
      <path d="M50 30 q10 8 20 0" strokeWidth={1} strokeDasharray="1 3" />
    </>
  ),
}

/**
 * The wall piece of a room, drawn in the top band of the scene. The sheet shows
 * it only when the scene is tall enough (at least 7:6) for it to clear the furniture,
 * which sits in the bottom band.
 */
export function RoomWallArt({ room }: RoomArtProps) {
  return (
    <Svg viewBox="0 0 120 60" className="hh-ui-room-wall" preserveAspectRatio="xMidYMin meet" data={{ 'data-room': room }}>
      <g transform="translate(24 0) scale(0.6)" strokeWidth={2.5}>
        {ROOM_WALL[room]}
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Ghosts: one soft sheet silhouette per role, one pose per state.

export const GHOST_VARIANTS = ['plain', 'archivist', 'draughtsman', 'foreman', 'tinker', 'medium'] as const
export type GhostVariant = (typeof GHOST_VARIANTS)[number]

/** The ghost variant for a ghost id such as `tinker-2`; `plain` when the role is not one of ours. */
export function ghostVariantOf(ghostId: string): GhostVariant {
  const role = GHOST_VARIANTS.find((variant) => variant !== 'plain' && (ghostId === variant || ghostId.startsWith(`${variant}-`)))
  return role ?? 'plain'
}

/** Each role has its own outline: the hem and the crown differ, so silhouettes tell them apart. */
const GHOST_BODY: Readonly<Record<GhostVariant, string>> = {
  // Three even scallops.
  plain: 'M10 40 V20 a10 10 0 0 1 20 0 V40 l-3.5 -4 l-3.5 4 l-3 -4 l-3 4 l-3.5 -4 z',
  // Tall and narrow with a long trailing hem.
  archivist: 'M12 42 V18 a8 8 0 0 1 16 0 V36 q0 5 4 6 q-6 1 -8 -3 l-4 4 l-4 -4 z',
  // Pointed crown, like a sharpened pencil.
  draughtsman: 'M10 40 V22 L20 6 L30 22 V40 l-5 -4 l-5 4 l-5 -4 z',
  // Broad shoulders and a flat hem.
  foreman: 'M7 40 V24 q0 -6 5 -8 a8 8 0 0 1 16 0 q5 2 5 8 V40 h-6 v-3 h-4 v3 h-4 v-3 h-4 v3 z',
  // Small and round with a zigzag hem.
  tinker: 'M11 38 V24 a9 9 0 0 1 18 0 V38 l-3 -4 l-3 4 l-3 -4 l-3 4 l-3 -4 z',
  // Wide draped shawl.
  medium: 'M4 40 q6 -4 6 -18 a10 10 0 0 1 20 0 q0 14 6 18 q-6 2 -9 -2 l-3.5 4 l-3.5 -4 l-3.5 4 l-3.5 -4 q-3 4 -9 2 z',
}

/** The one thing each role carries. */
const GHOST_PROP: Readonly<Record<GhostVariant, ReactNode>> = {
  plain: null,
  archivist: <path d="M30 28 h8 v9 h-8 z M34 28 v9" strokeWidth={1} />,
  draughtsman: <path d="M31 38 l4 -12 l4 12 M33 33 h4" strokeWidth={1} />,
  foreman: <path d="M11 13 a9 7 0 0 1 18 0 h3 M11 13 h18" strokeWidth={1.5} />,
  tinker: <path d="M31 38 l5 -9 m-3 -1 a3 3 0 1 0 5 3" strokeWidth={1.5} />,
  medium: <path d="M20 3 l1.5 3 l3 .5 l-2.2 2 l.6 3 l-2.9 -1.6 l-2.9 1.6 l.6 -3 l-2.2 -2 l3 -.5 z" strokeWidth={1} />,
}

/** Face, arms and a small sign for each state. The body tilt is set on the group. */
const GHOST_POSE: Readonly<Record<PresentationGhostState, { readonly tilt: string; readonly dash?: string; readonly marks: ReactNode }>> = {
  // Resting: closed eyes, arms down, floating.
  idle: {
    tilt: '',
    marks: <path d="M14 22 q2 2 4 0 M22 22 q2 2 4 0 M10 28 q-3 3 -2 7 M30 28 q3 3 2 7" />,
  },
  // Busy: open eyes, leaning in, writing with a quill, two small work sparks.
  working: {
    tilt: 'rotate(6 20 40)',
    marks: (
      <>
        <circle cx="17" cy="21" r="1.5" fill="currentColor" />
        <circle cx="25" cy="21" r="1.5" fill="currentColor" />
        <path d="M30 29 L41 18 M41 18 q3 -6 -1 -9 q-3 5 -6 12 M30 29 l-1 3" />
        <path d="M44 26 v-3 M42.5 24.5 h3 M8 22 v-3 M6.5 20.5 h3" />
      </>
    ),
  },
  // Asking: open eyes, one arm raised high holding a glowing lantern.
  waiting: {
    tilt: '',
    marks: (
      <>
        <circle cx="16" cy="21" r="1.5" fill="currentColor" />
        <circle cx="24" cy="21" r="1.5" fill="currentColor" />
        <path d="M14 27 q2 2 4 0" />
        <path d="M30 24 L37 13 M10 28 q-3 3 -2 7" />
        <g className="hh-ui-art-glow">
          <circle cx="38" cy="7" r="7" fill="currentColor" fillOpacity={0.25} stroke="none" />
          <path d="M35 4 h6 v7 h-6 z M38 1 v3 M34 11 h8" fill="currentColor" fillOpacity={0.5} />
        </g>
      </>
    ),
  },
  // Stuck: level eyes, arms crossed, a cobweb caught on its shoulder.
  blocked: {
    tilt: '',
    dash: '5 3',
    marks: (
      <>
        <path d="M14 22 h4 M22 22 h4 M16 28 h8 M12 33 L28 29 M12 29 L28 33" />
        <g className="hh-ui-art-web" strokeWidth={1}>
          <path d="M30 4 L46 4 M46 4 L46 20 M46 4 L33 17 M38 4 q1 5 -3 8 q5 -2 11 0 M46 12 q-5 0 -8 -3" />
        </g>
      </>
    ),
  },
  // Fallen: crossed eyes, slumped sideways, arms dropped, a red cross beside it.
  failed: {
    tilt: 'rotate(-24 20 40)',
    marks: (
      <>
        <path d="M14 19 l4 4 M18 19 l-4 4 M22 19 l4 4 M26 19 l-4 4 M17 29 q3 -3 6 0 M9 30 l-4 6 M31 30 l4 6" />
        <path className="hh-ui-art-mark" d="M38 6 l8 8 M46 6 l-8 8" strokeWidth={3} />
      </>
    ),
  },
  // Finished: a calm glow, happy eyes, both arms up, a tick beside it.
  done: {
    tilt: '',
    marks: (
      <>
        <circle className="hh-ui-art-check" cx="20" cy="24" r="19" fill="currentColor" fillOpacity={0.12} stroke="none" />
        <path d="M14 22 q2 -3 4 0 M22 22 q2 -3 4 0 M16 27 q4 4 8 0 M10 24 L5 14 M30 24 L35 14" />
        <path className="hh-ui-art-check" d="M36 30 l3 3 l6 -8" strokeWidth={3} />
      </>
    ),
  },
  // No ghost belongs here: an empty dotted outline, no face.
  not_applicable: { tilt: '', marks: null },
  // A ghost belongs here but its state could not be read: dotted outline and a question hook.
  unavailable: {
    tilt: '',
    marks: (
      <>
        <path d="M16 18 a4 4 0 1 1 6 3.5 q-2 1 -2 4" />
        <circle cx="20" cy="30" r="0.8" fill="currentColor" />
      </>
    ),
  },
}

export interface GhostArtProps {
  readonly state: PresentationGhostState
  readonly variant?: GhostVariant
  /** Rendered width in CSS pixels. Height follows the 48 by 46 drawing. */
  readonly size?: number
}

export function GhostArt({ state, variant = 'plain', size = 40 }: GhostArtProps) {
  const pose = GHOST_POSE[state]
  const absent = state === 'not_applicable' || state === 'unavailable'
  return (
    <Svg
      viewBox="0 0 48 46"
      className="hh-ui-art-ghost"
      width={size}
      height={Math.round((size * 46) / 48)}
      data={{ 'data-ghost': state, 'data-variant': variant }}
    >
      <g transform={pose.tilt === '' ? undefined : pose.tilt}>
        <path d={GHOST_BODY[variant]} fill={absent ? 'none' : RAISED} strokeDasharray={absent ? '2 4' : pose.dash} />
        {absent ? null : GHOST_PROP[variant]}
        <g strokeWidth={1.5}>{pose.marks}</g>
      </g>
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Doors: one shape per Door state.

const DOOR_SHAPE: Readonly<Record<PresentationDoorState, ReactNode>> = {
  // Shut, with a bar across it and a round wax seal.
  sealed: (
    <>
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38 z" fill={RAISED} />
      <path d="M5 22 H27" strokeWidth={3} />
      <circle cx="16" cy="22" r="4" fill={RAISED} />
      <path d="M14.5 22 h3" strokeWidth={1} />
    </>
  ),
  // Shut, with a knocker and knock marks: someone is at the door.
  waiting: (
    <>
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38 z" fill={RAISED} />
      <circle cx="16" cy="18" r="3" />
      <path d="M16 21 v3" />
      <path d="M28 12 l4 -3 M29 18 h5 M28 24 l4 3" strokeWidth={1.5} />
    </>
  ),
  // Swung open: the empty doorway and the leaf standing aside.
  open: (
    <>
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38" strokeDasharray="1 3" />
      <path d="M24 38 V8 l10 4 V42 z" fill={RAISED} />
      <circle cx="31" cy="26" r="1" fill="currentColor" />
      <path d="M4 38 H24" strokeWidth={1} />
    </>
  ),
  // Shut and boarded with two crossed planks.
  rejected: (
    <>
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38 z" fill={RAISED} />
      <path d="M4 14 L28 32 M28 14 L4 32" strokeWidth={3} />
    </>
  ),
  // No Door here: a plain stretch of wall with a faint dotted outline.
  not_applicable: (
    <>
      <path d="M4 38 H28" />
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38" strokeDasharray="1 5" strokeWidth={1} />
    </>
  ),
  // A Door whose state could not be read: dotted leaf and a question hook.
  unavailable: (
    <>
      <path d="M8 38 V12 a8 8 0 0 1 16 0 V38 z" strokeDasharray="2 4" />
      <path d="M13 18 a3.5 3.5 0 1 1 5 3 q-2 1 -2 4" strokeWidth={1.5} />
      <circle cx="16" cy="30" r="0.8" fill="currentColor" />
    </>
  ),
}

export interface DoorArtProps {
  readonly state: PresentationDoorState
  /** Rendered width in CSS pixels. Height follows the 36 by 44 drawing. */
  readonly size?: number
}

export function DoorArt({ state, size = 30 }: DoorArtProps) {
  return (
    <Svg viewBox="0 0 36 44" className="hh-ui-art-door" width={size} height={Math.round((size * 44) / 36)} data={{ 'data-door': state }}>
      {DOOR_SHAPE[state]}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Candle and dust.

export interface CandleArtProps {
  /** An unlit candle shows only a wick. */
  readonly lit?: boolean
  readonly size?: number
}

export function CandleArt({ lit = true, size = 16 }: CandleArtProps) {
  return (
    <Svg viewBox="0 0 16 32" className="hh-ui-art-candle" width={size} height={size * 2} data={{ 'data-lit': lit ? 'true' : 'false' }}>
      <path d="M5 14 H11 V28 H5 z" fill={RAISED} />
      <path d="M2 28 H14 M8 14 V11 M11 18 q1.5 2 0 4" />
      {lit ? <path className="hh-ui-art-flame" d="M8 2 q4 5 0 9 q-4 -4 0 -9 z" fill="currentColor" strokeWidth={1} /> : null}
    </Svg>
  )
}

export function DustArt() {
  return (
    <Svg viewBox="0 0 60 30" className="hh-ui-art-dust" width={60} height={30}>
      <g fill="currentColor" stroke="none">
        <circle cx="6" cy="20" r="1" />
        <circle cx="17" cy="8" r="0.8" />
        <circle cx="28" cy="23" r="1.2" />
        <circle cx="39" cy="12" r="0.7" />
        <circle cx="48" cy="5" r="1" />
        <circle cx="55" cy="19" r="0.8" />
      </g>
    </Svg>
  )
}
