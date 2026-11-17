// Where things are on the stage (Spec 8, Requirements 1.6, 5.6, 5.7, 8.4):
// the press area of every working object of a painted room, the place of each
// ghost, and the one corner the Warden may stand in front of. All of it in
// percent of the room scene, so it holds at any window size.
//
// The style sheet reads the same numbers, and a property test checks that no
// working object reaches the Guide Reserve. That is what "the guide never
// covers content" means here: it is a fact of layout, not a hope.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import type { GuideView, PressStep } from './house-guide'
import type { RoomPresentation } from './house-projection'
import { stateWord, type PresentationGhostState } from './house-registry'
import { word, type TermId, type WordMode } from './house-words'
import type { Phase } from './workflow-projection'

/** A rectangle in percent of the scene: `left` and `width` of its width, `top` and `height` of its height. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The painted scene is 1200 by 750. */
export const SCENE_WIDTH = 1200
export const SCENE_HEIGHT = 750

/** A ghost figure: its width in percent of the scene width, and its height over its width. */
export const GHOST_WIDTH = 9
export const GHOST_ASPECT = 170 / 160

/** The Warden's drawing is 200 by 300. */
export const WARDEN_ASPECT = 300 / 200
/** Twice a ghost's height at any window size, in percent of the scene width. */
export const WARDEN_WIDTH = (2 * GHOST_WIDTH * GHOST_ASPECT) / WARDEN_ASPECT

/** The fixed press areas of a painted room. */
export const STAGE_BOXES = {
  /** The door in the left wall: the way back to the room before. */
  previous: { left: 2.5, top: 28, width: 8.5, height: 53 },
  /** The door in the right wall: the room's own Door, or the way on. */
  door: { left: 89, top: 28, width: 8.5, height: 53 },
  /** The door in the back wall, for a room with a second Door. */
  'door-2': { left: 69.7, top: 28, width: 12.3, height: 41.5 },
  /** The open ledger on the desk: the room's sheet. */
  ledger: { left: 15.8, top: 84.5, width: 23.4, height: 11.5 },
  /** The bell on the desk: what needs you. */
  bell: { left: 46.5, top: 82.5, width: 9.4, height: 11 },
} as const satisfies Record<string, Box>

/**
 * The one part of the scene the Warden may overlap: the corner in front of the
 * right end of the desk. He stands on the apron below the scene and only his
 * head and shoulders rise into it.
 */
export const GUIDE_RESERVE: Box = { left: 84, top: 82, width: 16, height: 18 }

/** How far above the floor line a ghost floats, in percent of the scene height. */
const GHOST_BOTTOM: Readonly<Partial<Record<PresentationGhostState, number>>> = { failed: 21, blocked: 21, working: 30 }
export const GHOST_BOTTOM_DEFAULT = 27
/** Ghosts stand in a band this wide, starting here, in percent of the scene width. */
export const GHOST_BAND = { left: 26, width: 46 } as const
/** In a room with a door in the back wall the band ends before it, so no ghost stands on that door. */
export const GHOST_BAND_BEFORE_BACK_DOOR = { left: 24, width: 44 } as const

/** The height of a ghost figure in percent of the scene height. */
export function ghostHeight(): number {
  return (GHOST_WIDTH * GHOST_ASPECT * SCENE_WIDTH) / SCENE_HEIGHT
}

/** How far the nth of count ghosts floats above the bottom of the scene, in percent. */
export function ghostBottom(state: PresentationGhostState): number {
  return GHOST_BOTTOM[state] ?? GHOST_BOTTOM_DEFAULT
}

/** Where the nth of count ghosts stands. `backDoor`: the room has a door in its back wall. */
export function ghostBox(index: number, count: number, state: PresentationGhostState, backDoor = false): Box {
  const places = Math.max(1, Math.trunc(count) || 1)
  const place = Math.min(places - 1, Math.max(0, Math.trunc(index) || 0))
  const height = ghostHeight()
  const band = backDoor ? GHOST_BAND_BEFORE_BACK_DOOR : GHOST_BAND
  return {
    left: band.left + ((place + 0.5) / places) * band.width - GHOST_WIDTH / 2,
    top: 100 - ghostBottom(state) - height,
    width: GHOST_WIDTH,
    height,
  }
}

export function intersects(left: Box, right: Box): boolean {
  return left.left < right.left + right.width && right.left < left.left + left.width && left.top < right.top + right.height && right.top < left.top + left.height
}

export function withinScene(box: Box): boolean {
  return box.left >= 0 && box.top >= 0 && box.width > 0 && box.height > 0 && box.left + box.width <= 100 && box.top + box.height <= 100
}

export type WorkingObjectKind = 'previous' | 'next' | 'door' | 'ghost' | 'ledger' | 'bell'

/** One painted thing that forwards a press, with the label it wears while labels are on show. */
export interface WorkingObject {
  /** Stable within a room. */
  readonly key: string
  readonly kind: WorkingObjectKind
  readonly box: Box
  /** The visible label: what it is and its state. */
  readonly label: string
  /** The accessible name: the label and what pressing does. */
  readonly name: string
  readonly steps: readonly PressStep[]
}

const PHASE_TERM: Readonly<Record<Phase, TermId>> = { requirements: 'requirements', design: 'design', tasks: 'tasks', implementation: 'build' }
const DOOR_OF: Readonly<Record<Phase, string>> = {
  requirements: 'Door for {word}',
  design: 'Door for {word}',
  tasks: 'Door for the {word}',
  implementation: 'Door for {word}',
}

function inReadingOrder(objects: readonly WorkingObject[]): WorkingObject[] {
  // The wall and the figures first, left to right; then the things on the desk, left to right.
  const onDesk = (object: WorkingObject) => (object.box.top >= GUIDE_RESERVE.top ? 1 : 0)
  return [...objects].sort((left, right) => onDesk(left) - onDesk(right) || left.box.left - right.box.left)
}

/**
 * The working objects of a room, in reading order. Everything else in the
 * painting is furniture and gets no label.
 */
export function workingObjects(room: RoomPresentation, view: Pick<GuideView, 'previous' | 'next'>, words: WordMode, needsYou: number): readonly WorkingObject[] {
  const objects: WorkingObject[] = []
  const roomTarget = { kind: 'room', roomId: room.roomId } as const
  if (view.previous !== null) {
    objects.push({
      key: 'previous',
      kind: 'previous',
      box: STAGE_BOXES.previous,
      label: `To the ${view.previous.name}`,
      name: `To the ${view.previous.name}. Opens that room.`,
      steps: [{ kind: 'map', target: { kind: 'room', roomId: view.previous.roomId }, focus: { kind: 'heading' } }],
    })
  }
  const [first, second] = room.doors
  const doorObject = (door: (typeof room.doors)[number], key: 'door' | 'door-2'): WorkingObject => {
    const label = `${DOOR_OF[door.phase].replace('{word}', word(PHASE_TERM[door.phase], words))}: ${stateWord(door.state)}`
    return {
      key,
      kind: 'door',
      box: STAGE_BOXES[key],
      label,
      name: `${label}. Shows this door and what it waits for.`,
      steps: [{ kind: 'map', target: { kind: 'door', roomId: room.roomId, phase: door.phase, proposalId: door.proposalId }, focus: { kind: 'heading' } }],
    }
  }
  if (first !== undefined) objects.push(doorObject(first, 'door'))
  else if (view.next !== null) {
    objects.push({
      key: 'next',
      kind: 'next',
      box: STAGE_BOXES.door,
      label: `To the ${view.next.name}`,
      name: `To the ${view.next.name}. Opens that room.`,
      steps: [{ kind: 'map', target: { kind: 'room', roomId: view.next.roomId }, focus: { kind: 'heading' } }],
    })
  }
  if (second !== undefined) objects.push(doorObject(second, 'door-2'))
  room.ghosts.forEach((ghost, index) => {
    const label = `${ghost.name}: ${stateWord(ghost.state)}`
    objects.push({
      key: `ghost:${ghost.ghostId}`,
      kind: 'ghost',
      box: ghostBox(index, room.ghosts.length, ghost.state, second !== undefined),
      label,
      name: `${label}. Shows what this ghost is doing.`,
      steps: [{ kind: 'map', target: { kind: 'ghost', roomId: room.roomId, ghostId: ghost.ghostId }, focus: { kind: 'heading' } }],
    })
  })
  objects.push({
    key: 'ledger',
    kind: 'ledger',
    box: STAGE_BOXES.ledger,
    label: "Ledger: this room's sheet",
    name: `Ledger: this room's sheet. Opens the sheet of the ${room.name}.`,
    steps: [{ kind: 'map', target: roomTarget, focus: { kind: 'heading' } }],
  })
  const bell = needsYou === 0 ? 'Bell: nothing needs you' : needsYou === 1 ? 'Bell: 1 thing needs you' : `Bell: ${needsYou} things need you`
  objects.push({
    key: 'bell',
    kind: 'bell',
    box: STAGE_BOXES.bell,
    label: bell,
    // The name starts with the words on the label, then says what a press does.
    name: needsYou === 0 ? `${bell}. A press does nothing until something waits.` : `${bell}. Goes to the first of them.`,
    steps: [{ kind: 'shell', action: 'needs-you' }],
  })
  return inReadingOrder(objects)
}
