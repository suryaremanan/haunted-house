// The Warden's words, one readable example per situation (Spec 8, Requirements
// 3, 4, 11, 12 and 13). The properties in house-guide-*.property.test.ts check
// the rules over generated houses; these say what a visitor actually reads.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { composeUpstream, snapshot } from '../test/house-projection-kit'
import { houseOf, quietHouse, waitingHouse } from '../test/shell-kit'
import { decision, doorProposal, projection as workflowProjection, projectionArb } from '../test/workflow-arbitraries'
import {
  APPROVED_VERBS,
  BANNED_PHRASES,
  BUILT_TEXT,
  GUIDE_QUESTION,
  POSE_LABEL,
  READY_MADE_CHANGES,
  ROOM_PURPOSE_TEXT,
  guideView,
  isBuilt,
  landingRoom,
  wardenPose,
  type GuideContext,
  type GuideView,
} from './house-guide'
import { LOCKED_SEANCE_TEXT, buildHouseProjection, type HouseProjection, type HouseSurfaceTarget, type RoomPresentation } from './house-projection'
import type { RoomId } from './house-registry'
import { startView } from './house-view'
import { namesKiroWord, write } from './house-words'
import { PHASES, type Phase, type PhaseView } from './workflow-projection'

function at(roomId: RoomId, overrides: Partial<GuideContext> = {}): GuideContext {
  return { roomId, surface: null, task: null, quiet: false, words: 'plain', reveal: false, mapOpen: false, canLeave: true, ...overrides }
}

function view(house: HouseProjection, roomId: RoomId, overrides: Partial<GuideContext> = {}): GuideView {
  return guideView(house, at(roomId, overrides))!
}

const labels = (shown: GuideView) => shown.options.map((option) => option.label)
const allLabels = (shown: GuideView) => shown.everything.map((option) => option.label)
const sheet = (roomId: RoomId): HouseSurfaceTarget => ({ kind: 'room', roomId })

function withRoom(house: HouseProjection, roomId: RoomId, change: (room: RoomPresentation) => RoomPresentation): HouseProjection {
  return { ...house, rooms: house.rooms.map((room) => (room.roomId === roomId ? change(room) : room)) }
}

const approved = (phase: Phase, sequence: number): Partial<PhaseView> => ({
  status: 'approved',
  door: { status: 'open', proposal: doorProposal(phase, { status: 'approved', createdSequence: sequence, decision: decision('approved', sequence + 1) }) },
})

/** Requirements approved; the Draughtsman can be started. */
const AFTER_REQUIREMENTS = () => houseOf({ workflow: workflowProjection({ version: 30, phaseOverrides: { requirements: approved('requirements', 10), design: { status: 'ready' } } }) })
/** The to-do list approved; the build can be started. */
const AFTER_TASKS = () =>
  houseOf({
    workflow: workflowProjection({
      version: 40,
      phaseOverrides: { requirements: approved('requirements', 10), design: approved('design', 14), tasks: approved('tasks', 18), implementation: { status: 'ready' } },
    }),
  })
/** Every Door open. */
const BUILT = () =>
  houseOf({
    workflow: workflowProjection({
      version: 50,
      phaseOverrides: { requirements: approved('requirements', 10), design: approved('design', 14), tasks: approved('tasks', 18), implementation: approved('implementation', 22) },
    }),
  })

describe('an empty house', () => {
  const house = quietHouse()

  it('lands in the Study and points at the first step', () => {
    expect(landingRoom(house)).toBe('study')
    const study = view(house, 'study')
    expect(study.statusKind).toBe('startable')
    expect(study.status).toBe('This is the Study. The Archivist writes what it must do here. Nothing is written yet.')
    expect(study.question).toBe(GUIDE_QUESTION)
    expect(labels(study)).toEqual(['Have the Archivist write what it must do', 'Look around the Study', 'See the whole house'])
    expect(study.pose).toBe('pointing')
    expect(study.poseLabel).toBe(POSE_LABEL.pointing)
    expect(study.note).toBeNull()
    // The start is two presses of real controls: the room on the map, then its own start button.
    expect(study.options[0]).toMatchObject({ id: 'start:requirements', kind: 'start', term: 'requirements', steps: [{ kind: 'map', target: sheet('study') }, { kind: 'control', key: 'start:requirements' }] })
    // With the sheet already open, it is one.
    expect(view(house, 'study', { surface: sheet('study') }).options[0].steps).toEqual([{ kind: 'control', key: 'start:requirements' }])
  })

  it('says what each other room is for and sends the visitor where the work is', () => {
    const drafting = view(house, 'drafting-room')
    expect(drafting.statusKind).toBe('room')
    expect(drafting.status).toBe('This is the Drafting Room. The Draughtsman works out how it will work here.')
    expect(labels(drafting)).toEqual(['Go to the Study', 'Look around the Drafting Room', 'See the whole house'])
    expect(drafting.pose).toBe('watching')

    const foyer = view(house, 'foyer')
    expect(foyer.status).toBe('This is the Foyer, the way in and out.')
    expect(labels(foyer)).toEqual(['Go to the Study', 'Look around the Foyer', 'See the whole house'])

    const attic = view(house, 'attic')
    expect(attic.status).toBe('This is the Attic. Everything that happened in this house is kept here.')
    expect(labels(attic)).toEqual(['Watch how this house was built', 'Step through it myself', 'Go to the Study', 'See the whole house'])
    expect(attic.options[0].steps).toEqual([{ kind: 'map', target: sheet('attic'), focus: { kind: 'heading' } }, { kind: 'control', key: 'attic:toggle' }])
  })

  it('says a locked room is locked, in the room’s own words, and offers only the way out', () => {
    const seance = view(house, 'seance-room')
    expect(seance.statusKind).toBe('locked')
    expect(seance.status).toBe(LOCKED_SEANCE_TEXT)
    expect(labels(seance)).toEqual(['Go to the Study', 'See the whole house'])
    expect(seance.everything.some((option) => ['start', 'decide', 'ask'].includes(option.kind))).toBe(false)
  })

  it('keeps the whole list behind "Something else"', () => {
    const study = view(house, 'study')
    expect(allLabels(study)).toEqual([
      'Have the Archivist write what it must do',
      'Look around the Study',
      'See the whole house',
      'Go to the Foyer',
      'Go to the Drafting Room',
      'Go to the Workshop',
      'Go to the Attic',
      'Go to the Séance Room',
      "Show Kiro's words",
      'Show me what I can press',
      'Leave this house',
    ])
    expect(allLabels(view(house, 'study', { canLeave: false }))).not.toContain('Leave this house')
    // Settings read the other way once they are on.
    const on = view(house, 'study', { words: 'with-kiro', reveal: true, mapOpen: true })
    expect(allLabels(on)).toEqual(expect.arrayContaining(['Put the house map away', "Hide Kiro's words", 'Hide the labels']))
  })
})

describe('a ghost at work', () => {
  const house = houseOf({
    workflow: workflowProjection({ version: 20, phaseOverrides: { requirements: { status: 'working', ghostIds: ['archivist'] } } }),
    snapshots: [snapshot('archivist', 'working')],
  })

  it('names the ghost and says the door stays shut', () => {
    const study = view(house, 'study')
    expect(study.statusKind).toBe('working')
    expect(study.status).toBe('The Archivist is writing. This door stays shut until you open it.')
    expect(labels(study)).toEqual(['Watch the Archivist work', 'See the whole house'])
    expect(study.pose).toBe('watching')
    expect(study.everything.some((option) => option.kind === 'start' || option.kind === 'decide')).toBe(false)
  })
})

describe('a door that waits', () => {
  const house = waitingHouse()
  const doorSurface: HouseSurfaceTarget = { kind: 'door', roomId: 'study', phase: 'requirements', proposalId: 'door-requirements-1' }

  it('offers three things in the room: read it, ask for a change, go to the door', () => {
    const study = view(house, 'study')
    expect(study.statusKind).toBe('door-waiting')
    expect(study.status).toBe('The Archivist has finished what it must do. The door waits for you.')
    expect(labels(study)).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', 'See the whole house'])
    expect(study.pose).toBe('offering-key')
    expect(study.poseLabel).toBe('The Warden holds out a key.')
    // Nothing in the bare room decides.
    expect(study.everything.some((option) => option.kind === 'decide')).toBe(false)
    // Going to the door puts focus on what is being decided, never on a button.
    expect(study.options[2].steps).toEqual([{ kind: 'map', target: doorSurface, focus: { kind: 'proposal', proposalId: 'door-requirements-1' } }])
  })

  it('offers the approval only once the door is in front of the visitor', () => {
    const atDoor = view(house, 'study', { surface: doorSurface })
    expect(atDoor.status).toBe('You are at the door. Opening it accepts this version of what it must do.')
    expect(labels(atDoor)).toEqual(['Open the door', 'Ask for a change', 'Read what it must do again', 'Close this sheet'])
    expect(atDoor.options[0]).toMatchObject({ kind: 'decide', term: 'approve', steps: [{ kind: 'control', key: 'approve:door-requirements-1' }] })
    expect(atDoor.everything.find((option) => option.label === 'Keep the door shut')).toMatchObject({ kind: 'decide', term: 'reject', steps: [{ kind: 'control', key: 'reject:door-requirements-1' }] })

    // The room's sheet shows the same proposal, so it may decide too.
    const onSheet = view(house, 'study', { surface: sheet('study') })
    expect(labels(onSheet)).toEqual(['Open the door', 'Ask for a change', 'Close this sheet', 'See the whole house'])
    // A ghost's details do not show it.
    const onGhost = view(house, 'study', { surface: { kind: 'ghost', roomId: 'study', ghostId: 'archivist' } })
    expect(onGhost.everything.some((option) => option.kind === 'decide')).toBe(false)
  })

  it('offers ready-made changes instead of an empty note', () => {
    const asking = view(house, 'study', { surface: sheet('study'), task: { kind: 'revise', phase: 'requirements', filled: false } })
    expect(labels(asking)).toEqual(['Ask for a shorter version', 'Ask for an example in each one', 'Ask for simpler words', 'Write my own'])
    expect(asking.options[0].steps).toEqual([
      { kind: 'fill', key: 'revise-text:requirements', text: READY_MADE_CHANGES.requirements[0].text },
      { kind: 'task', task: { kind: 'revise', phase: 'requirements', filled: true } },
    ])
    const filled = view(house, 'study', { surface: sheet('study'), task: { kind: 'revise', phase: 'requirements', filled: true } })
    expect(labels(filled).slice(0, 3)).toEqual(['Send this change', 'Choose a different change', 'Write my own'])
    expect(filled.options[0].steps).toEqual([{ kind: 'control', key: 'revise-send:requirements' }, { kind: 'task', task: null }])
    // A task for a document that is not waiting in this room is ignored.
    const stale = view(house, 'study', { surface: sheet('study'), task: { kind: 'revise', phase: 'design', filled: false } })
    expect(labels(stale)[0]).toBe('Open the door')
  })

  it("puts Kiro's word beside the plain one when asked", () => {
    const study = view(house, 'study', { words: 'with-kiro' })
    expect(study.status).toBe('The Archivist has finished what it must do (requirements). The door waits for you.')
    expect(study.terms).toEqual(['requirements'])
    // Labels stay plain; the Kiro word rides on the option.
    expect(labels(study)).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', "See the whole house"])
    expect(study.options.map((option) => option.term)).toEqual(['requirements', 'revise', null, null])
  })
})

describe('a catch', () => {
  const house = waitingHouse()

  it('says who is held and what it asked, and shows the action before any decision', () => {
    const workshop = view(house, 'workshop')
    expect(workshop.statusKind).toBe('catch')
    expect(workshop.status).toBe('Tinker 2 is held. Tinker 2 asks to run a command. Nothing runs until you decide.')
    expect(workshop.pose).toBe('holding')
    expect(workshop.poseLabel).toBe('The Warden is holding Tinker 2.')
    expect(labels(workshop)[0]).toBe('See exactly what it asked')
    expect(workshop.options[0].steps).toEqual([{ kind: 'map', target: sheet('workshop'), focus: { kind: 'proposal', proposalId: 'risky-1' } }])
    expect(workshop.everything.some((option) => option.kind === 'decide')).toBe(false)
  })

  it('offers allow and refuse only beside the action itself', () => {
    const onSheet = view(house, 'workshop', { surface: sheet('workshop') })
    expect(labels(onSheet).slice(0, 2)).toEqual(['Allow it once', 'Refuse it'])
    expect(onSheet.options[0].steps).toEqual([{ kind: 'control', key: 'approve:risky-1' }])
    expect(onSheet.options[1].steps).toEqual([{ kind: 'control', key: 'reject:risky-1' }])
  })

  it('holds a blocked ghost and offers no decision', () => {
    const blocked = withRoom(quietHouse(), 'drafting-room', (room) => ({
      ...room,
      ghosts: [{ ghostId: 'draughtsman', name: 'Draughtsman', state: 'blocked', reason: 'A door upstream is still sealed.', pendingText: null }],
    }))
    const drafting = view(blocked, 'drafting-room')
    expect(drafting.statusKind).toBe('blocked')
    expect(drafting.status).toBe('The Draughtsman is held. A door upstream is still sealed.')
    expect(drafting.pose).toBe('holding')
    expect(drafting.poseLabel).toBe('The Warden is holding the Draughtsman.')
    expect(labels(drafting)[0]).toBe('See why the Draughtsman is held')
    expect(drafting.everything.some((option) => option.kind === 'decide')).toBe(false)
  })

  it('quotes a Crew tool prompt as the house wrote it and offers no decision', () => {
    const prompt = withRoom(quietHouse(), 'foyer', (room) => ({
      ...room,
      waitingItems: [{ kind: 'tool-decision', id: 'permission:["hh-x","m1"]', ghostId: null, label: 'A ghost is waiting on a Crew tool prompt. Answer it in Crew.', status: 'pending', actionAvailable: true }],
    }))
    const foyer = view(prompt, 'foyer')
    expect(foyer.statusKind).toBe('catch')
    expect(foyer.status).toBe('A ghost is waiting on a Crew tool prompt. Answer it in Crew.')
    expect(foyer.poseLabel).toBe('The Warden is holding a ghost.')
    expect(foyer.everything.some((option) => option.kind === 'decide')).toBe(false)
  })
})

describe('a failed ghost', () => {
  const failed = (retry: boolean) =>
    withRoom(quietHouse(), 'study', (room) => ({
      ...room,
      ghosts: [{ ghostId: 'archivist', name: 'Archivist', state: 'failed', reason: 'The run stalled.', pendingText: null }],
      recoveryActions: retry ? [{ runId: 'run-7', ghostId: 'archivist', label: 'Archivist failed. A fresh attempt can be started.', available: true }] : [],
    }))

  it('points at the retry when the house offers one', () => {
    const study = view(failed(true), 'study')
    expect(study.statusKind).toBe('failed')
    expect(study.status).toBe('The Archivist failed. The run stalled. It can be tried again.')
    expect(labels(study).slice(0, 2)).toEqual(['Try the Archivist again', 'See what went wrong'])
    expect(study.options[0]).toMatchObject({ kind: 'start', steps: [{ kind: 'map', target: sheet('study') }, { kind: 'control', key: 'retry:run-7' }] })
    expect(study.pose).toBe('pointing')
  })

  it('only watches when nothing can be tried', () => {
    const study = view(failed(false), 'study')
    expect(study.status).toBe('The Archivist failed. The run stalled.')
    expect(labels(study)[0]).toBe('See what went wrong')
    expect(study.pose).toBe('watching')
  })
})

describe('after a door opens', () => {
  it('sends the visitor to the next room, where the same rhythm starts again', () => {
    const house = AFTER_REQUIREMENTS()
    expect(landingRoom(house)).toBe('drafting-room')
    const study = view(house, 'study')
    expect(study.statusKind).toBe('door-open')
    expect(study.status).toBe('This door is open. The Drafting Room is next.')
    expect(labels(study)).toEqual(['Go to the Drafting Room', 'Read what it must do again', 'See the whole house'])
    expect(study.pose).toBe('pointing')

    const drafting = view(house, 'drafting-room')
    expect(drafting.status).toBe('This is the Drafting Room. The Draughtsman works out how it will work here. Nothing is drawn yet.')
    expect(labels(drafting)).toEqual(['Have the Draughtsman work out how it will work', 'Look around the Drafting Room', 'See the whole house'])
  })

  it('builds every piece of work that is ready through the task board’s own controls', () => {
    const house = AFTER_TASKS()
    expect(landingRoom(house)).toBe('workshop')
    const workshop = view(house, 'workshop')
    expect(workshop.statusKind).toBe('startable')
    expect(workshop.status).toBe('The to-do list is settled. Nothing is built yet.')
    expect(labels(workshop)).toEqual(['Build everything that is ready', 'Choose what to build myself', 'See the whole house'])
    expect(workshop.options[0]).toMatchObject({
      id: 'build-all',
      kind: 'start',
      term: 'build',
      steps: [{ kind: 'map', target: sheet('workshop') }, { kind: 'every', keyPrefix: 'task:' }, { kind: 'control', key: 'start-workshop' }],
    })
    expect(view(house, 'workshop', { words: 'with-kiro' }).status).toBe('The to-do list (tasks) is settled. Nothing is built yet.')
  })
})

describe('a built house', () => {
  const house = BUILT()

  it('says so, lands in the Attic and offers what was made', () => {
    expect(isBuilt(house)).toBe(true)
    expect(isBuilt(AFTER_TASKS())).toBe(false)
    expect(landingRoom(house)).toBe('attic')
    const workshop = view(house, 'workshop')
    expect(workshop.statusKind).toBe('built')
    expect(workshop.status).toBe(BUILT_TEXT)
    expect(labels(workshop)).toEqual(['See what was made', 'Watch how this house was built', 'Go to the Attic', 'Look around the Workshop'])
    expect(workshop.options[0].steps).toEqual([{ kind: 'map', target: sheet('foyer'), focus: { kind: 'section', section: 'built' } }])
    expect(view(house, 'foyer').statusKind).toBe('built')
    const attic = view(house, 'attic')
    expect(attic.statusKind).toBe('room')
    expect(labels(attic)).toEqual(['Watch how this house was built', 'Step through it myself', 'See what was made', 'See the whole house'])
  })
})

describe('a recording', () => {
  it('says the same thing and offers playback instead of anything that changes the house', () => {
    const live = view(waitingHouse(), 'study')
    const replay = view(waitingHouse({ mode: 'replay' }), 'study')
    expect(replay.status).toBe(live.status)
    expect(replay.pose).toBe(live.pose)
    expect(replay.poseLabel).toBe(live.poseLabel)
    expect(labels(replay)).toEqual(['Play or pause the recording', 'Play it from the start', 'Read what it must do', 'Go to the door'])
    expect(replay.everything.some((option) => ['start', 'decide', 'ask'].includes(option.kind))).toBe(false)
    // The recording's own bar says what it is, so the balloon does not repeat it.
    expect(replay.note).toBeNull()
    expect(live.note).toBeNull()
    // A live room whose controls are off says why, in the room's own words.
    const off = withRoom(waitingHouse(), 'study', (room) => ({ ...room, integrity: 'uncertain', mutatingActionsEnabled: false, diagnostic: 'The house is catching up.' }))
    const uncertain = view(off, 'study')
    expect(uncertain.note).toBe('The house is catching up.')
    expect(uncertain.everything.some((option) => ['start', 'decide', 'ask'].includes(option.kind))).toBe(false)
  })
})

describe('quiet mode', () => {
  it('changes how the Warden stands and nothing he would offer', () => {
    const house = waitingHouse()
    const loud = view(house, 'study')
    const quiet = view(house, 'study', { quiet: true })
    expect(quiet.pose).toBe('stepped-back')
    expect(quiet.poseLabel).toBe('The Warden has stepped back.')
    expect(quiet.status).toBe(loud.status)
    expect(quiet.everything).toEqual(loud.everything)
    const study = house.rooms.find((room) => room.roomId === 'study')!
    expect(wardenPose(study, house, true).pose).toBe('stepped-back')
    expect(wardenPose(study, house, false).pose).toBe('offering-key')
  })
})

describe('the guide and the house agree', () => {
  it('never offers a start the room itself does not offer', () => {
    fc.assert(
      fc.property(projectionArb(), (workflow) => {
        const { input, authority } = composeUpstream({ workflow })
        const house = buildHouseProjection(input, { seanceRoom: 'locked', mode: 'live' })
        for (const room of house.rooms) {
          for (const option of view(house, room.roomId).everything) {
            const key = option.steps.flatMap((step) => (step.kind === 'control' ? [step.key] : [])).find((candidate) => candidate.startsWith('start:'))
            if (key === undefined) continue
            const phase = key.slice('start:'.length) as Phase
            const upstream = startView(workflow, workflow.phases[PHASES.indexOf(phase)], authority, null)
            expect(upstream, key).not.toBeNull()
            expect(upstream!.enabled, key).toBe(true)
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('offers the start of each document phase exactly when the house does, on the ordinary walk', () => {
    for (const [house, workflowOf] of [
      [quietHouse(), workflowProjection({ version: 20 })],
      [AFTER_REQUIREMENTS(), workflowProjection({ version: 30, phaseOverrides: { requirements: approved('requirements', 10), design: { status: 'ready' } } })],
    ] as const) {
      const { authority } = composeUpstream({ workflow: workflowOf })
      for (const phase of ['requirements', 'design', 'tasks'] as const) {
        const upstream = startView(workflowOf, workflowOf.phases[PHASES.indexOf(phase)], authority, null)
        const offered = house.rooms.some((room) => view(house, room.roomId).everything.some((option) => option.id === `start:${phase}`))
        expect(offered, phase).toBe(upstream !== null && upstream.enabled)
      }
    }
  })
})

describe('the copy', () => {
  const fixed = [
    ...Object.values(ROOM_PURPOSE_TEXT),
    ...Object.values(POSE_LABEL),
    BUILT_TEXT,
    GUIDE_QUESTION,
    ...Object.values(READY_MADE_CHANGES).flatMap((changes) => changes.flatMap((change) => [change.label, change.text])),
  ]

  it('starts every ready-made change with an approved verb and keeps the lists tidy', () => {
    expect([...APPROVED_VERBS]).toEqual([...APPROVED_VERBS].sort())
    expect(new Set(APPROVED_VERBS).size).toBe(APPROVED_VERBS.length)
    for (const changes of Object.values(READY_MADE_CHANGES)) {
      expect(changes).toHaveLength(3)
      for (const change of changes) expect(APPROVED_VERBS.some((verb) => change.label.startsWith(`${verb} `))).toBe(true)
    }
  })

  it('never talks down and never types a Kiro word', () => {
    for (const text of fixed) {
      expect(text, text).not.toMatch(/[!\p{Extended_Pictographic}]/u)
      for (const phrase of BANNED_PHRASES) expect(new RegExp(`(?<![A-Za-z])${phrase}(?![A-Za-z])`, 'i').test(text), `${phrase}: ${text}`).toBe(false)
      // Templates name terms through slots, so once filled with plain words they hold no Kiro word.
      expect(namesKiroWord(write(text, 'plain')), text).toBe(false)
      expect(namesKiroWord(text.replace(/\{[A-Za-z]+\}/g, '')), text).toBe(false)
    }
  })
})
