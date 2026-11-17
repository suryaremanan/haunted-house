// Property 3 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all House Projections and contexts, every press step names something the
// projection holds (a visible room, a ghost or door of that room, a pending
// waiting item of that room, a run the room offers to retry); an option of
// kind `start`, `decide` or `ask` appears only for a room whose mutation is
// enabled in live mode; an option of kind `decide` appears only when the open
// surface is the one that shows that decision; and no option of any kind
// differs between Quiet Mode on and off except that the view is put away.
//
// **Validates: Requirements 4.2, 4.3, 4.6, 4.8, 6.5, 11.2, 11.4, 11.5, 11.9, 11.10, 11.11, 12.2, 12.3**
//
// The reference is written here and reads the House Projection and the
// context alone: which room may be changed, which surface shows which
// decision, and what each press reaches for. A press the reference does not
// know is a failure, so a new control cannot be offered unchecked. No DOM,
// SDK, network or clock.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { contextArb, guideCaseArb, houseOfCase, surfacesOf, upstreamCaseArb, type GuideCase, type UpstreamCase } from '../test/guide-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import { waitingHouse } from '../test/shell-kit'
import { decision, doorProposal, riskyProposal } from '../test/workflow-arbitraries'
import { MUTATING_OPTION_KINDS, guideView, type GuideContext, type GuideOption, type GuideView, type PressStep } from './house-guide'
import { selectNeedsYouItems, type HouseProjection, type HouseSurfaceTarget, type RoomPresentation } from './house-projection'
import type { RoomId } from './house-registry'
import type { PhaseView, WorkflowProjection } from './workflow-projection'

const RUNS = 300

// ---------------------------------------------------------------------------
// Independent reference: what the house allows, read from the projection.

/** The kinds of option that start, decide or ask for something. */
const MUTATING: readonly string[] = ['start', 'decide', 'ask']

/** What the reference saw offered and checked, so the property can say it was not vacuous. */
const REACHES = ['start', 'build', 'retry', 'door decision', 'risky decision', 'change request', 'ready-made change', 'send', 'recording', 'attic'] as const
type Reach = (typeof REACHES)[number]

/** The text after the first colon: the proposal of a waiting item's id. */
function afterColon(text: string): string {
  return text.slice(text.indexOf(':') + 1)
}

/** May anything in this room be started, decided or asked for? */
function mayChange(house: HouseProjection, room: RoomPresentation): boolean {
  return house.mode === 'live' && room.mutatingActionsEnabled && !room.readOnly && !room.locked
}

/** True when a Door of the room waits on this proposal. A Door names a proposal only while it is pending. */
function doorWaitsOn(room: RoomPresentation, proposalId: string): boolean {
  return room.doors.some((door) => door.proposalId === proposalId)
}

/** True when a risky action of the room waits on this proposal and can still be answered. */
function riskyWaitsOn(room: RoomPresentation, proposalId: string): boolean {
  return room.waitingItems.some((item) => item.kind === 'risky-decision' && item.status === 'pending' && item.actionAvailable && afterColon(item.id) === proposalId)
}

/**
 * True when the surface on top shows the decision on this proposal: the sheet
 * of its room, or, for a Door proposal, that Door's own surface.
 */
function showsDecision(room: RoomPresentation, surface: HouseSurfaceTarget | null, proposalId: string): boolean {
  if (surface === null || surface.roomId !== room.roomId) return false
  if (surface.kind === 'room') return doorWaitsOn(room, proposalId) || riskyWaitsOn(room, proposalId)
  if (surface.kind === 'door') return room.doors.some((door) => door.proposalId === proposalId && door.phase === surface.phase)
  return false
}

/** Everything a view offers beyond what the house allows, in words. Empty while the guide stays inside its limits. */
function authorityProblems(house: HouseProjection, context: GuideContext, view: GuideView, reached: Set<Reach> = new Set()): string[] {
  const room = house.rooms.find((candidate) => candidate.roomId === context.roomId)
  if (room === undefined) return [`the house shows no ${context.roomId}`]
  const problems: string[] = []
  const surface = context.surface
  const changeable = mayChange(house, room)
  const hasDoor = (phase: string) => room.doors.some((door) => door.phase === phase)
  const hasShutDoor = (phase: string) => room.doors.some((door) => door.phase === phase && door.state !== 'open')

  for (const option of [...view.everything, ...view.options.filter((candidate) => !view.everything.includes(candidate))]) {
    const say = (problem: string) => problems.push(`${option.id} "${option.label}": ${problem}`)
    /** True once a press of this option starts, decides or asks for something. */
    let changes = false
    /** The proposals this option decides. */
    const decisions: string[] = []

    for (const step of option.steps) {
      switch (step.kind) {
        case 'map': {
          const target = step.target
          const there = house.rooms.find((candidate) => candidate.roomId === target.roomId)
          if (there === undefined) {
            say(`opens ${target.roomId}, a room the house does not show`)
            break
          }
          if (target.kind === 'ghost' && !there.ghosts.some((ghost) => ghost.ghostId === target.ghostId)) say(`opens ${target.ghostId}, a ghost the ${there.name} does not hold`)
          if (target.kind === 'door') {
            const door = there.doors.find((candidate) => candidate.phase === target.phase)
            if (door === undefined) say(`opens a ${target.phase} Door the ${there.name} does not have`)
            else if (door.proposalId !== target.proposalId) say(`opens the ${target.phase} Door under ${target.proposalId}, a proposal that Door does not hold`)
          }
          const focus = step.focus
          if (focus.kind === 'proposal' && !doorWaitsOn(there, focus.proposalId) && !there.waitingItems.some((item) => item.status === 'pending' && afterColon(item.id) === focus.proposalId)) {
            say(`puts focus on ${focus.proposalId}, which is no pending proposal of the ${there.name}`)
          }
          if (focus.kind === 'section' && (target.kind !== 'room' || target.roomId !== 'foyer')) say("looks for what was built outside the Foyer's sheet")
          break
        }
        case 'control': {
          const colon = step.key.indexOf(':')
          const name = colon < 0 ? step.key : step.key.slice(0, colon)
          const rest = colon < 0 ? null : step.key.slice(colon + 1)
          if (name === 'start' && rest !== null) {
            changes = true
            reached.add('start')
            if (!hasDoor(rest)) say(`starts ${rest}, a phase this room has no Door for`)
          } else if ((name === 'approve' || name === 'reject') && rest !== null) {
            changes = true
            decisions.push(rest)
            if (doorWaitsOn(room, rest)) reached.add('door decision')
            if (riskyWaitsOn(room, rest)) reached.add('risky decision')
            if (!doorWaitsOn(room, rest) && !riskyWaitsOn(room, rest)) say(`decides ${rest}, which is no pending proposal of this room`)
          } else if ((name === 'revise' || name === 'revise-send') && rest !== null) {
            changes = true
            reached.add(name === 'revise' ? 'change request' : 'send')
            if (!hasShutDoor(rest)) say(`asks for a change of ${rest}, which has no Door here that is still shut`)
          } else if (name === 'retry' && rest !== null) {
            changes = true
            reached.add('retry')
            if (!room.recoveryActions.some((action) => action.runId === rest && action.available)) say(`retries ${rest}, a run this room does not offer to retry`)
          } else if (step.key === 'start-workshop') {
            changes = true
            reached.add('build')
            if (!hasDoor('implementation')) say('starts the build in a room without the implementation Door')
          } else if (step.key === 'replay:toggle' || step.key === 'replay:restart') {
            reached.add('recording')
            if (house.mode !== 'replay') say('plays a recording in a live house')
          } else if (step.key === 'attic:toggle' || step.key === 'attic:next') {
            reached.add('attic')
            if (!house.rooms.some((candidate) => candidate.roomId === 'attic')) say('plays the Attic of a house that shows none')
          } else {
            say(`presses a control the reference does not know: ${step.key}`)
          }
          break
        }
        case 'fill':
        case 'focus': {
          const phase = step.key.startsWith('revise-text:') ? step.key.slice('revise-text:'.length) : null
          if (phase === null) say(`reaches for a field the reference does not know: ${step.key}`)
          else if (!hasShutDoor(phase)) say(`writes a change request for ${phase}, which has no Door here that is still shut`)
          if (step.kind === 'fill') {
            changes = true
            reached.add('ready-made change')
          }
          break
        }
        case 'every': {
          changes = true
          if (step.keyPrefix !== 'task:') say(`ticks controls the reference does not know: ${step.keyPrefix}`)
          else if (!hasDoor('implementation')) say('ticks tasks in a room without the implementation Door')
          break
        }
        case 'shell': {
          switch (step.action) {
            case 'map':
            case 'reveal':
            case 'kiro-words':
              break
            case 'needs-you':
              if (house.needsYou.length === 0) say('goes to what needs the visitor while nothing does')
              break
            case 'close':
              if (surface === null) say('closes a sheet while none is open')
              break
            case 'exit':
              if (!context.canLeave) say('leaves a house this page cannot leave')
              break
            default: {
              const unlisted: never = step.action
              say(`presses a shell control the reference does not know: ${String(unlisted)}`)
            }
          }
          break
        }
        case 'task': {
          if (step.task !== null && !hasShutDoor(step.task.phase)) say(`keeps a change request for ${step.task.phase} in hand, which has no Door here that is still shut`)
          break
        }
        default: {
          const unlisted: never = step
          say(`holds a press of a kind the reference does not know: ${JSON.stringify(unlisted)}`)
        }
      }
    }

    // Starting, deciding and asking: only in a live room whose mutation is on.
    if ((changes || MUTATING.includes(option.kind)) && !changeable) say('starts, decides or asks in a room that allows no change')
    // Deciding: only beside the exact thing being decided.
    if (option.kind === 'decide' && decisions.length === 0) say('is a decision that presses no approve or reject control')
    for (const proposalId of decisions) {
      if (!showsDecision(room, surface, proposalId)) say(`decides ${proposalId} while the open surface does not show that decision`)
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// Generators: the kit's houses, three situations it seldom reaches, and
// decisions that were answered since.

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

/** One risky action waiting in a Workshop that may be changed, and no Door waiting there: a catch with a decision. */
function caught(upstream: UpstreamCase): UpstreamCase {
  const bent = withPhases(upstream, (view): PhaseView => (view.phase === 'tasks' || view.phase === 'implementation' ? { ...view, door: { status: 'sealed', proposal: null } } : view))
  return { ...bent, workflow: { ...bent.workflow, integrity: 'valid', riskyProposals: [riskyProposal()], waitingCount: 1 } }
}

/** A case of the kit's shape for an upstream that was bent toward one situation. */
function caseOf(upstream: UpstreamCase): fc.Arbitrary<GuideCase> {
  const live = houseOfCase(upstream, 'live')
  return contextArb(live).map((context) => ({ upstream, live, replay: houseOfCase(upstream, 'replay'), context }))
}

const caseArb: fc.Arbitrary<GuideCase> = fc.oneof(
  { weight: 6, arbitrary: guideCaseArb },
  { weight: 1, arbitrary: upstreamCaseArb.map(finished).chain(caseOf) },
  { weight: 1, arbitrary: upstreamCaseArb.map(readyToBuild).chain(caseOf) },
  { weight: 1, arbitrary: upstreamCaseArb.map(caught).chain(caseOf) },
)

/** What became of a waiting item: still open, answered, or open with nothing the visitor can do about it. */
const FATES = ['open', 'open', 'open', 'answered', 'out of reach'] as const
const fatesArb = fc.array(fc.constantFrom(...FATES), { minLength: 8, maxLength: 8 })

/**
 * The same house after some of its decisions met their fate, handed out in
 * the order the house lists its waiting items. The House Projection writes
 * only open items today, so the kit draws no other; its type allows them, and
 * an item that is not open is no decision. Needs You is selected again, as
 * the house would select it.
 */
function settled(house: HouseProjection, fates: readonly (typeof FATES)[number][]): HouseProjection {
  let next = 0
  const rooms = house.rooms.map((room) => ({
    ...room,
    waitingItems: room.waitingItems.map((item) => {
      const fate = fates[next % fates.length]
      next += 1
      if (fate === 'open') return item
      return fate === 'answered' ? { ...item, status: 'resolved' as const, actionAvailable: false } : { ...item, actionAvailable: false }
    }),
  }))
  return { ...house, rooms, needsYou: selectNeedsYouItems(rooms) }
}

/**
 * The generated context, then the same settings in every room of the house:
 * on each surface that room can show, and under the sheet of the next room.
 * The page does not leave another room's sheet on top (the room on show
 * follows the open surface), so that last surface shows no decision of the
 * room and the guide must offer none under it.
 */
function contextsOf(house: HouseProjection, context: GuideContext): GuideContext[] {
  const everywhere = house.rooms.flatMap((room, index) => {
    const elsewhere: HouseSurfaceTarget = { kind: 'room', roomId: house.rooms[(index + 1) % house.rooms.length].roomId }
    return [...surfacesOf(house, room.roomId), elsewhere].map((surface): GuideContext => ({ ...context, roomId: room.roomId, surface }))
  })
  return [context, ...everywhere].map((each) => deepFreeze(each))
}

function place(house: HouseProjection, context: GuideContext): string {
  const surface = context.surface === null ? 'no surface open' : `the ${context.surface.kind} surface of ${context.surface.roomId} open`
  return `${house.mode} house, ${context.roomId}, ${surface}`
}

function viewOf(house: HouseProjection, context: GuideContext): GuideView {
  const view = guideView(house, context)
  if (view === null) throw new Error(`${place(house, context)}: no view for a room the house shows`)
  return view
}

/** The Workshop with its own sheet open: where `waitingHouse()` shows the risky action of Tinker 2. */
const onSheet: GuideContext = { roomId: 'workshop', surface: { kind: 'room', roomId: 'workshop' }, task: null, quiet: false, words: 'plain', reveal: false, mapOpen: false, canLeave: true }
const workshopOf = (house: HouseProjection) => house.rooms.find((room) => room.roomId === 'workshop')
const deciding = (view: GuideView) => view.everything.filter((option) => option.kind === 'decide').map((option) => option.label)

// ---------------------------------------------------------------------------

describe('the guide and what the house allows', () => {
  // Feature: warden-guide-and-first-visit, Property 3: The guide never offers more than the house allows
  it('Property 3: The guide never offers more than the house allows', () => {
    expect([...MUTATING_OPTION_KINDS].sort()).toEqual([...MUTATING].sort())

    const reached = new Set<Reach>()
    let notOpen = 0
    fc.assert(
      fc.property(caseArb, fatesArb, ({ live, replay, context }, fates) => {
        for (const generated of [live, replay]) {
          // Frozen, so a write to the projection or to a context would throw.
          const house = deepFreeze(settled(generated, fates))
          notOpen += house.rooms.flatMap((room) => room.waitingItems).filter((item) => item.status !== 'pending' || !item.actionAvailable).length
          for (const here of contextsOf(house, context)) {
            const loud = viewOf(house, { ...here, quiet: false })
            const hushed = viewOf(house, { ...here, quiet: true })
            // Quiet Mode puts the balloon away and changes nothing it would offer.
            expect({ options: hushed.options, everything: hushed.everything }, place(house, here)).toEqual({ options: loud.options, everything: loud.everything })
            // Every option, live and as a recording: nothing beyond what the house allows.
            expect(authorityProblems(house, here, loud, reached), place(house, here)).toEqual([])
          }
        }
      }),
      { numRuns: RUNS },
    )
    // Not vacuous: each of these was offered somewhere and passed the reference,
    // and some houses held a decision that was no longer open.
    expect([...reached].sort()).toEqual([...REACHES].sort())
    expect(notOpen).toBeGreaterThan(0)
  })

  it('the reference refuses an offer the house does not allow', () => {
    const house = waitingHouse()
    const view = viewOf(house, onSheet)
    const refusals = (problems: readonly string[]) => problems.join('\n')

    // The live offer, read against a recording, against the bare room and under another room's sheet.
    expect(refusals(authorityProblems(waitingHouse({ mode: 'replay' }), onSheet, view))).toContain('starts, decides or asks in a room that allows no change')
    expect(refusals(authorityProblems(house, { ...onSheet, surface: null }, view))).toContain('decides risky-1 while the open surface does not show that decision')
    expect(refusals(authorityProblems(house, { ...onSheet, surface: { kind: 'room', roomId: 'study' } }, view))).toContain('decides risky-1 while the open surface does not show that decision')

    // One forged option at a time, made from a real one: each reaches for something the Workshop of this house does not hold.
    const forged = (kind: GuideOption['kind'], steps: readonly PressStep[]): GuideView => ({ ...view, options: [], everything: [{ ...view.everything[0], id: 'forged', kind, steps }] })
    const heading = { kind: 'heading' } as const
    const offers: ReadonlyArray<readonly [refusal: string, offer: GuideView]> = [
      ['presses a control the reference does not know: launch:everything', forged('look', [{ kind: 'control', key: 'launch:everything' }])],
      ['presses a control the reference does not know: revise-text:tasks', forged('ask', [{ kind: 'control', key: 'revise-text:tasks' }])],
      ['presses a control the reference does not know: start-workshop:now', forged('start', [{ kind: 'control', key: 'start-workshop:now' }])],
      ['starts design, a phase this room has no Door for', forged('start', [{ kind: 'control', key: 'start:design' }])],
      ['decides door-requirements-1, which is no pending proposal of this room', forged('decide', [{ kind: 'control', key: 'approve:door-requirements-1' }])],
      ['is a decision that presses no approve or reject control', forged('decide', [{ kind: 'shell', action: 'map' }])],
      ['retries tinker-2-run, a run this room does not offer to retry', forged('start', [{ kind: 'control', key: 'retry:tinker-2-run' }])],
      ['plays a recording in a live house', forged('play', [{ kind: 'control', key: 'replay:toggle' }])],
      ['reaches for a field the reference does not know: note', forged('ask', [{ kind: 'fill', key: 'note', text: 'Use simpler words.' }])],
      ['ticks controls the reference does not know: door:', forged('start', [{ kind: 'every', keyPrefix: 'door:' }])],
      ['opens cellar, a room the house does not show', forged('go', [{ kind: 'map', target: { kind: 'room', roomId: 'cellar' as RoomId }, focus: heading }])],
      ['opens archivist, a ghost the Workshop does not hold', forged('look', [{ kind: 'map', target: { kind: 'ghost', roomId: 'workshop', ghostId: 'archivist' }, focus: heading }])],
      ['opens a design Door the Workshop does not have', forged('look', [{ kind: 'map', target: { kind: 'door', roomId: 'workshop', phase: 'design', proposalId: null }, focus: heading }])],
      ['puts focus on risky-9, which is no pending proposal of the Workshop', forged('look', [{ kind: 'map', target: { kind: 'room', roomId: 'workshop' }, focus: { kind: 'proposal', proposalId: 'risky-9' } }])],
    ]
    for (const [refusal, offer] of offers) expect(refusals(authorityProblems(house, onSheet, offer)), refusal).toContain(refusal)

    // A start that is sound in the Study is refused once the Study cannot be changed.
    const study: GuideContext = { ...onSheet, roomId: 'study', surface: { kind: 'room', roomId: 'study' } }
    const disguised = forged('look', [{ kind: 'control', key: 'start:requirements' }])
    expect(authorityProblems(house, study, disguised)).toEqual([])
    expect(refusals(authorityProblems(waitingHouse({ mode: 'replay' }), study, disguised))).toContain('starts, decides or asks in a room that allows no change')
  })
})

describe('a risky action in the Workshop', () => {
  it('is allowed or refused in the live house, and only beside the action itself', () => {
    const house = waitingHouse()
    // What the fixture is: a room that may be changed, whose first waiting item is the risky action of Tinker 2.
    expect(house.mode).toBe('live')
    expect(workshopOf(house)).toMatchObject({ mutatingActionsEnabled: true, readOnly: false, locked: false })
    expect(workshopOf(house)?.waitingItems[0]).toMatchObject({ kind: 'risky-decision', id: 'risky:risky-1', ghostId: 'tinker-2', status: 'pending', actionAvailable: true })

    const view = viewOf(house, onSheet)
    expect(view.options.slice(0, 2).map((option) => ({ label: option.label, kind: option.kind, steps: option.steps }))).toEqual([
      { label: 'Allow it once', kind: 'decide', steps: [{ kind: 'control', key: 'approve:risky-1' }] },
      { label: 'Refuse it', kind: 'decide', steps: [{ kind: 'control', key: 'reject:risky-1' }] },
    ])
    expect(deciding(view)).toEqual(['Allow it once', 'Refuse it'])
    expect(authorityProblems(house, onSheet, view)).toEqual([])

    // The bare room, the ghost's own details and the sheet of another room do not show the action.
    const elsewhere: readonly (HouseSurfaceTarget | null)[] = [null, { kind: 'ghost', roomId: 'workshop', ghostId: 'tinker-2' }, { kind: 'room', roomId: 'study' }]
    for (const surface of elsewhere) expect(deciding(viewOf(house, { ...onSheet, surface })), JSON.stringify(surface)).toEqual([])
  })

  it('is neither allowed nor refused in a recording of the same house', () => {
    const recording = waitingHouse({ mode: 'replay' })
    // The catch is still there to be read. Only the decision is gone.
    expect(recording.mode).toBe('replay')
    expect(workshopOf(recording)?.waitingItems[0]).toMatchObject({ kind: 'risky-decision', id: 'risky:risky-1', status: 'pending' })

    const view = viewOf(recording, onSheet)
    expect(view.statusKind).toBe('catch')
    const labels = view.everything.map((option) => option.label)
    expect(labels).not.toContain('Allow it once')
    expect(labels).not.toContain('Refuse it')
    expect(view.everything.filter((option) => MUTATING.includes(option.kind))).toEqual([])
    expect(authorityProblems(recording, onSheet, view)).toEqual([])
  })

  // The House Projection writes only open items today, so no house of the kit
  // holds one that was answered. The property plants some; this is the plain case.
  it('is offered no more once it was answered, or while the visitor cannot act on it', () => {
    for (const fate of ['answered', 'out of reach'] as const) {
      const later = settled(waitingHouse(), [fate])
      // The house keeps the item and no longer counts it as needing the visitor.
      expect(workshopOf(later)?.waitingItems.map((item) => [item.id, item.status, item.actionAvailable]), fate).toEqual([['risky:risky-1', fate === 'answered' ? 'resolved' : 'pending', false]])
      expect(later.needsYou, fate).toEqual([])

      const view = viewOf(later, onSheet)
      expect(view.statusKind, fate).not.toBe('catch')
      expect(deciding(view), fate).toEqual([])
      expect(authorityProblems(later, onSheet, view), fate).toEqual([])
    }
  })
})
