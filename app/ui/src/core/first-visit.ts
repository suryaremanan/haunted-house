// The first visit (Spec 8, Requirements 9 and 10): the front gate, the name,
// the idea, and where the visitor stands at each moment. One decision per
// screen: knock, then say what to build.
//
// Nothing is remembered between visits. The name and the place live in page
// state, the same way Still House does, and are gone on reload. Whether this
// is a first visit is read from the mansion list: a live page that already
// holds a mansion has been used before.
//
// This module starts no request and opens nothing. Entering a mansion is
// always the Foyer's own action; the reducer only learns that it happened.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import type { WardenPose } from './house-guide'
import { MAX_MANSION_NAME_LENGTH, isMansionName } from './mansion-api'

// ---------------------------------------------------------------------------
// The visitor's name.

export const MAX_VISITOR_NAME_CODE_POINTS = 40

/** The two joiners some scripts and emoji need inside a word. They are kept there; every other invisible character goes. */
const JOINERS = String.fromCodePoint(0x200c, 0x200d)
/** Letters that draw nothing. A name made only of them is no name, so they count as spaces. */
const BLANK_LETTERS = String.fromCodePoint(0x115f, 0x1160, 0x3164, 0xffa0, 0x2800)
/** Control, format, private-use and unassigned characters, except the two joiners. */
const UNSEEN = new RegExp(`[^${JOINERS}\\P{C}]+`, 'gu')
const BLANKS = new RegExp(`[${BLANK_LETTERS}\\s]+`, 'u')
const JOINERS_AT_EDGE = new RegExp(`^[${JOINERS}]+|[${JOINERS}]+$`, 'gu')
const LEFT_AT_THE_CUT = new RegExp(`[${JOINERS} ]+$`, 'u')

/**
 * The name as it is shown: one line, no control or formatting character, at
 * most 40 code points. A name is someone's own, so it is changed as little as
 * that allows: a joiner between two letters stays, because some scripts and
 * emoji are written with one. Normalising a normalised name changes nothing.
 * The name is only ever rendered as text; it is sent and stored nowhere.
 */
export function visitorName(raw: string): string {
  const words = raw
    .replace(UNSEEN, ' ')
    .split(BLANKS)
    .map((word) => word.replace(JOINERS_AT_EDGE, ''))
    .filter((word) => word !== '')
  return Array.from(words.join(' ')).slice(0, MAX_VISITOR_NAME_CODE_POINTS).join('').replace(LEFT_AT_THE_CUT, '')
}

export const NAMELESS_GREETING = 'Come in.'

/** What the Warden says to a visitor who knocked. */
export function greeting(name: string): string {
  return name === '' ? NAMELESS_GREETING : `Come in, ${name}.`
}

// ---------------------------------------------------------------------------
// Ideas and the mansion name of an idea.

export interface ExampleIdea {
  /** The mansion name it gets when that name is free. */
  readonly name: string
  readonly title: string
  /** The idea in full: what goes to the Archivist. */
  readonly brief: string
}

/** Small on purpose: each can be written, built and checked in one sitting. */
export const EXAMPLE_IDEAS: readonly ExampleIdea[] = [
  {
    name: 'word-counter',
    title: 'A word counter',
    brief: 'A command-line tool that counts the lines, words and characters in a text file. Keep it small: one file of Python and its tests.',
  },
  {
    name: 'to-do-list',
    title: 'A to-do list',
    brief: 'A command-line to-do list that adds, lists and completes items and saves them to a file. Keep it small: one file of Python and its tests.',
  },
  {
    name: 'unit-converter',
    title: 'A unit converter',
    brief: 'A command-line tool that converts kilometres to miles, kilograms to pounds, and Celsius to Fahrenheit, and back. Keep it small: one file of Python and its tests.',
  },
]

export const FALLBACK_MANSION_NAME = 'my-house'
/** A name made from an idea is kept short; whole words up to this many characters. */
export const MAX_IDEA_NAME_LENGTH = 24

/** Words that open a request and say nothing about the idea: "I want to build a …". Dropped from the front only. */
const OPENERS: ReadonlySet<string> = new Set(['i', 'we', 'id', 'want', 'need', 'would', 'like', 'please', 'to', 'build', 'make', 'create', 'write', 'me', 'us', 'lets', 'let', 'just', 'can', 'you'])
const ARTICLES: ReadonlySet<string> = new Set(['a', 'an', 'the', 'some', 'my', 'our'])
/** Words a name stops at once it has two words: what follows describes the thing, it does not name it. */
const CONNECTORS: ReadonlySet<string> = new Set(['that', 'which', 'who', 'to', 'for', 'with', 'and', 'or', 'in', 'on', 'of', 'from', 'by', 'as', 'so', 'when', 'where', 'it', 'is'])
/** Latin letters that do not come apart into a plain letter and a mark. */
const PLAIN_LETTER: Readonly<Record<string, string>> = { ø: 'o', ß: 'ss', ł: 'l', đ: 'd', æ: 'ae', œ: 'oe', þ: 'th', ð: 'd', ı: 'i' }

/** The words of an idea as name parts: lower case, plain letters, a hyphen kept inside a word ("to-do"). */
function nameWords(idea: string): string[] {
  return idea
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[øßłđæœþðı]/g, (letter) => PLAIN_LETTER[letter] ?? letter)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter((word) => word !== '')
}

function baseName(idea: string): string {
  const words = nameWords(idea)
  let first = 0
  while (first < words.length && (OPENERS.has(words[first]) || ARTICLES.has(words[first]))) first += 1
  // An idea made only of such words keeps them as they are: something is better than nothing.
  const telling = first < words.length ? words.slice(first).filter((word) => !ARTICLES.has(word)) : words
  const parts: string[] = []
  const fits = (piece: string) => [...parts, piece].join('-').length <= MAX_IDEA_NAME_LENGTH
  for (const word of telling) {
    if (parts.length >= 2 && CONNECTORS.has(word)) break
    if (fits(word)) {
      parts.push(word)
      continue
    }
    // A word too long to fit whole gives as many of its own pieces as fit, and the name ends there.
    for (const piece of word.split('-')) {
      if (!fits(piece)) break
      parts.push(piece)
    }
    break
  }
  // A first piece longer than the limit is cut rather than dropped.
  const name = parts.length > 0 ? parts.join('-') : (telling[0] ?? '').split('-')[0].slice(0, MAX_IDEA_NAME_LENGTH)
  return isMansionName(name) ? name : FALLBACK_MANSION_NAME
}

/**
 * A mansion name for an idea: valid by the Mansion name rule, not one of
 * `taken`, and the same for the same inputs. `preferred` is the name of the
 * example the idea started from, if any: an example keeps its own name while
 * that is free, also after the visitor has changed its words.
 */
export function mansionNameFromIdea(idea: string, taken: ReadonlySet<string>, preferred: string | null = null): string {
  const example = EXAMPLE_IDEAS.find((candidate) => candidate.brief === idea.trim())?.name ?? null
  const wanted = preferred !== null && isMansionName(preferred) ? preferred : example
  const base = wanted ?? baseName(idea)
  if (!taken.has(base)) return base
  for (let count = 2; ; count += 1) {
    const suffix = `-${count}`
    const candidate = `${base.slice(0, MAX_MANSION_NAME_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

// ---------------------------------------------------------------------------
// Where the visitor stands.

export const VISIT_PLACES = ['loading', 'gate', 'hall', 'mansion'] as const
export type VisitPlace = (typeof VISIT_PLACES)[number]

export interface VisitState {
  readonly place: VisitPlace
  /** Empty until a name is given at the Gate, and again after stepping outside. */
  readonly visitorName: string
  /** True once the visitor came in through the Gate during this visit. */
  readonly firstTime: boolean
  /** Whether the hall is asking what to build. */
  readonly idea: boolean
  /** The page is the static replay: there is no history, so every load starts at the Gate. */
  readonly replay: boolean
  /** Where the visitor stood when a mansion opened, and so where leaving it returns them. */
  readonly cameFrom: 'gate' | 'hall'
}

export type VisitEvent =
  | { readonly type: 'list_loaded'; readonly mansionCount: number }
  | { readonly type: 'knocked'; readonly name: string }
  | { readonly type: 'stepped_outside' }
  | { readonly type: 'idea_opened' }
  | { readonly type: 'idea_closed' }
  | { readonly type: 'mansion_opened' }
  | { readonly type: 'mansion_left' }

export function initialVisit(replay: boolean): VisitState {
  return { place: 'loading', visitorName: '', firstTime: false, idea: false, replay, cameFrom: 'hall' }
}

/**
 * Moves the visitor. Only a knock leads from the Gate into the hall, only the
 * Foyer's own open reaches a mansion, and a live page that loads with a
 * mansion never shows the Gate unless the visitor steps outside. Leaving a
 * mansion returns the visitor to where they stood when it opened. An event
 * that does not apply changes nothing.
 */
export function visitReducer(state: VisitState, event: VisitEvent): VisitState {
  switch (event.type) {
    case 'list_loaded':
      if (state.place !== 'loading') return state
      return { ...state, place: event.mansionCount <= 0 || state.replay ? 'gate' : 'hall' }
    case 'knocked':
      if (state.place !== 'gate') return state
      // A recording has nothing to build, so it never asks.
      return { ...state, place: 'hall', visitorName: visitorName(event.name), firstTime: true, idea: !state.replay }
    case 'stepped_outside':
      if (state.place !== 'hall') return state
      return { ...state, place: 'gate', visitorName: '', firstTime: false, idea: false }
    case 'idea_opened':
      return state.place === 'hall' && !state.replay && !state.idea ? { ...state, idea: true } : state
    case 'idea_closed':
      return state.place === 'hall' && state.idea ? { ...state, idea: false } : state
    case 'mansion_opened':
      // An open asked for in the hall can land after the visitor stepped outside; leaving then returns them to the Gate.
      return state.place === 'loading' || state.place === 'mansion' ? state : { ...state, place: 'mansion', idea: false, cameFrom: state.place }
    case 'mansion_left':
      return state.place === 'mansion' ? { ...state, place: state.cameFrom } : state
  }
}

// ---------------------------------------------------------------------------
// The words at the Gate and in the hall.

export const GATE_STATUS = 'The house is shut.'
export const GATE_QUESTION = 'Who is knocking?'
export const GATE_NAME_HINT = 'A name is optional. It stays on this page and is forgotten when you leave.'
export const KNOCK_LABEL = 'Knock'
export const KNOCK_CONSEQUENCE = 'Opens the front door.'

export const IDEA_QUESTION = 'What do you want to build?'
export const IDEA_FIELD_LABEL = 'Your idea, in your own words'
export const IDEA_HINT = 'A sentence or two is enough. Pick an example to start from, or write your own.'
export const BUILD_LABEL = 'Build this'
export const EXAMPLE_CONSEQUENCE = 'Puts this idea in the box. You can change it before anything is made.'

export function buildConsequence(name: string): string {
  return `Makes the project folder ${name} and takes you inside. Nothing is written until you ask.`
}

export const HALL_QUESTION = 'What do you want to do?'

/** One thing the hall balloon offers. The page maps its id to the Foyer's own action. */
export interface HallOption {
  /** `enter:<mansion>`, `watch:<mansion>`, `build-new`, `name-myself` or `step-outside`. */
  readonly id: string
  readonly label: string
  readonly consequence: string
}

export interface HallGuideView {
  readonly status: string
  readonly question: string
  /** At most four. */
  readonly options: readonly HallOption[]
  readonly pose: WardenPose
  readonly poseLabel: string
}

export interface HallMansion {
  readonly name: string
  readonly status: string
}

const STEP_OUTSIDE: HallOption = { id: 'step-outside', label: 'Step outside', consequence: 'Shows the front gate again. Nothing is removed.' }

/**
 * What the Warden says in the hall. `invited` is the mansion the page invites
 * the visitor into (the static replay's recording), or null.
 */
export function hallGuide(state: VisitState, mansions: readonly HallMansion[], selected: string | null, invited: string | null): HallGuideView {
  const ready = mansions.filter((mansion) => mansion.status === 'ready')
  const hello = state.firstTime ? `${greeting(state.visitorName)} ` : ''
  const pointing = { pose: 'pointing' as const, poseLabel: 'The Warden points to your next step.' }
  const watching = { pose: 'watching' as const, poseLabel: 'The Warden is watching.' }

  if (state.replay) {
    const recorded = ready.find((mansion) => mansion.name === invited) ?? ready[0]
    if (recorded === undefined) return { status: `${hello}This house holds a recording, but it could not be read.`, question: HALL_QUESTION, options: [STEP_OUTSIDE], ...watching }
    return {
      status: `${hello}This house holds a recording of ${recorded.name} being built.`,
      question: HALL_QUESTION,
      options: [{ id: `watch:${recorded.name}`, label: `Watch ${recorded.name} get built`, consequence: 'Opens the recorded house. Nothing in a recording can be changed.' }, STEP_OUTSIDE],
      ...pointing,
    }
  }

  const chosen = ready.find((mansion) => mansion.name === selected) ?? (ready.length === 1 ? ready[0] : undefined)
  const enter: HallOption[] = chosen === undefined ? [] : [{ id: `enter:${chosen.name}`, label: `Go back into ${chosen.name}`, consequence: 'Opens it in the room where the work is.' }]

  if (state.idea) {
    return {
      status: `${hello}Nothing here opens unless you open it.`,
      question: IDEA_QUESTION,
      options: [...enter, { id: 'name-myself', label: 'Choose the name myself', consequence: 'Goes to the form below, where you name the mansion and describe it.' }, STEP_OUTSIDE],
      ...pointing,
    }
  }

  const count = mansions.length
  const stands =
    count === 0
      ? 'No mansion stands here yet.'
      : ready.length === 0
        ? count === 1
          ? `One mansion stands here, ${mansions[0].name}, but it cannot be opened. The list below says why.`
          : `${count} mansions stand here, but none can be opened. The list below says why.`
        : count === 1
          ? `One mansion stands here: ${mansions[0].name}.`
          : `${count} mansions stand here.`
  return {
    status: `${hello}${stands}`,
    question: HALL_QUESTION,
    options: [...enter, { id: 'build-new', label: 'Build something new', consequence: 'Asks what you want to build. Nothing is made yet.' }, STEP_OUTSIDE],
    ...(chosen === undefined && count > 0 ? watching : pointing),
  }
}
