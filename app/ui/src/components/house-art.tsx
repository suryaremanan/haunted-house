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
// The cutaway: roof, chimney, outer walls, two floors and the stairs between.

export interface HouseCutawayArtProps {
  /** Draws the extra bay on the right when the Séance Room is shown. */
  readonly seanceRoom?: boolean
}

export function HouseCutawayArt({ seanceRoom = false }: HouseCutawayArtProps) {
  return (
    <Svg viewBox="0 0 400 300" className="hh-ui-house-art" preserveAspectRatio="none" data={{ 'data-seance': seanceRoom ? 'shown' : 'hidden' }}>
      {/* Chimney, then the roof over it. */}
      <path d="M300 34 V10 H326 V52" />
      <path d="M4 60 L200 6 L396 60" strokeWidth={3} />
      <path d="M22 60 H378" />
      {/* Shingle rows. */}
      <path d="M92 36 H308 M140 22 H260" strokeDasharray="10 8" strokeWidth={1} />
      {/* Outer walls and ground. */}
      <path d="M10 60 V294 H390 V60" strokeWidth={3} />
      <path d="M0 296 H400" strokeWidth={1} />
      {/* The attic floor and the upper floor. */}
      <path d="M10 128 H390 M10 206 H390" strokeWidth={1} strokeDasharray="2 6" />
      {/* Stairs from the ground floor to the upper landing. */}
      <path d="M40 206 h10 v-8 h10 v-8 h10 v-8 h10 v-8 h10 v-8 h10" strokeWidth={1} />
      <path d="M360 206 h-10 v-8 h-10 v-8 h-10 v-8 h-10 v-8 h-10 v-8 h-10" strokeWidth={1} />
      {seanceRoom ? <path d="M296 206 V294" strokeWidth={1} strokeDasharray="4 6" /> : null}
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
    <Svg viewBox="0 0 120 80" className="hh-ui-room-art" preserveAspectRatio="xMaxYMax meet" data={{ 'data-room': room }}>
      <g strokeWidth={1.5}>{ROOM_FURNITURE[room]}</g>
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
const GHOST_POSE: Readonly<Record<PresentationGhostState, { readonly tilt: string; readonly marks: ReactNode }>> = {
  // Resting: closed eyes, arms down.
  idle: {
    tilt: '',
    marks: <path d="M14 22 q2 2 4 0 M22 22 q2 2 4 0 M10 28 q-3 3 -2 7 M30 28 q3 3 2 7" />,
  },
  // Busy: open eyes, both arms forward, two work sparks.
  working: {
    tilt: 'rotate(6 20 40)',
    marks: (
      <>
        <circle cx="17" cy="21" r="1.5" fill="currentColor" />
        <circle cx="25" cy="21" r="1.5" fill="currentColor" />
        <path d="M30 26 h8 M30 31 h8 M40 22 v-4 M38 20 h4 M44 28 v-3 M42.5 26.5 h3" />
      </>
    ),
  },
  // Asking: open eyes, one arm raised high, a small bell.
  waiting: {
    tilt: '',
    marks: (
      <>
        <circle cx="16" cy="21" r="1.5" fill="currentColor" />
        <circle cx="24" cy="21" r="1.5" fill="currentColor" />
        <path d="M30 24 L37 10 M10 28 q-3 3 -2 7 M38 3 a3 3 0 0 1 3 3 v2 h-6 v-2 a3 3 0 0 1 3 -3 M37 9.5 h2" />
      </>
    ),
  },
  // Stuck: level eyes, arms crossed, a bar across the front.
  blocked: {
    tilt: '',
    marks: (
      <>
        <path d="M14 21 h4 M22 21 h4 M12 31 L28 27 M12 27 L28 31" />
        <path d="M3 36 H37" strokeWidth={3} />
      </>
    ),
  },
  // Fallen: crossed eyes, slumped sideways, arms dropped.
  failed: {
    tilt: 'rotate(-24 20 40)',
    marks: <path d="M14 19 l4 4 M18 19 l-4 4 M22 19 l4 4 M26 19 l-4 4 M17 29 q3 -3 6 0 M9 30 l-4 6 M31 30 l4 6" />,
  },
  // Finished: happy eyes, both arms up, a tick beside it.
  done: {
    tilt: '',
    marks: <path d="M14 22 q2 -3 4 0 M22 22 q2 -3 4 0 M16 27 q4 4 8 0 M10 24 L5 14 M30 24 L35 14 M36 30 l3 3 l6 -8" />,
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
        <path d={GHOST_BODY[variant]} fill={absent ? 'none' : RAISED} strokeDasharray={absent ? '2 4' : undefined} />
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
