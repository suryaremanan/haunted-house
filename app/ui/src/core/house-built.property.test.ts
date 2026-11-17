// Property 11 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all House Projections and built inputs, `builtView` reports `built`
// exactly when every phase door is open; lists a document row exactly for each
// phase whose door is open, in phase order, with the Word Book's plain and
// Kiro words and a path that ends in that term's file name; lists a task only
// when it is complete; and in replay mode says the folder is not on this
// computer.
//
// **Validates: Requirements 13.2, 13.3, 13.4, 13.8, 13.9**
//
// The reference is written here and not read from the module: the three
// documents as a table, the last segment of a path found by hand, each claim
// of the property as its own check, and the whole page worked out from the
// Doors and the input alone. Door states are rewritten as plain data, so every
// mix of open and shut Doors is seen in every generated house.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { houseOfCase, upstreamCaseArb } from '../test/guide-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import { BUILT_DOCUMENT_PHASES, BUILT_STEPS, REPLAY_FOLDER_NOTE, builtView, type BuiltInput, type BuiltView } from './house-built'
import type { HouseProjection } from './house-projection'
import { PRESENTATION_DOOR_STATES, type PresentationDoorState } from './house-registry'
import { term } from './house-words'
import { PHASES, type Phase } from './workflow-projection'

const RUNS = 300

/** The three documents in phase order: the file Kiro keeps each in, and its two words in the Word Book. */
const DOCUMENTS = [
  { phase: 'requirements', file: 'requirements.md', plain: 'what it must do', kiro: 'requirements' },
  { phase: 'design', file: 'design.md', plain: 'how it will work', kiro: 'design' },
  { phase: 'tasks', file: 'tasks.md', plain: 'to-do list', kiro: 'tasks' },
] as const
type DocumentPhase = (typeof DOCUMENTS)[number]['phase']

/** What follows the last `/` of a path: the whole path when it has none, nothing when it ends in one. */
function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function sameList(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((item, index) => item === other[index])
}

// ---------------------------------------------------------------------------
// Doors, rewritten as plain data.

/** The state to put each Door in. Null takes the Door out of the house. */
type DoorPlan = Readonly<Record<Phase, PresentationDoorState | null>>

/** Bit `n` of `mask` opens the Door of the nth phase. Every other Door takes its shut state, or leaves when it is absent. */
function planOf(mask: number, shut: readonly PresentationDoorState[], absent: readonly Phase[] = []): DoorPlan {
  const stateOf = (index: number): PresentationDoorState | null => (absent.includes(PHASES[index]) ? null : (mask & (1 << index)) !== 0 ? 'open' : shut[index])
  return { requirements: stateOf(0), design: stateOf(1), tasks: stateOf(2), implementation: stateOf(3) }
}

function withDoors(house: HouseProjection, plan: DoorPlan): HouseProjection {
  return {
    ...house,
    rooms: house.rooms.map((room) => ({
      ...room,
      doors: room.doors.flatMap((door) => {
        const state = plan[door.phase]
        return state === null ? [] : [{ ...door, state }]
      }),
    })),
  }
}

interface DoorFact {
  readonly phase: Phase
  readonly open: boolean
}

/** Every Door of every room, and whether it is open. */
function doorFacts(house: HouseProjection): DoorFact[] {
  const facts: DoorFact[] = []
  for (const room of house.rooms) for (const door of room.doors) facts.push({ phase: door.phase, open: door.state === 'open' })
  return facts
}

// ---------------------------------------------------------------------------
// The property, claim by claim.

/** Everything wrong with one page. Empty when it lists exactly what was approved. */
function pageProblems(house: HouseProjection, input: BuiltInput, view: BuiltView): string[] {
  const problems: string[] = []
  const doors = doorFacts(house)
  const isOpen = (phase: Phase) => doors.some((door) => door.phase === phase && door.open)

  // Built: the house has at least one Door, and every Door of every room is open.
  const everyDoorOpen = doors.length > 0 && doors.every((door) => door.open)
  if (view.built !== everyDoorOpen) problems.push(`built is ${view.built} and should be ${everyDoorOpen}`)

  // Rows: one for each document phase whose Door is open and whose document the input supplies, in phase order.
  const wanted = DOCUMENTS.filter((item) => isOpen(item.phase) && input.documents.some((candidate) => candidate.phase === item.phase && lastSegment(candidate.path) === item.file))
  const listed = view.rows.map((row) => row.term)
  if (!sameList(listed, wanted.map((item) => item.phase))) problems.push(`lists ${listed.join(', ') || 'no document'} and should list ${wanted.map((item) => item.phase).join(', ') || 'none'}`)
  for (const row of view.rows) {
    const item = DOCUMENTS.find((candidate) => candidate.phase === row.term)
    if (item === undefined) {
      problems.push(`${row.term} is listed and is no document`)
      continue
    }
    // Never a document whose Door is not open.
    if (!isOpen(item.phase)) problems.push(`${row.term} is listed and its Door is not open`)
    if (row.plain !== item.plain || row.kiro !== item.kiro) problems.push(`${row.term} is called "${row.plain}" and "${row.kiro}"`)
    // The path is one the input supplied for this phase, and it ends in the term's file.
    if (!input.documents.some((candidate) => candidate.phase === item.phase && candidate.path === row.path)) problems.push(`${row.term} shows "${row.path}", which the input did not supply for it`)
    if (lastSegment(row.path) !== item.file) problems.push(`${row.term} shows "${row.path}", which is not ${item.file}`)
  }

  // Tasks: the complete ones, in the order given, with the files the list names.
  const done = input.tasks.filter((task) => task.complete)
  const sameTasks =
    view.tasks.length === done.length &&
    view.tasks.every((task, index) => task.taskId === done[index].taskId && task.title === done[index].title && sameList(task.files, done[index].writes))
  if (!sameTasks) problems.push(`lists the tasks ${JSON.stringify(view.tasks)} and should list ${JSON.stringify(done)}`)

  // The folder as reported; where it is, in a recording; how to open it, in a live house.
  if (view.folder !== input.folder) problems.push(`the folder is "${view.folder}"`)
  if (house.mode === 'replay') {
    if (view.folderNote !== REPLAY_FOLDER_NOTE) problems.push(`a recording says of its folder: ${String(view.folderNote)}`)
    if (view.steps.length !== 0) problems.push(`a recording gives steps: ${view.steps.join(' ')}`)
  } else {
    if (view.folderNote !== null) problems.push(`a live house says of its folder: ${view.folderNote}`)
    if (!sameList(view.steps, BUILT_STEPS)) problems.push(`a live house gives the steps: ${view.steps.join(' ')}`)
  }
  return problems
}

/** The whole page, worked out from the Doors and the input alone, so nothing more is on it either. */
function expectedView(house: HouseProjection, input: BuiltInput) {
  const doors = doorFacts(house)
  const rows: { term: DocumentPhase; plain: string; kiro: string; path: string }[] = []
  for (const item of DOCUMENTS) {
    if (!doors.some((door) => door.phase === item.phase && door.open)) continue
    const supplied = input.documents.filter((candidate) => candidate.phase === item.phase && lastSegment(candidate.path) === item.file)
    if (supplied.length === 0) continue
    rows.push({ term: item.phase, plain: item.plain, kiro: item.kiro, path: supplied[0].path })
  }
  const tasks: { taskId: string; title: string; files: string[] }[] = []
  for (const task of input.tasks) if (task.complete) tasks.push({ taskId: task.taskId, title: task.title, files: [...task.writes] })
  const recording = house.mode === 'replay'
  return {
    built: doors.length > 0 && doors.filter((door) => !door.open).length === 0,
    rows,
    tasks,
    folder: input.folder,
    folderNote: recording ? REPLAY_FOLDER_NOTE : null,
    steps: recording ? [] : [...BUILT_STEPS],
  }
}

// ---------------------------------------------------------------------------
// Built inputs.

const WRONG_PATHS = ['other-document', 'longer-name', 'backup', 'folder', 'capitals', 'empty'] as const
type WrongPath = (typeof WRONG_PATHS)[number]
type PathKind = 'right' | 'bare' | 'junk' | WrongPath

/** A path for a document: where the house writes it, or one of the ways a path can name something else. */
function pathOf(kind: PathKind, specName: string, index: number, junk: string): string {
  const file = DOCUMENTS[index].file
  const folder = `.kiro/specs/${specName}`
  switch (kind) {
    case 'right':
      return `${folder}/${file}`
    case 'bare':
      return file
    case 'junk':
      return junk
    case 'other-document':
      return `${folder}/${DOCUMENTS[(index + 1) % DOCUMENTS.length].file}`
    case 'longer-name':
      return `${folder}/old-${file}`
    case 'backup':
      return `${folder}/${file}.bak`
    case 'folder':
      return `${folder}/${file}/`
    case 'capitals':
      return `${folder}/${file.toUpperCase()}`
    case 'empty':
      return ''
  }
}

const documentPlanArb = fc.record({
  included: fc.boolean(),
  kind: fc.oneof(
    { weight: 5, arbitrary: fc.constant<PathKind>('right') },
    { weight: 1, arbitrary: fc.constantFrom<PathKind>('bare', 'junk') },
    { weight: 3, arbitrary: fc.constantFrom<PathKind>(...WRONG_PATHS) },
  ),
  junk: fc.string({ maxLength: 16 }),
  // A second document of the same phase under a wrong name, before or after the first.
  decoy: fc.option(fc.record({ kind: fc.constantFrom<WrongPath>(...WRONG_PATHS), first: fc.boolean() }), { nil: null }),
})

const taskArb = fc.record({
  taskId: fc.oneof(fc.constantFrom('1', '1.1', '2', '2.1', '3'), fc.string({ maxLength: 6 })),
  title: fc.oneof(fc.constantFrom('Count the words', 'Write the tests'), fc.string({ maxLength: 20 })),
  complete: fc.boolean(),
  writes: fc.array(fc.constantFrom('src/count.ts', 'src/count.test.ts', 'README.md'), { maxLength: 3 }),
})

interface BuiltCase {
  readonly specName: string
  readonly input: BuiltInput
}

const builtCaseArb: fc.Arbitrary<BuiltCase> = fc
  .record({
    specName: fc.constantFrom('demo', 'word-counter', 'a'),
    plans: fc.tuple(documentPlanArb, documentPlanArb, documentPlanArb),
    // The documents arrive in any order.
    order: fc.shuffledSubarray([0, 1, 2], { minLength: 3 }),
    tasks: fc.array(taskArb, { maxLength: 6 }),
    // Home-relative, as the backend reports it.
    folder: fc.oneof(fc.constantFrom('~/workspace/haunted-house/mansions/demo-mansion', '~/word-counter'), fc.string({ maxLength: 24 })),
  })
  .map(({ specName, plans, order, tasks, folder }) => {
    const documents: { phase: DocumentPhase; path: string }[] = []
    for (const index of order) {
      const plan = plans[index]
      if (!plan.included) continue
      const phase = DOCUMENTS[index].phase
      const main = { phase, path: pathOf(plan.kind, specName, index, plan.junk) }
      if (plan.decoy === null) documents.push(main)
      else if (plan.decoy.first) documents.push({ phase, path: pathOf(plan.decoy.kind, specName, index, plan.junk) }, main)
      else documents.push(main, { phase, path: pathOf(plan.decoy.kind, specName, index, plan.junk) })
    }
    return { specName, input: { documents, tasks, folder } }
  })

const doorsArb = fc.record({
  // The state of each Door that is not open, by phase.
  shut: fc.array(fc.constantFrom(...PRESENTATION_DOOR_STATES.filter((state) => state !== 'open')), { minLength: PHASES.length, maxLength: PHASES.length }),
  // One more mix of open and shut, for a house that has lost some of its Doors.
  mask: fc.nat({ max: 15 }),
  absent: fc.subarray([...PHASES], { minLength: 1 }),
})

describe('what was made', () => {
  // Feature: warden-guide-and-first-visit, Property 11: The built page lists exactly what was approved
  it('Property 11: the built page lists exactly what was approved', () => {
    // The table above is the Word Book's, and the phases are in its order.
    expect([...BUILT_DOCUMENT_PHASES]).toEqual(DOCUMENTS.map((item) => item.phase))
    for (const item of DOCUMENTS) {
      const entry = term(item.phase)
      expect(entry.plain).toBe(item.plain)
      expect(entry.kiro).toBe(item.kiro)
      expect(entry.file).toBe(item.file)
    }
    // A recording says the folder is somewhere else; a live house says how to open it.
    expect(REPLAY_FOLDER_NOTE).toMatch(/recording/i)
    expect(REPLAY_FOLDER_NOTE).toMatch(/folder/i)
    expect(REPLAY_FOLDER_NOTE).toMatch(/not on this/i)
    expect(BUILT_STEPS.length).toBeGreaterThan(0)
    for (const step of BUILT_STEPS) expect(step.trim()).not.toBe('')

    const mixes = new Set<string>()
    const rowCounts = new Set<number>()
    const builtSeen = new Set<boolean>()
    const modes = new Set<string>()

    fc.assert(
      fc.property(upstreamCaseArb, builtCaseArb, doorsArb, (upstream, { specName, input }, doors) => {
        deepFreeze(input)
        // The same input with every document where the house writes it.
        const complete: BuiltInput = deepFreeze({ ...input, documents: DOCUMENTS.map((item) => ({ phase: item.phase, path: `.kiro/specs/${specName}/${item.file}` })) })

        for (const mode of ['live', 'replay'] as const) {
          const generated = houseOfCase(upstream, mode)
          const houses: HouseProjection[] = [generated]
          // Every mix of open and shut across the four Doors.
          for (let mask = 0; mask < 16; mask += 1) houses.push(withDoors(generated, planOf(mask, doors.shut)))
          // A house that has lost some of its Doors, and a house with no Door at all.
          houses.push(withDoors(generated, planOf(doors.mask, doors.shut, doors.absent)))
          houses.push(withDoors(generated, planOf(15, doors.shut, PHASES)))

          for (const house of houses) {
            // Frozen, like the input: a write to either would throw.
            deepFreeze(house)
            const facts = doorFacts(house)
            const where = `${house.mode}, doors: ${facts.map((door) => `${door.phase} ${door.open ? 'open' : 'shut'}`).join(', ') || 'none'}`
            if (facts.length === PHASES.length) mixes.add(facts.map((door) => (door.open ? 'o' : 's')).join(''))
            modes.add(house.mode)

            for (const given of [input, complete]) {
              const view = builtView(house, given)
              expect(pageProblems(house, given, view), where).toEqual([])
              // The page is the reference and nothing more; asking again gives the same page.
              expect(view, where).toEqual(expectedView(house, given))
              expect(builtView(house, given), where).toEqual(view)
              rowCounts.add(view.rows.length)
              builtSeen.add(view.built)
            }
          }
        }
      }),
      { numRuns: RUNS },
    )

    // All sixteen mixes of open and shut, pages of zero to three rows, built and not, both modes.
    expect(mixes.size).toBe(16)
    expect([...rowCounts].sort()).toEqual([0, 1, 2, 3])
    expect([...builtSeen].sort()).toEqual([false, true])
    expect([...modes].sort()).toEqual(['live', 'replay'])
  })
})
