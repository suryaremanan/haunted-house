// The Warden's words (Spec 8): what the guide says about the room on show,
// what he offers, and how he stands. Everything here is a reading of the House
// Projection. The guide decides nothing and starts nothing: each thing he
// offers is a press plan, a list of existing controls for the page to press.
//
// The balloon always has the same shape: one line about what is true now, most
// pressing first; the question; at most four things to do, the most likely
// next step first; and the full list behind "Something else…".
//
// Copy is written as templates with Word Book slots (`{requirements}`), never
// with a Kiro word typed in, so plain words are the default and Kiro's are one
// setting away. Sentences the upstream specs already wrote for a risky action,
// a Crew tool prompt and a ghost's reason are quoted unchanged.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import type { DoorPresentation, GhostPresentation, HouseProjection, HouseSurfaceTarget, RecoveryActionView, RoomPresentation, WaitingItemView } from './house-projection'
import type { RoomId } from './house-registry'
import { termsIn, write, type TermId, type WordMode } from './house-words'
import type { Phase } from './workflow-projection'

export const GUIDE_QUESTION = 'What do you want to do?'
export const MAX_STATUS_CODE_POINTS = 240
export const MAX_OPTION_LABEL_CODE_POINTS = 60
export const MAX_CONSEQUENCE_CODE_POINTS = 120
export const MAX_PRIMARY_OPTIONS = 4

/** Every option label starts with one of these. */
export const APPROVED_VERBS = [
  'Allow', 'Ask', 'Build', 'Call', 'Choose', 'Close', 'Go', 'Have', 'Hide', 'Keep', 'Knock', 'Leave', 'Look', 'Open', 'Pause', 'Play', 'Put',
  'Read', 'Refuse', 'See', 'Send', 'Show', 'Step', 'Try', 'Watch', 'Write',
] as const

/** Guide copy never talks down. None of these, no exclamation mark, no emoji. */
export const BANNED_PHRASES = ['oops', 'uh-oh', 'yay', 'hooray', 'awesome', 'magic', "let's", 'simply', 'just', "don't worry", 'friend', 'buddy', 'little'] as const

/** The phases that produce a document a revision can be asked of. */
export type DocumentPhase = 'requirements' | 'design' | 'tasks'

/** What the visitor is in the middle of, so the balloon can offer ready-made choices instead of an empty field. */
export interface GuideTask {
  readonly kind: 'revise'
  readonly phase: DocumentPhase
  /** True once a ready-made text is in the field. */
  readonly filled: boolean
}

export type StatusKind = 'locked' | 'catch' | 'door-waiting' | 'failed' | 'blocked' | 'working' | 'startable' | 'door-open' | 'built' | 'room'
export const WARDEN_POSES = ['watching', 'pointing', 'offering-key', 'holding', 'stepped-back'] as const
export type WardenPose = (typeof WARDEN_POSES)[number]
/** `go`, `look`, `play`, `setting` and `leave` change nothing in the Mansion. `start`, `decide` and `ask` do. */
export type OptionKind = 'go' | 'look' | 'start' | 'decide' | 'ask' | 'play' | 'setting' | 'leave'
export const MUTATING_OPTION_KINDS: readonly OptionKind[] = ['start', 'decide', 'ask']

export type ShellAction = 'map' | 'reveal' | 'kiro-words' | 'needs-you' | 'close' | 'exit'

/** Where focus goes once a `map` step has opened its surface. Never a control that decides. */
export type PressFocus = { readonly kind: 'heading' } | { readonly kind: 'proposal'; readonly proposalId: string } | { readonly kind: 'section'; readonly section: 'built' }

/** One press of one existing control. */
export type PressStep =
  /** The House Map control of a room, ghost or Door. */
  | { readonly kind: 'map'; readonly target: HouseSurfaceTarget; readonly focus: PressFocus }
  /** The control marked `data-guide-control="<key>"`. */
  | { readonly kind: 'control'; readonly key: string }
  /** Types `text` into the one field marked with `key`, through the field's own input event. */
  | { readonly kind: 'fill'; readonly key: string; readonly text: string }
  /** Puts focus in the field marked with `key`. */
  | { readonly kind: 'focus'; readonly key: string }
  /** Ticks every enabled, unticked control whose key starts with `keyPrefix`. */
  | { readonly kind: 'every'; readonly keyPrefix: string }
  /** A control of the shell: the map toggle, a setting, the Needs You shortcut, Close, Exit. */
  | { readonly kind: 'shell'; readonly action: ShellAction }
  /** Sets or clears the task in hand. Page state only. */
  | { readonly kind: 'task'; readonly task: GuideTask | null }

export interface GuideOption {
  readonly id: string
  readonly kind: OptionKind
  /** Verb first, plain words. */
  readonly label: string
  /** What pressing does, in one line. */
  readonly consequence: string
  /** The term whose Kiro word is shown beside the label when Kiro's words are on. */
  readonly term: TermId | null
  readonly steps: readonly PressStep[]
}

export interface GuideContext {
  readonly roomId: RoomId
  /** The surface on top, or null in the bare room. */
  readonly surface: HouseSurfaceTarget | null
  readonly task: GuideTask | null
  readonly quiet: boolean
  readonly words: WordMode
  /** Whether the labels of the working objects are on show. */
  readonly reveal: boolean
  /** Whether the map of the whole house lies over the room. */
  readonly mapOpen: boolean
  /** False on a page that cannot leave the Mansion. */
  readonly canLeave: boolean
}

export interface GuideView {
  /** What is true now. */
  readonly status: string
  readonly statusKind: StatusKind
  /** Terms the status line names; each gets a "What is this?". */
  readonly terms: readonly TermId[]
  /**
   * Sentences of the house quoted unchanged in the status line: a locked
   * room's own text, what a risky action or a Crew tool prompt says, a
   * ghost's safe reason. They are the house's words, not the guide's.
   */
  readonly quotes: readonly string[]
  /** Why some things are not offered: the room's own sentence, or null while everything is. */
  readonly note: string | null
  readonly question: typeof GUIDE_QUESTION
  /** At most four, the most likely next step first. */
  readonly options: readonly GuideOption[]
  /** Every option of this view, the ones above included. */
  readonly everything: readonly GuideOption[]
  readonly pose: WardenPose
  readonly poseLabel: string
  /** The room before this one in Room order, or null at the Foyer. */
  readonly previous: { readonly roomId: RoomId; readonly name: string } | null
  /** The room after this one in Room order, or null at the last. */
  readonly next: { readonly roomId: RoomId; readonly name: string } | null
}

// ---------------------------------------------------------------------------
// Bounded text.

function clip(text: string, limit: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
  const characters = Array.from(flat)
  return characters.length <= limit ? flat : `${characters.slice(0, limit - 1).join('').trimEnd()}…`
}

/** A name short enough to sit inside a label with words around it. */
function shortName(name: string): string {
  return clip(name, 36) || 'a ghost'
}

/** The house's own role names read as nouns: "the Archivist". Any other name stays as it is: "Tinker 2", "Mabel". */
const ROLE_NOUNS: ReadonlySet<string> = new Set(['Archivist', 'Draughtsman', 'Foreman', 'Tinker', 'Medium'])

function theGhost(name: string): string {
  const short = shortName(name)
  return ROLE_NOUNS.has(short) ? `the ${short}` : short
}

/** A quoted upstream reason, ended like a sentence if it was not. */
function asSentence(text: string): string {
  const flat = text.trim()
  return flat === '' || /[.!?…]$/.test(flat) ? flat : `${flat}.`
}

function sentenceStart(text: string): string {
  return text === '' ? text : text[0].toUpperCase() + text.slice(1)
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// ---------------------------------------------------------------------------
// Fixed copy. `{…}` is a Word Book slot.

/** What each room is for. */
export const ROOM_PURPOSE_TEXT: Readonly<Record<RoomId, string>> = {
  foyer: 'This is the Foyer, the way in and out.',
  study: 'This is the Study. The Archivist writes {requirements} here.',
  'drafting-room': 'This is the Drafting Room. The Draughtsman works out {design} here.',
  workshop: 'This is the Workshop. The Foreman writes the {tasks}, and the Tinkers do {build}.',
  attic: 'This is the Attic. Everything that happened in this house is kept here.',
  'seance-room': 'This is the Séance Room, where finished work is checked.',
}

export const LOCKED_ROOM_TEXT = 'This room is locked.'
export const BUILT_TEXT = 'The house is built. Every door is open.'

interface PhaseCopy {
  readonly term: TermId
  /** Who does the work, to start a sentence. */
  readonly writer: string
  /** "has" or "have", to agree with the writer. */
  readonly has: string
  /** "It" or "They". */
  readonly it: string
  /** The work product inside a sentence. */
  readonly the: string
  readonly nothingYet: string
  readonly startLabel: string
  readonly startConsequence: string
  readonly readLabel: string
  readonly readAgainLabel: string
}

const PHASE_COPY: Readonly<Record<Phase, PhaseCopy>> = {
  requirements: {
    term: 'requirements',
    writer: 'The Archivist',
    has: 'has',
    it: 'It',
    the: '{requirements}',
    nothingYet: 'Nothing is written yet.',
    startLabel: 'Have the Archivist write {requirements}',
    startConsequence: 'The Archivist starts writing. Nothing opens until you say so.',
    readLabel: 'Read {requirements}',
    readAgainLabel: 'Read {requirements} again',
  },
  design: {
    term: 'design',
    writer: 'The Draughtsman',
    has: 'has',
    it: 'It',
    the: '{design}',
    nothingYet: 'Nothing is drawn yet.',
    startLabel: 'Have the Draughtsman work out {design}',
    startConsequence: 'The Draughtsman starts drawing. Nothing opens until you say so.',
    readLabel: 'Read {design}',
    readAgainLabel: 'Read {design} again',
  },
  tasks: {
    term: 'tasks',
    writer: 'The Foreman',
    has: 'has',
    it: 'It',
    the: 'the {tasks}',
    nothingYet: 'Nothing is written yet.',
    startLabel: 'Have the Foreman write the {tasks}',
    startConsequence: 'The Foreman starts writing. Nothing opens until you say so.',
    readLabel: 'Read the {tasks}',
    readAgainLabel: 'Read the {tasks} again',
  },
  implementation: {
    term: 'build',
    writer: 'The Tinkers',
    has: 'have',
    it: 'They',
    the: '{build}',
    nothingYet: 'Nothing is built yet.',
    startLabel: 'Build everything that is ready',
    startConsequence: 'Ticks each piece of work that can start, then starts it. Up to three Tinkers work at once.',
    readLabel: 'See what was built',
    readAgainLabel: 'See what was built again',
  },
}

/** The phase statuses for which the room offers an explicit start (Spec 4 `startView`). */
const START_STATUSES: ReadonlySet<string> = new Set(['ready', 'failed', 'revision_required'])
/** The build is started piece by piece, so it can also be started while it is under way. */
const BUILD_START_STATUSES: ReadonlySet<string> = new Set(['ready', 'working', 'failed', 'revision_required'])

const WORKING_VERB: Readonly<Partial<Record<RoomId, string>>> = { study: 'writing', 'drafting-room': 'drawing' }

/** Ready-made change requests, so "ask for a change" never starts at an empty field. */
export const READY_MADE_CHANGES: Readonly<Record<DocumentPhase, readonly { readonly label: string; readonly text: string }[]>> = {
  requirements: [
    { label: 'Ask for a shorter version', text: 'Make it shorter. Keep only what the first version needs.' },
    { label: 'Ask for an example in each one', text: 'Add one example to each point.' },
    { label: 'Ask for simpler words', text: 'Use simpler words.' },
  ],
  design: [
    { label: 'Ask for fewer parts', text: 'Make it simpler, with fewer parts.' },
    { label: 'Ask for one sentence on each part', text: 'Explain each part in one sentence.' },
    { label: 'Ask how each point is tested', text: 'Say how each point is tested.' },
  ],
  tasks: [
    { label: 'Ask for smaller steps', text: 'Split the large steps into smaller ones.' },
    { label: 'Ask for the most important first', text: 'Put the most important step first.' },
    { label: 'Ask to drop what can wait', text: 'Remove anything the first version does not need.' },
  ],
}

export const POSE_LABEL: Readonly<Record<Exclude<WardenPose, 'holding'>, string>> = {
  watching: 'The Warden is watching.',
  pointing: 'The Warden points to your next step.',
  'offering-key': 'The Warden holds out a key.',
  'stepped-back': 'The Warden has stepped back.',
}

function holdingLabel(name: string | null, count = 1): string {
  if (count > 1) return `The Warden is holding ${count} ghosts.`
  return name === null ? 'The Warden is holding a ghost.' : `The Warden is holding ${theGhost(name)}.`
}

// ---------------------------------------------------------------------------
// The situation: the one most pressing fact of a room.

type Situation =
  | { readonly kind: 'locked' }
  | { readonly kind: 'catch'; readonly item: WaitingItemView; readonly ghost: GhostPresentation | null }
  | { readonly kind: 'door-waiting'; readonly door: DoorPresentation }
  | { readonly kind: 'failed'; readonly ghosts: readonly GhostPresentation[]; readonly retry: RecoveryActionView | null }
  | { readonly kind: 'blocked'; readonly ghosts: readonly GhostPresentation[] }
  | { readonly kind: 'working'; readonly ghosts: readonly GhostPresentation[] }
  | { readonly kind: 'startable'; readonly door: DoorPresentation }
  | { readonly kind: 'door-open' }
  | { readonly kind: 'built' }
  | { readonly kind: 'room' }

/** The Door in front of the visitor: the first of the room that is not open, else the last. */
function currentDoor(room: RoomPresentation): DoorPresentation | null {
  return room.doors.find((door) => door.state !== 'open') ?? room.doors[room.doors.length - 1] ?? null
}

/** True when every phase Door of the house is open, and there is at least one. */
export function isBuilt(projection: HouseProjection): boolean {
  const doors = projection.rooms.flatMap((room) => room.doors)
  return doors.length > 0 && doors.every((door) => door.state === 'open')
}

function canStart(door: DoorPresentation): boolean {
  if (door.phaseStatus === null || door.state === 'open' || door.state === 'waiting') return false
  return (door.phase === 'implementation' ? BUILD_START_STATUSES : START_STATUSES).has(door.phaseStatus)
}

function proposalOf(item: WaitingItemView): string {
  return item.id.slice(item.id.indexOf(':') + 1)
}

function situationOf(room: RoomPresentation, projection: HouseProjection): Situation {
  if (room.locked) return { kind: 'locked' }
  const first = room.waitingItems.find((item) => item.status === 'pending' && item.actionAvailable)
  if (first !== undefined) {
    if (first.kind === 'door-decision') {
      const door = room.doors.find((candidate) => candidate.proposalId !== null && candidate.proposalId === proposalOf(first)) ?? room.doors.find((candidate) => candidate.state === 'waiting')
      if (door !== undefined) return { kind: 'door-waiting', door }
    }
    return { kind: 'catch', item: first, ghost: room.ghosts.find((ghost) => ghost.ghostId === first.ghostId) ?? null }
  }
  const inState = (state: string) => room.ghosts.filter((ghost) => ghost.state === state)
  const failed = inState('failed')
  if (failed.length > 0) return { kind: 'failed', ghosts: failed, retry: room.recoveryActions.find((action) => action.available) ?? null }
  const blocked = inState('blocked')
  if (blocked.length > 0) return { kind: 'blocked', ghosts: blocked }
  const working = inState('working')
  if (working.length > 0) return { kind: 'working', ghosts: working }
  const door = currentDoor(room)
  if (door !== null && canStart(door)) return { kind: 'startable', door }
  if (room.roomId !== 'attic' && isBuilt(projection)) return { kind: 'built' }
  if (room.doors.length > 0 && room.doors.every((candidate) => candidate.state === 'open')) return { kind: 'door-open' }
  return { kind: 'room' }
}

/** The room of the phase after the last Door of this room, or null. */
function roomAfter(room: RoomPresentation, projection: HouseProjection): RoomPresentation | null {
  const index = projection.rooms.findIndex((candidate) => candidate.roomId === room.roomId)
  return projection.rooms.slice(index + 1).find((candidate) => candidate.doors.length > 0) ?? null
}

// ---------------------------------------------------------------------------
// The status line.

/**
 * A sentence of the guide's with the house's own words still to be put in.
 * `template` holds Word Book slots and numbered places (`⟦0⟧`); `values` are
 * what goes in those places, unchanged. The book fills the template first, so
 * a name or a quoted sentence that happens to hold "{…}" is shown as written.
 */
interface StatusLine {
  readonly template: string
  readonly values: readonly string[]
}

function line(template: string, ...values: string[]): StatusLine {
  return { template, values }
}

function compose(status: StatusLine, words: WordMode): string {
  return write(status.template, words).replace(/⟦(\d)⟧/g, (_whole, place: string) => status.values[Number(place)] ?? '')
}

function statusLine(room: RoomPresentation, projection: HouseProjection, situation: Situation, surface: HouseSurfaceTarget | null): StatusLine {
  switch (situation.kind) {
    case 'locked':
      return line('⟦0⟧', room.diagnostic ?? LOCKED_ROOM_TEXT)
    case 'catch': {
      if (situation.item.kind !== 'risky-decision') return line('⟦0⟧', situation.item.label)
      const name = situation.ghost === null ? 'A ghost' : sentenceStart(theGhost(situation.ghost.name))
      return line('⟦0⟧ is held. ⟦1⟧ Nothing runs until you decide.', name, situation.item.label)
    }
    case 'door-waiting': {
      const copy = PHASE_COPY[situation.door.phase]
      if (surface !== null && surface.kind === 'door' && surface.phase === situation.door.phase) {
        return line(`You are at the door. Opening it accepts this version of ${copy.the}.`)
      }
      return line(`${copy.writer} ${copy.has} finished ${copy.the}. The door waits for you.`)
    }
    case 'failed': {
      const names = sentenceStart(listed(situation.ghosts.map((ghost) => theGhost(ghost.name))))
      const only = situation.ghosts.length === 1 ? situation.ghosts[0] : null
      const reason = only === null || only.reason === null ? '' : ` ${asSentence(only.reason)}`
      // "It" only when the run that can be tried again is the failed ghost's own.
      const again = situation.retry === null ? '' : only !== null && situation.retry.ghostId === only.ghostId ? ' It can be tried again.' : ' A failed run can be tried again.'
      return line(`⟦0⟧ failed.⟦1⟧${again}`, names, reason)
    }
    case 'blocked': {
      const names = sentenceStart(listed(situation.ghosts.map((ghost) => theGhost(ghost.name))))
      const only = situation.ghosts.length === 1 ? situation.ghosts[0] : null
      const reason = only === null || only.reason === null ? '' : ` ${asSentence(only.reason)}`
      return line(`⟦0⟧ ${situation.ghosts.length === 1 ? 'is' : 'are'} held.⟦1⟧`, names, reason)
    }
    case 'working': {
      const names = sentenceStart(listed(situation.ghosts.map((ghost) => theGhost(ghost.name))))
      const verb = WORKING_VERB[room.roomId] ?? 'at work'
      const shut = room.doors.some((candidate) => candidate.state !== 'open')
      const door = !shut ? '' : room.doors.length === 1 ? ' This door stays shut until you open it.' : ' The door stays shut until you open it.'
      return line(`⟦0⟧ ${situation.ghosts.length === 1 ? 'is' : 'are'} ${verb}.${door}`, names)
    }
    case 'startable': {
      const copy = PHASE_COPY[situation.door.phase]
      switch (situation.door.phaseStatus) {
        case 'failed':
          return line(`${copy.writer} could not start. ${copy.it} can be started again.`)
        case 'revision_required':
          return line(`The door was kept shut. ${copy.writer} can write a new version of ${copy.the}.`)
        case 'working':
          return line('{Build} is under way. Anything that is ready can be started.')
        default:
          return line(situation.door.phase === 'implementation' ? `The {tasks} is settled. ${copy.nothingYet}` : `${ROOM_PURPOSE_TEXT[room.roomId]} ${copy.nothingYet}`)
      }
    }
    case 'door-open': {
      const next = roomAfter(room, projection)
      return next === null ? line('This door is open.') : line('This door is open. The ⟦0⟧ is next.', next.name)
    }
    case 'built':
      return line(BUILT_TEXT)
    case 'room':
      return line(ROOM_PURPOSE_TEXT[room.roomId])
  }
}

/** The house's own sentences that the status line of a situation quotes. */
function quotesOf(room: RoomPresentation, situation: Situation): string[] {
  switch (situation.kind) {
    case 'locked':
      return room.diagnostic === null ? [] : [room.diagnostic]
    case 'catch':
      return [situation.item.label]
    case 'failed':
    case 'blocked': {
      const reason = situation.ghosts.length === 1 ? situation.ghosts[0].reason : null
      return reason === null ? [] : [reason]
    }
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// The pose.

/**
 * How he stands. He points only where the room's state is confirmed: a room
 * whose controls are off for doubt has no next step to point at. A recording
 * is whole, so there he stands as he did when it was made.
 */
function poseOf(situation: Situation, quiet: boolean, confirmed: boolean): { readonly pose: WardenPose; readonly label: string } {
  if (quiet) return { pose: 'stepped-back', label: POSE_LABEL['stepped-back'] }
  const pointing = confirmed ? { pose: 'pointing' as const, label: POSE_LABEL.pointing } : { pose: 'watching' as const, label: POSE_LABEL.watching }
  switch (situation.kind) {
    case 'catch':
      return { pose: 'holding', label: holdingLabel(situation.ghost?.name ?? null) }
    case 'blocked':
      return { pose: 'holding', label: holdingLabel(situation.ghosts.length === 1 ? situation.ghosts[0].name : null, situation.ghosts.length) }
    case 'door-waiting':
      return { pose: 'offering-key', label: POSE_LABEL['offering-key'] }
    case 'failed':
      return situation.retry === null ? { pose: 'watching', label: POSE_LABEL.watching } : pointing
    case 'startable':
    case 'door-open':
    case 'built':
      return pointing
    case 'locked':
    case 'working':
    case 'room':
      return { pose: 'watching', label: POSE_LABEL.watching }
  }
}

/** How the Warden stands in a room, and the words that say so. */
export function wardenPose(room: RoomPresentation, projection: HouseProjection, quiet: boolean): { readonly pose: WardenPose; readonly label: string } {
  const result = poseOf(situationOf(room, projection), quiet, room.integrity === 'valid')
  return { pose: result.pose, label: clip(result.label, MAX_OPTION_LABEL_CODE_POINTS) }
}

// ---------------------------------------------------------------------------
// The room a Mansion opens on.

/**
 * Where the work is: the room of the first thing that needs the visitor, else
 * the room of the earliest phase whose Door is not open, else the Attic.
 */
export function landingRoom(projection: HouseProjection): RoomId {
  const needs = projection.needsYou[0]
  if (needs !== undefined && projection.rooms.some((room) => room.roomId === needs.roomId)) return needs.roomId
  const unfinished = projection.rooms.find((room) => room.doors.some((door) => door.state !== 'open'))
  if (unfinished !== undefined) return unfinished.roomId
  return projection.rooms.find((room) => room.roomId === 'attic')?.roomId ?? projection.rooms[0]?.roomId ?? 'foyer'
}

// ---------------------------------------------------------------------------
// Options.

const HEADING: PressFocus = { kind: 'heading' }

/** One option. `label` and `consequence` are final text: a template of the guide's is filled with `plain` first. */
function make(id: string, kind: OptionKind, label: string, consequence: string, steps: readonly PressStep[], term: TermId | null = null): GuideOption {
  return { id, kind, label: clip(label, MAX_OPTION_LABEL_CODE_POINTS), consequence: clip(consequence, MAX_CONSEQUENCE_CODE_POINTS), term, steps }
}

/** A label of the guide's own, with its Word Book slots filled in plain words. Labels are always plain. */
function plain(template: string): string {
  return write(template, 'plain')
}

function roomTarget(roomId: RoomId): HouseSurfaceTarget {
  return { kind: 'room', roomId }
}

function sameSurface(left: HouseSurfaceTarget | null, right: HouseSurfaceTarget): boolean {
  if (left === null || left.kind !== right.kind || left.roomId !== right.roomId) return false
  if (left.kind === 'ghost' && right.kind === 'ghost') return left.ghostId === right.ghostId
  if (left.kind === 'door' && right.kind === 'door') return left.phase === right.phase
  return true
}

/** The step that opens a room's sheet, left out when that sheet is already on show. */
function openRoom(context: GuideContext, roomId: RoomId, focus: PressFocus = HEADING): PressStep[] {
  return sameSurface(context.surface, roomTarget(roomId)) ? [] : [{ kind: 'map', target: roomTarget(roomId), focus }]
}

function isDocumentPhase(phase: Phase): phase is DocumentPhase {
  return phase !== 'implementation'
}

interface Build {
  readonly projection: HouseProjection
  readonly room: RoomPresentation
  readonly context: GuideContext
  readonly situation: Situation
}

function goTo(roomId: RoomId, name: string): GuideOption {
  return make(`go:${roomId}`, 'go', `Go to the ${name}`, `Opens the ${name}. Nothing there changes.`, [{ kind: 'map', target: roomTarget(roomId), focus: HEADING }])
}

function lookAround(room: RoomPresentation): GuideOption {
  return make('look', 'look', `Look around the ${room.name}`, "Opens this room's sheet. Nothing changes.", [{ kind: 'map', target: roomTarget(room.roomId), focus: HEADING }])
}

function closeSheet(): GuideOption {
  return make('close', 'look', 'Close this sheet', 'Puts the sheet away and shows the room.', [{ kind: 'shell', action: 'close' }])
}

function lowerFirst(text: string): string {
  return text === '' ? text : text[0].toLowerCase() + text.slice(1)
}

function startOption(build: Build, door: DoorPresentation): GuideOption {
  const copy = PHASE_COPY[door.phase]
  const open = openRoom(build.context, build.room.roomId)
  if (door.phase === 'implementation') {
    return make('build-all', 'start', plain(copy.startLabel), copy.startConsequence, [...open, { kind: 'every', keyPrefix: 'task:' }, { kind: 'control', key: 'start-workshop' }], copy.term)
  }
  const label =
    door.phaseStatus === 'failed' ? `Try ${lowerFirst(copy.writer)} again` : door.phaseStatus === 'revision_required' ? `Have ${lowerFirst(copy.writer)} write a new version` : plain(copy.startLabel)
  return make(`start:${door.phase}`, 'start', label, copy.startConsequence, [...open, { kind: 'control', key: `start:${door.phase}` }], copy.term)
}

function readOption(build: Build, door: DoorPresentation, again: boolean): GuideOption {
  const copy = PHASE_COPY[door.phase]
  return make(
    `read:${door.phase}`,
    'look',
    plain(again ? copy.readAgainLabel : copy.readLabel),
    "Opens this room's sheet with the work on it. Nothing is decided.",
    [{ kind: 'map', target: roomTarget(build.room.roomId), focus: HEADING }],
    copy.term,
  )
}

function askOption(build: Build, phase: DocumentPhase): GuideOption {
  const copy = PHASE_COPY[phase]
  return make(
    `ask:${phase}`,
    'ask',
    'Ask for a change',
    `Opens one note to ${lowerFirst(copy.writer)}. The door stays shut.`,
    [...openRoom(build.context, build.room.roomId), { kind: 'control', key: `revise:${phase}` }, { kind: 'task', task: { kind: 'revise', phase, filled: false } }],
    'revise',
  )
}

function goToDoor(build: Build, door: DoorPresentation): GuideOption {
  const focus: PressFocus = door.proposalId === null ? HEADING : { kind: 'proposal', proposalId: door.proposalId }
  return make(
    `door:${door.phase}`,
    'look',
    'Go to the door',
    'Shows exactly what you would be accepting. Nothing is decided yet.',
    [{ kind: 'map', target: { kind: 'door', roomId: build.room.roomId, phase: door.phase, proposalId: door.proposalId }, focus }],
  )
}

function approveOption(proposalId: string): GuideOption {
  return make(`approve:${proposalId}`, 'decide', 'Open the door', 'Accepts this version. The next step can then be started.', [{ kind: 'control', key: `approve:${proposalId}` }], 'approve')
}

function rejectOption(proposalId: string): GuideOption {
  return make(`reject:${proposalId}`, 'decide', 'Keep the door shut', 'Turns this version down. A new version will be needed.', [{ kind: 'control', key: `reject:${proposalId}` }], 'reject')
}

/** True when the surface on show holds the decision controls of this Door: its own surface, or its room's sheet. */
function doorDecisionShown(context: GuideContext, room: RoomPresentation, door: DoorPresentation): boolean {
  const surface = context.surface
  if (surface === null || surface.roomId !== room.roomId) return false
  return surface.kind === 'room' || (surface.kind === 'door' && surface.phase === door.phase)
}

function taskOptions(task: GuideTask): GuideOption[] {
  const writeOwn = make('write-own', 'ask', 'Write my own', 'Puts the cursor in the note so you can type it.', [{ kind: 'focus', key: `revise-text:${task.phase}` }], 'revise')
  if (task.filled) {
    return [
      make(
        'send-change',
        'ask',
        'Send this change',
        'Sends the note once. A new version is written and the door stays shut.',
        [{ kind: 'control', key: `revise-send:${task.phase}` }, { kind: 'task', task: null }],
        'revise',
      ),
      make('ask-other', 'ask', 'Choose a different change', 'Shows the ready-made changes again. Nothing is sent.', [{ kind: 'task', task: { ...task, filled: false } }], 'revise'),
      writeOwn,
    ]
  }
  return [
    ...READY_MADE_CHANGES[task.phase].map((change, index) =>
      make(
        `ready:${index}`,
        'ask',
        change.label,
        `Writes this in the note: ${change.text}`,
        [{ kind: 'fill', key: `revise-text:${task.phase}`, text: change.text }, { kind: 'task', task: { ...task, filled: true } }],
        'revise',
      ),
    ),
    writeOwn,
  ]
}

function replayOptions(): GuideOption[] {
  return [
    make('replay-toggle', 'play', 'Play or pause the recording', 'The house fills in as it did when this was recorded.', [{ kind: 'control', key: 'replay:toggle' }]),
    make('replay-restart', 'play', 'Play it from the start', 'Goes back to the empty house.', [{ kind: 'control', key: 'replay:restart' }]),
  ]
}

function atticOptions(context: GuideContext): GuideOption[] {
  if (context.surface !== null && context.surface.roomId === 'attic') {
    return [
      make('attic-toggle', 'play', 'Play or pause here in the Attic', 'Plays back what happened in this house, step by step.', [{ kind: 'control', key: 'attic:toggle' }]),
      make('attic-next', 'play', 'Step forward once', 'Shows the next thing that happened.', [{ kind: 'control', key: 'attic:next' }]),
    ]
  }
  const open: PressStep = { kind: 'map', target: roomTarget('attic'), focus: HEADING }
  return [
    make('attic-watch', 'play', 'Watch how this house was built', 'Opens the Attic and plays back what happened.', [open, { kind: 'control', key: 'attic:toggle' }]),
    make('attic-step', 'look', 'Step through it myself', 'Opens the Attic with its list of everything that happened.', [open]),
  ]
}

function builtOption(): GuideOption {
  return make('built', 'look', 'See what was made', 'Lists what now exists, with its real file names and where it is kept.', [{ kind: 'map', target: roomTarget('foyer'), focus: { kind: 'section', section: 'built' } }])
}

/**
 * Everything the situation could offer, most likely next step first, as if
 * every control were on. `guideView` then takes out what the room does not
 * allow, so a recording and a live house differ only by that.
 */
function situationOptions(build: Build): GuideOption[] {
  const { room, context, situation, projection } = build
  const surface = context.surface
  const sheetOpen = surface !== null && surface.roomId === room.roomId && surface.kind === 'room'
  const hasAttic = projection.rooms.some((candidate) => candidate.roomId === 'attic')

  // In the middle of asking for a change: the ready-made texts, not the room's usual choices.
  const task = context.task
  const revisable = (door: DoorPresentation) => door.state !== 'open' && (door.state === 'waiting' || door.phaseStatus === 'waiting' || door.phaseStatus === 'revision_required')
  if (task !== null && sheetOpen && room.doors.some((door) => door.phase === task.phase && revisable(door))) return taskOptions(task)

  switch (situation.kind) {
    case 'locked':
      return []
    case 'catch': {
      if (situation.item.kind !== 'risky-decision') return []
      const proposalId = proposalOf(situation.item)
      if (sheetOpen) {
        return [
          make(`allow:${proposalId}`, 'decide', 'Allow it once', 'Lets this one action run, once. It cannot be reused.', [{ kind: 'control', key: `approve:${proposalId}` }], 'approve'),
          make(`refuse:${proposalId}`, 'decide', 'Refuse it', 'The action does not run.', [{ kind: 'control', key: `reject:${proposalId}` }], 'reject'),
        ]
      }
      return [
        make(`see-asked:${proposalId}`, 'look', 'See exactly what it asked', 'Shows the whole action and what it may touch. Nothing is decided yet.', [
          { kind: 'map', target: roomTarget(room.roomId), focus: { kind: 'proposal', proposalId } },
        ]),
      ]
    }
    case 'door-waiting': {
      const door = situation.door
      const ask = isDocumentPhase(door.phase) ? [askOption(build, door.phase)] : []
      if (door.proposalId !== null && doorDecisionShown(context, room, door)) return [approveOption(door.proposalId), ...ask, readOption(build, door, true)]
      return [readOption(build, door, false), ...ask, goToDoor(build, door)]
    }
    case 'failed': {
      const first = situation.ghosts[0]
      const see = make(`see-ghost:${first.ghostId}`, 'look', 'See what went wrong', "Opens the ghost's details. Nothing changes.", [{ kind: 'map', target: { kind: 'ghost', roomId: room.roomId, ghostId: first.ghostId }, focus: HEADING }])
      if (situation.retry === null) return [see]
      const retried = room.ghosts.find((ghost) => ghost.ghostId === situation.retry?.ghostId)
      const again = make(
        `retry:${situation.retry.runId}`,
        'start',
        retried === undefined ? 'Try the failed run again' : `Try ${theGhost(retried.name)} again`,
        'Starts a fresh attempt. The failed one is kept in the record.',
        [...openRoom(context, room.roomId), { kind: 'control', key: `retry:${situation.retry.runId}` }],
      )
      return [again, see]
    }
    case 'blocked': {
      const first = situation.ghosts[0]
      return [
        make(`see-ghost:${first.ghostId}`, 'look', `See why ${theGhost(first.name)} is held`, "Opens the ghost's details. Nothing changes.", [
          { kind: 'map', target: { kind: 'ghost', roomId: room.roomId, ghostId: first.ghostId }, focus: HEADING },
        ]),
      ]
    }
    case 'working':
      return [make('watch', 'look', `Watch ${listed(situation.ghosts.map((ghost) => theGhost(ghost.name)))} work`, "Opens this room's sheet. Nothing changes.", [{ kind: 'map', target: roomTarget(room.roomId), focus: HEADING }])]
    case 'startable': {
      const start = startOption(build, situation.door)
      if (situation.door.phase !== 'implementation') return [start]
      return [start, make('choose-work', 'look', 'Choose what to build myself', "Opens the Workshop's list so you can tick the work yourself.", [{ kind: 'map', target: roomTarget(room.roomId), focus: HEADING }])]
    }
    case 'door-open': {
      const next = roomAfter(room, projection)
      const door = currentDoor(room)
      return [...(next === null ? [] : [goTo(next.roomId, next.name)]), ...(door === null ? [] : [readOption(build, door, true)])]
    }
    case 'built':
      return [builtOption(), ...(hasAttic ? atticOptions({ ...context, surface: null }).slice(0, 1) : [])]
    case 'room':
      return room.roomId === 'attic' ? atticOptions(context) : []
  }
}

function settingOptions(context: GuideContext): GuideOption[] {
  return [
    context.mapOpen
      ? make('map', 'setting', 'Put the house map away', 'Shows the room again.', [{ kind: 'shell', action: 'map' }])
      : make('map', 'setting', 'See the whole house', 'Lays the map of every room over this one.', [{ kind: 'shell', action: 'map' }]),
    context.words === 'with-kiro'
      ? make('words', 'setting', "Hide Kiro's words", 'Shows the everyday words alone.', [{ kind: 'shell', action: 'kiro-words' }])
      : make('words', 'setting', "Show Kiro's words", 'Puts the word Kiro uses beside each everyday word.', [{ kind: 'shell', action: 'kiro-words' }]),
    context.reveal
      ? make('reveal', 'setting', 'Hide the labels', 'Takes the labels off the things in the room.', [{ kind: 'shell', action: 'reveal' }])
      : make('reveal', 'setting', 'Show me what I can press', 'Labels every working thing in the room. The ? key does the same.', [{ kind: 'shell', action: 'reveal' }]),
  ]
}

function unique(options: readonly GuideOption[]): GuideOption[] {
  const seen = new Set<string>()
  const out: GuideOption[] = []
  for (const option of options) {
    if (seen.has(option.id)) continue
    seen.add(option.id)
    out.push(option)
  }
  return out
}

/** True for an option that would only open the surface already on show. */
function opensWhatIsOpen(option: GuideOption, surface: HouseSurfaceTarget | null): boolean {
  if (option.steps.length !== 1) return false
  const step = option.steps[0]
  return step.kind === 'map' && step.focus.kind === 'heading' && sameSurface(surface, step.target)
}

/** True for an option that only opens the sheet of this room. */
function onlyOpensSheet(option: GuideOption, roomId: RoomId): boolean {
  if (option.steps.length !== 1) return false
  const step = option.steps[0]
  return step.kind === 'map' && step.target.kind === 'room' && step.target.roomId === roomId
}

/**
 * What the Warden says and offers in one room. Total and pure: the same
 * projection and context give the same view, and nothing is changed. Null only
 * for a room the house does not show.
 */
export function guideView(projection: HouseProjection, context: GuideContext): GuideView | null {
  const index = projection.rooms.findIndex((room) => room.roomId === context.roomId)
  if (index < 0) return null
  const room = projection.rooms[index]
  const situation = situationOf(room, projection)
  const live = projection.mode === 'live'
  // A start, a decision or a change request is offered only where the room itself allows one.
  const canAct = live && room.mutatingActionsEnabled && !room.readOnly && !room.locked
  const build: Build = { projection, room, context, situation }
  const beside = (candidate: RoomPresentation | undefined) => (candidate === undefined ? null : { roomId: candidate.roomId, name: candidate.name })

  const surface = context.surface
  const here = surface !== null && surface.roomId === room.roomId
  const landing = landingRoom(projection)
  const landingName = projection.rooms.find((candidate) => candidate.roomId === landing)?.name ?? ''
  const built = isBuilt(projection)
  const allowed = (options: readonly GuideOption[]) => options.filter((option) => (canAct || !MUTATING_OPTION_KINDS.includes(option.kind)) && !opensWhatIsOpen(option, surface))

  const forSituation = allowed(situationOptions(build))
  const showsSheet = forSituation.some((option) => onlyOpensSheet(option, room.roomId))
  const rejecting = situation.kind === 'door-waiting' && situation.door.proposalId !== null && doorDecisionShown(context, room, situation.door) ? [rejectOption(situation.door.proposalId)] : []

  // The most likely next step first, then where the work is, then ways to look around.
  const primary = unique(
    allowed([
      ...(live ? [] : replayOptions()),
      ...forSituation,
      ...(here ? [closeSheet()] : []),
      ...(landing !== room.roomId && landingName !== '' ? [goTo(landing, landingName)] : []),
      ...(surface === null && !room.locked && room.roomId !== 'attic' && !showsSheet ? [lookAround(room)] : []),
      ...(built ? [builtOption()] : []),
      ...settingOptions(context).slice(0, 1),
    ]),
  )

  const everything = unique(
    allowed([
      ...primary,
      ...rejecting,
      ...projection.rooms.filter((candidate) => candidate.roomId !== room.roomId).map((candidate) => goTo(candidate.roomId, candidate.name)),
      ...(projection.needsYou.length === 0 ? [] : [make('needs-you', 'go', 'Go to what needs you', 'Opens the first room where something waits for you.', [{ kind: 'shell', action: 'needs-you' }])]),
      ...settingOptions(context),
      ...(context.canLeave ? [make('exit', 'leave', 'Leave this house', 'Goes back to the Foyer hall. Nothing here stops.', [{ kind: 'shell', action: 'exit' }])] : []),
    ]),
  )

  const status = statusLine(room, projection, situation, surface)
  const pose = poseOf(situation, context.quiet, room.integrity === 'valid')
  return {
    status: clip(compose(status, context.words), MAX_STATUS_CODE_POINTS),
    statusKind: situation.kind,
    terms: termsIn(status.template),
    quotes: quotesOf(room, situation),
    // For a live room whose controls are off for doubt. A read-only house says what it is once, beside the room
    // (the recording's bar, or the house's own note), so the balloon does not say it again.
    note: live && !canAct && !room.readOnly && room.diagnostic !== null && situation.kind !== 'locked' ? room.diagnostic : null,
    question: GUIDE_QUESTION,
    options: primary.slice(0, MAX_PRIMARY_OPTIONS),
    everything,
    pose: pose.pose,
    poseLabel: clip(pose.label, MAX_OPTION_LABEL_CODE_POINTS),
    previous: beside(projection.rooms[index - 1]),
    next: beside(projection.rooms[index + 1]),
  }
}

// ---------------------------------------------------------------------------
// The Caretaker's words. Still read by the room view until it shows the Warden
// (task 7.3 of the spec removes this block and its tests).

export interface LegacyGuideView {
  readonly text: string
  readonly previous: { readonly roomId: RoomId; readonly name: string } | null
  readonly next: { readonly roomId: RoomId; readonly name: string } | null
}

export const ROOM_GUIDE_TEXT: Readonly<Record<RoomId, string>> = {
  foyer: 'This is the Foyer, the way in and out. The rooms open off it in the order the work is done.',
  study: 'This is the Study. The Archivist writes the requirements here.',
  'drafting-room': 'This is the Drafting Room. The Draughtsman turns the requirements into a design here.',
  workshop: 'This is the Workshop. The Foreman plans the tasks and the Tinkers build them.',
  attic: 'This is the Attic. It keeps the recording of everything that happened, ready to play back.',
  'seance-room': 'This is the Séance Room, where finished work is reviewed.',
}

/** What the Caretaker says about one room, most pressing thing first. */
export function guideText(room: RoomPresentation): string {
  if (room.locked) return room.diagnostic ?? 'This room is locked.'
  const waiting = room.waitingItems.length
  if (waiting > 0) {
    return waiting === 1 ? "One thing in this room is waiting for you. It is on this room's sheet." : `${waiting} things in this room are waiting for you. They are on this room's sheet.`
  }
  const inState = (state: string) => room.ghosts.filter((ghost) => ghost.state === state).map((ghost) => ghost.name)
  const failed = inState('failed')
  if (failed.length > 0) return `${listed(failed)} ${failed.length === 1 ? 'has' : 'have'} failed. This room's sheet says why.`
  const blocked = inState('blocked')
  if (blocked.length > 0) return `${listed(blocked)} ${blocked.length === 1 ? 'is' : 'are'} blocked. This room's sheet says why.`
  const working = inState('working')
  if (working.length > 0) return `${listed(working)} ${working.length === 1 ? 'is' : 'are'} at work. A door opens only when you approve it.`
  return ROOM_GUIDE_TEXT[room.roomId]
}

export function guideFor(projection: HouseProjection, roomId: RoomId): LegacyGuideView | null {
  const index = projection.rooms.findIndex((room) => room.roomId === roomId)
  if (index < 0) return null
  const beside = (room: RoomPresentation | undefined) => (room === undefined ? null : { roomId: room.roomId, name: room.name })
  return { text: guideText(projection.rooms[index]), previous: beside(projection.rooms[index - 1]), next: beside(projection.rooms[index + 1]) }
}
