// Property 1 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all House Projections, visible rooms, open surfaces and guide settings,
// `guideView` returns a view whose status line is not empty and holds at most
// 240 code points; whose question is the fixed one; whose Primary Options
// number at most four and all appear in the full list; whose option ids are
// unique; and whose every option has a label of at most 60 code points that
// starts with an approved verb, a non-empty consequence of at most 120 code
// points, and at least one press step. No guide text contains an exclamation
// mark or a banned phrase.
//
// **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.11**
//
// The references are written here and not read from the module: the approved
// verbs, the banned phrases and the limits as design.md lists them, a counter
// of code points, a whole-word matcher, and one function that lists everything
// wrong with a view. The status line is read whole, with the sentences of the
// house it quotes: the kit's names, reasons and waiting sentences hold no
// exclamation mark, emoji or banned phrase by construction. `note` is the
// room's own upstream sentence, not guide copy, so it is not read. No DOM,
// SDK, network or clock.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { contextArb, guideCaseArb, houseOfCase, surfacesOf, upstreamCaseArb, type GuideCase, type UpstreamCase } from '../test/guide-arbitraries'
import { snapshot } from '../test/house-projection-kit'
import { deepFreeze } from '../test/seance-arbitraries'
import { decision, doorProposal } from '../test/workflow-arbitraries'
import { APPROVED_VERBS, BANNED_PHRASES, guideView, type GuideContext, type GuideOption, type GuideView, type StatusKind } from './house-guide'
import type { HouseProjection } from './house-projection'
import type { RoomId } from './house-registry'
import type { PhaseView, WorkflowProjection } from './workflow-projection'

const RUNS = 300

// ---------------------------------------------------------------------------
// Independent reference: the copy contract as design.md lists it.

const VERBS = [
  'Allow', 'Ask', 'Build', 'Call', 'Choose', 'Close', 'Go', 'Have', 'Hide', 'Keep', 'Knock', 'Leave', 'Look', 'Open', 'Pause', 'Play', 'Put',
  'Read', 'Refuse', 'See', 'Send', 'Show', 'Step', 'Try', 'Watch', 'Write',
]
const BANNED = ['oops', 'uh-oh', 'yay', 'hooray', 'awesome', 'magic', "let's", 'simply', 'just', "don't worry", 'friend', 'buddy', 'little']
const QUESTION = 'What do you want to do?'
const MAX_STATUS = 240
const MAX_LABEL = 60
const MAX_CONSEQUENCE = 120
const MAX_PRIMARY = 4
const STATUS_KINDS: readonly StatusKind[] = ['locked', 'catch', 'door-waiting', 'failed', 'blocked', 'working', 'startable', 'door-open', 'built', 'room']
/** Every room a house can show, and one no house has. */
const ROOM_IDS: readonly RoomId[] = ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room']
const NO_SUCH_ROOM = 'cellar' as RoomId

function codePoints(text: string): number {
  return Array.from(text).length
}

/** An exclamation mark, or anything drawn as an emoji. */
const SHOUT = /[!\p{Extended_Pictographic}]/u
/** Half of a character outside the basic plane: what a cut by UTF-16 unit leaves behind. */
const HALF_CHARACTER = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One matcher per phrase: the phrase in any case, with no letter of any script directly before or after it. */
const BANNED_MATCHERS = BANNED.map((phrase) => ({ phrase, pattern: new RegExp(`(?<!\\p{L})${escapeRegExp(phrase).replace(/ /g, '\\s+')}(?!\\p{L})`, 'iu') }))

/** The banned phrases a text holds as whole words. A typographic apostrophe counts as a plain one. */
function bannedIn(text: string): string[] {
  const plain = text.replace(/[\u2018\u2019]/g, "'")
  return BANNED_MATCHERS.filter(({ pattern }) => pattern.test(plain)).map(({ phrase }) => phrase)
}

/** Deep equality of plain data: the same keys and values, whatever the key order. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const here = left as Record<string, unknown>
  const there = right as Record<string, unknown>
  const keys = Object.keys(here)
  return keys.length === Object.keys(there).length && keys.every((key) => Object.hasOwn(there, key) && same(here[key], there[key]))
}

/** Everything in a view that breaks the balloon grammar, in words. Empty for a sound view. */
function grammarProblems(view: GuideView): string[] {
  const problems: string[] = []

  // The status line and the question.
  if (view.status.trim() === '') problems.push('the status line is empty')
  if (codePoints(view.status) > MAX_STATUS) problems.push(`the status line holds ${codePoints(view.status)} code points`)
  if (view.question !== QUESTION) problems.push(`the question is not the fixed one: ${view.question}`)

  // At most four Primary Options, each in the full list exactly as it is shown, and no id twice.
  if (view.options.length > MAX_PRIMARY) problems.push(`there are ${view.options.length} primary options`)
  const ids = view.everything.map((option) => option.id)
  for (const id of new Set(ids.filter((candidate, index) => ids.indexOf(candidate) !== index))) problems.push(`the id ${id} is used twice in the full list`)
  for (const option of view.options) {
    const listed = view.everything.find((candidate) => candidate.id === option.id)
    if (listed === undefined) problems.push(`${option.id} is a primary option and is missing from the full list`)
    else if (!same(option, listed)) problems.push(`${option.id} reads differently in the full list`)
  }

  // Every option: a bounded label that starts with an approved verb, a bounded consequence, something to press.
  const options = [...view.everything, ...view.options.filter((option) => !view.everything.includes(option))]
  for (const option of options) {
    const say = (problem: string) => problems.push(`${option.id}: ${problem}`)
    if (option.label.trim() === '') say('the label is empty')
    else if (!VERBS.some((verb) => option.label === verb || option.label.startsWith(`${verb} `))) say(`the label starts with no approved verb: ${option.label}`)
    if (codePoints(option.label) > MAX_LABEL) say(`the label holds ${codePoints(option.label)} code points`)
    if (option.consequence.trim() === '') say('the consequence is empty')
    if (codePoints(option.consequence) > MAX_CONSEQUENCE) say(`the consequence holds ${codePoints(option.consequence)} code points`)
    if (option.steps.length === 0) say('it presses nothing')
  }

  // The copy: no exclamation mark, no emoji, no banned phrase, no character cut in half.
  const copy: Array<readonly [what: string, text: string]> = [
    ['the status line', view.status],
    ['the pose label', view.poseLabel],
  ]
  for (const option of options) copy.push([`the label of ${option.id}`, option.label], [`the consequence of ${option.id}`, option.consequence])
  for (const [what, text] of copy) {
    if (SHOUT.test(text)) problems.push(`${what} holds an exclamation mark or an emoji: ${text}`)
    for (const phrase of bannedIn(text)) problems.push(`${what} holds the banned phrase "${phrase}": ${text}`)
    if (HALF_CHARACTER.test(text)) problems.push(`${what} holds half a character: ${text}`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Generators: the kit's houses, three situations it seldom reaches, and names
// that are long or not English.

/** A Door opened by an approval, as the workflow reports one. */
function opened(view: PhaseView, sequence: number): PhaseView {
  return {
    ...view,
    status: 'approved',
    door: { status: 'open', proposal: doorProposal(view.phase, { status: 'approved', createdSequence: sequence, decision: decision('approved', sequence + 1) }) },
  }
}

function withPhases(upstream: UpstreamCase, change: (view: PhaseView, index: number) => PhaseView): UpstreamCase {
  const phases = upstream.workflow.phases.map(change) as unknown as WorkflowProjection['phases']
  return { ...upstream, workflow: { ...upstream.workflow, phases } }
}

/** Every Door open: the finished house. The kit draws one about once in four thousand cases. */
function finished(upstream: UpstreamCase): UpstreamCase {
  return withPhases(upstream, (view, index) => opened(view, 10 + 4 * index))
}

/** The to-do list approved, nobody at work and nothing waiting in the Workshop: the build can be started. */
function readyToBuild(upstream: UpstreamCase): UpstreamCase {
  const bent = withPhases(
    upstream,
    (view, index): PhaseView => (view.phase === 'implementation' ? { ...view, status: 'ready', ghostIds: [], door: { status: 'sealed', proposal: null } } : opened(view, 10 + 4 * index)),
  )
  return { ...bent, snapshots: [], workflow: { ...bent.workflow, integrity: 'valid', riskyProposals: [], waitingCount: 0 } }
}

/**
 * The Foreman and some Tinkers in one state, with nothing waiting in the
 * Workshop: the one place where a list of names can outgrow a label or the
 * status line.
 */
function crowded(upstream: UpstreamCase, state: 'working' | 'failed' | 'blocked', tinkers: number): UpstreamCase {
  const bent = withPhases(upstream, (view): PhaseView => (view.phase === 'tasks' || view.phase === 'implementation' ? { ...view, door: { status: 'sealed', proposal: null } } : view))
  const crowd = ['foreman', ...Array.from({ length: tinkers }, (_, index) => `tinker-${index + 1}`)]
  return { ...bent, snapshots: crowd.map((ghostId) => snapshot(ghostId, state)), workflow: { ...bent.workflow, riskyProposals: [], waitingCount: 0 } }
}

/** A case of the kit's shape for an upstream that was bent toward one situation. */
function caseOf(upstream: UpstreamCase): fc.Arbitrary<GuideCase> {
  const live = houseOfCase(upstream, 'live')
  return contextArb(live).map((context) => ({ upstream, live, replay: houseOfCase(upstream, 'replay'), context }))
}

const caseArb: fc.Arbitrary<GuideCase> = fc.oneof(
  { weight: 4, arbitrary: guideCaseArb },
  { weight: 1, arbitrary: upstreamCaseArb.map(finished).chain(caseOf) },
  { weight: 1, arbitrary: upstreamCaseArb.map(readyToBuild).chain(caseOf) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(upstreamCaseArb, fc.constantFrom('working' as const, 'failed' as const, 'blocked' as const), fc.integer({ min: 1, max: 14 }))
      .chain(([upstream, state, tinkers]) => caseOf(crowded(upstream, state, tinkers))),
  },
)

/**
 * Pieces of long and non-English names. No piece holds a banned phrase even
 * as part of a word, an exclamation mark or an emoji, so no name made of them
 * does, however it is cut.
 */
const NAME_PIECES = ['Árvíztűrő', 'Ωμέγα', '幽霊', 'Façade', 'ǆem', '𝔊𝔯𝔞𝔣', '𐐨𐐩𐐪', 'Þögn', "d'Aube", 'Öst-Väst', 'Tinker', 'van', 'the', 'Nº', '7'] as const
/** The most code points the House Projection lets a display name hold. */
const MAX_NAME = 60

/** One display name made of so many pieces: one line, cut where the House Projection would cut it. */
function nameArb(fewest: number, most: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...NAME_PIECES), { minLength: fewest, maxLength: most }).map((pieces) => Array.from(pieces.join(' ')).slice(0, MAX_NAME).join('').trim())
}

/**
 * Names for the ghosts of a house, handed out in the order the house lists
 * them. Null keeps the kit's names. A short name is one to three pieces; a
 * long one is twenty or more, so at least 39 code points.
 */
const namesArb: fc.Arbitrary<readonly string[] | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.array(nameArb(1, 3), { minLength: 16, maxLength: 16 }) },
  { weight: 2, arbitrary: fc.array(nameArb(20, 30), { minLength: 16, maxLength: 16 }) },
)

/** The same house under other display names. A name is upstream text; the guide only quotes it. */
function renamed(house: HouseProjection, names: readonly string[] | null): HouseProjection {
  if (names === null) return house
  let next = 0
  const rooms = house.rooms.map((room) => ({
    ...room,
    ghosts: room.ghosts.map((ghost) => {
      const name = names[next % names.length]
      next += 1
      return { ...ghost, name }
    }),
  }))
  return { ...house, rooms }
}

/** The generated context, then the same settings in every room of the house on each surface that room can show. */
function contextsOf(house: HouseProjection, context: GuideContext): GuideContext[] {
  const everywhere = house.rooms.flatMap((room) => surfacesOf(house, room.roomId).map((surface): GuideContext => ({ ...context, roomId: room.roomId, surface })))
  return [context, ...everywhere].map((each) => deepFreeze(each))
}

function place(house: HouseProjection, context: GuideContext): string {
  const surface = context.surface === null ? 'no surface open' : `the ${context.surface.kind} surface open`
  return `${house.mode} house, ${context.roomId}, ${surface}, words ${context.words}`
}

// ---------------------------------------------------------------------------

describe('the balloon grammar', () => {
  // Feature: warden-guide-and-first-visit, Property 1: The balloon grammar is total and bounded
  it('Property 1: The balloon grammar is total and bounded', () => {
    // The lists the copy is held to are the ones design.md gives.
    expect([...APPROVED_VERBS]).toEqual(VERBS)
    expect([...BANNED_PHRASES]).toEqual(BANNED)

    const kinds = new Set<StatusKind>()
    const longest = { status: 0, label: 0 }
    fc.assert(
      fc.property(caseArb, namesArb, ({ live, replay, context }, names) => {
        for (const generated of [live, replay]) {
          // Frozen, so a write to the projection or to a context would throw.
          const house = deepFreeze(renamed(generated, names))

          // Null only for a room the house does not show.
          for (const roomId of [...ROOM_IDS, NO_SUCH_ROOM]) {
            if (house.rooms.some((room) => room.roomId === roomId)) continue
            expect(guideView(house, { ...context, roomId, surface: null }), `${house.mode} house, ${roomId}`).toBeNull()
          }

          for (const here of contextsOf(house, context)) {
            const view = guideView(house, here)
            if (view === null) throw new Error(`${place(house, here)}: no view for a room the house shows`)
            kinds.add(view.statusKind)
            longest.status = Math.max(longest.status, codePoints(view.status))
            for (const option of view.everything) longest.label = Math.max(longest.label, codePoints(option.label))
            expect(grammarProblems(view), place(house, here)).toEqual([])
            // Total and pure: the same inputs give the same view again.
            expect(guideView(house, here), place(house, here)).toEqual(view)
          }
        }
      }),
      { numRuns: RUNS },
    )
    // Every kind of status line was read, the finished house included.
    expect([...kinds].sort()).toEqual([...STATUS_KINDS].sort())
    // The limits were pushed against, not only met by copy that is short anyway:
    // a crowd with long names would write a status line and a label far past them.
    expect(longest.status).toBeGreaterThan(200)
    expect(longest.label).toBeGreaterThan(50)
  })

  it('the reference tells a broken balloon from a sound one', () => {
    // A real view and one of its options to start from, so a field either one gains later is carried along.
    const [sample] = fc.sample(guideCaseArb, { numRuns: 1, seed: 1 })
    const real = guideView(sample.live, sample.context)
    if (real === null) throw new Error('the sampled room has no view')
    expect(grammarProblems(real)).toEqual([])

    const option = (id: string, label: string, consequence = 'Opens the Study. Nothing there changes.'): GuideOption => ({
      ...real.everything[0],
      id,
      label,
      consequence,
      steps: [{ kind: 'shell', action: 'map' }],
    })
    const first = option('go:study', 'Go to the Study')
    const second = option('map', 'See the whole house', 'Lays the map of every room over this one.')
    const sound: GuideView = { ...real, status: 'This is the Foyer, the way in and out.', question: QUESTION, options: [first], everything: [first, second], poseLabel: 'The Warden is watching.' }
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => option(id, 'Go to the Study'))

    expect(grammarProblems(sound)).toEqual([])
    // Bounds are counted in code points: 240 characters outside the basic plane are 480 UTF-16 units and still fit.
    expect(grammarProblems({ ...sound, status: '𝔊'.repeat(MAX_STATUS) })).toEqual([])
    // A word that only begins like a banned one, or like a verb followed by more letters, is read as what it is.
    expect(grammarProblems({ ...sound, status: 'Adjust the belittled magician’s friendship, justly.' })).toEqual([])

    const broken: ReadonlyArray<readonly [wrong: string, view: GuideView]> = [
      ['the status line is empty', { ...sound, status: '  ' }],
      ['the status line holds 241 code points', { ...sound, status: 'a'.repeat(MAX_STATUS + 1) }],
      ['the question is not the fixed one', { ...sound, question: 'What now?' as GuideView['question'] }],
      ['there are 5 primary options', { ...sound, options: five, everything: five }],
      ['the id map is used twice', { ...sound, everything: [first, second, second] }],
      ['go:study is a primary option and is missing from the full list', { ...sound, everything: [second] }],
      ['go:study reads differently in the full list', { ...sound, options: [{ ...first, consequence: 'Opens the Attic.' }] }],
      ['the label is empty', { ...sound, everything: [first, option('x', '')] }],
      ['the label holds 61 code points', { ...sound, everything: [first, option('x', `Go ${'a'.repeat(MAX_LABEL - 2)}`)] }],
      ['the label starts with no approved verb: The door is open', { ...sound, everything: [first, option('x', 'The door is open')] }],
      ['the label starts with no approved verb: Opening the door', { ...sound, everything: [first, option('x', 'Opening the door')] }],
      ['the label starts with no approved verb: go to the Study', { ...sound, everything: [first, option('x', 'go to the Study')] }],
      ['the consequence is empty', { ...sound, everything: [first, option('x', 'Go on', '')] }],
      ['the consequence holds 121 code points', { ...sound, everything: [first, option('x', 'Go on', 'a'.repeat(MAX_CONSEQUENCE + 1))] }],
      ['it presses nothing', { ...sound, everything: [first, { ...second, steps: [] }] }],
      ['the status line holds an exclamation mark or an emoji', { ...sound, status: 'The house is built!' }],
      ['the pose label holds an exclamation mark or an emoji', { ...sound, poseLabel: 'The Warden is watching 👀' }],
      ['the consequence of x holds the banned phrase "just"', { ...sound, everything: [first, option('x', 'Go on', 'Just opens the door.')] }],
      ['the label of x holds the banned phrase "don\'t worry"', { ...sound, everything: [first, option('x', 'Go on, don’t  worry')] }],
      ['the status line holds the banned phrase "little"', { ...sound, status: 'A LITTLE ghost is held.' }],
      ['the status line holds half a character', { ...sound, status: '𝔊'.slice(0, 1) }],
    ]
    for (const [wrong, view] of broken) {
      const problems = grammarProblems(view)
      expect(problems, wrong).toHaveLength(1)
      expect(problems[0], wrong).toContain(wrong)
    }

    // The made-up names bring nothing the copy is held against.
    for (const piece of NAME_PIECES) {
      expect(SHOUT.test(piece), piece).toBe(false)
      for (const phrase of BANNED) expect(piece.toLowerCase(), piece).not.toContain(phrase)
    }
  })
})
