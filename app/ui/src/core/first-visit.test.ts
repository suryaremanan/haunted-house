// The first visit in examples (Spec 8, Requirements 9.6, 10.1, 10.10, 10.11):
// the three example ideas, the greeting, and what the Warden says in the hall
// to a first-time visitor, a returning visitor and the visitor of a recording.
// Every hall state is reached through the reducer, the way the page reaches it.
import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_IDEAS,
  GATE_QUESTION,
  IDEA_QUESTION,
  NAMELESS_GREETING,
  greeting,
  hallGuide,
  initialVisit,
  visitReducer,
  visitorName,
  type HallGuideView,
  type HallMansion,
  type VisitEvent,
  type VisitState,
} from './first-visit'
import { MAX_MANSION_BRIEF_LENGTH, isMansionName, normalizeMansionBrief } from './mansion-api'

function visit(replay: boolean, ...events: VisitEvent[]): VisitState {
  return events.reduce(visitReducer, initialVisit(replay))
}

const EMPTY_LIST: VisitEvent = { type: 'list_loaded', mansionCount: 0 }

/** Knocked with a name on a live page that holds nothing: the hall is asking what to build. */
const FIRST_TIME = visit(false, EMPTY_LIST, { type: 'knocked', name: 'Ada' })
const FIRST_TIME_NAMELESS = visit(false, EMPTY_LIST, { type: 'knocked', name: '' })
/** The same visitor after putting the question away. */
const FIRST_TIME_NOT_ASKING = visit(false, EMPTY_LIST, { type: 'knocked', name: 'Ada' }, { type: 'idea_closed' })
/** A live page that loaded with a mansion: no Gate, no question. */
const RETURNING = visit(false, { type: 'list_loaded', mansionCount: 1 })
/** The same visitor after choosing to build something new. */
const RETURNING_ASKING = visit(false, { type: 'list_loaded', mansionCount: 1 }, { type: 'idea_opened' })
/** The static replay after a knock: a recording has nothing to build, so it never asks. */
const RECORDING = visit(true, { type: 'list_loaded', mansionCount: 1 }, { type: 'knocked', name: '' })
const RECORDING_NAMED = visit(true, { type: 'list_loaded', mansionCount: 1 }, { type: 'knocked', name: 'Ada' })

const HALL_QUESTION = 'What do you want to do?'
const STEP_OUTSIDE = { id: 'step-outside', label: 'Step outside', consequence: 'Shows the front gate again. Nothing is removed.' }
const BUILD_NEW = { id: 'build-new', label: 'Build something new', consequence: 'Asks what you want to build. Nothing is made yet.' }
const NAME_MYSELF = {
  id: 'name-myself',
  label: 'Choose the name myself',
  consequence: 'Goes to the form below, where you name the mansion and describe it.',
}
const POINTING = { pose: 'pointing', poseLabel: 'The Warden points to your next step.' }
const WATCHING = { pose: 'watching', poseLabel: 'The Warden is watching.' }

function enter(name: string): { id: string; label: string; consequence: string } {
  return { id: `enter:${name}`, label: `Go back into ${name}`, consequence: 'Opens it in the room where the work is.' }
}

function watch(name: string): { id: string; label: string; consequence: string } {
  return { id: `watch:${name}`, label: `Watch ${name} get built`, consequence: 'Opens the recorded house. Nothing in a recording can be changed.' }
}

const ATTIC: HallMansion = { name: 'attic', status: 'ready' }
const BELFRY: HallMansion = { name: 'belfry', status: 'ready' }
const CELLAR_MISSING: HallMansion = { name: 'cellar', status: 'missing' }
const CRYPT_CONFLICT: HallMansion = { name: 'crypt', status: 'conflict' }
const DEMO: HallMansion = { name: 'demo-mansion', status: 'ready' }

describe('the example ideas', () => {
  it('are a word counter, a to-do list and a unit converter, each with its own name', () => {
    expect(EXAMPLE_IDEAS.map(({ name }) => name)).toEqual(['word-counter', 'to-do-list', 'unit-converter'])
    expect(EXAMPLE_IDEAS.map(({ title }) => title)).toEqual(['A word counter', 'A to-do list', 'A unit converter'])
    expect(new Set(EXAMPLE_IDEAS.map(({ name }) => name)).size).toBe(3)
    expect(new Set(EXAMPLE_IDEAS.map(({ brief }) => brief)).size).toBe(3)
  })

  for (const idea of EXAMPLE_IDEAS) {
    it(`${idea.name} has a valid name and a brief the mansion rules accept`, () => {
      expect(isMansionName(idea.name)).toBe(true)
      expect(idea.title.trim()).not.toBe('')
      expect(idea.brief.trim()).not.toBe('')
      // Accepted as it stands: nothing to trim, no line ending to change, no refused character.
      const length = Array.from(idea.brief).length
      expect(normalizeMansionBrief(idea.brief)).toEqual({ ok: true, brief: idea.brief, length })
      // Well under the limit, so there is room to add to it.
      expect(length).toBeLessThanOrEqual(MAX_MANSION_BRIEF_LENGTH / 4)
    })
  }
})

describe('the greeting', () => {
  it('greets by name, or without one', () => {
    expect(NAMELESS_GREETING).toBe('Come in.')
    expect(greeting('')).toBe('Come in.')
    expect(greeting('Ada')).toBe('Come in, Ada.')
    expect(greeting(visitorName('  Ada \n Lovelace\t'))).toBe('Come in, Ada Lovelace.')
    expect(greeting(visitorName(' \t\n'))).toBe('Come in.')
  })
})

describe('the words at the Gate and in the hall', () => {
  it('ask one fixed question each', () => {
    expect(GATE_QUESTION).toBe('Who is knocking?')
    expect(IDEA_QUESTION).toBe('What do you want to build?')
  })
})

describe('the hall guide', () => {
  it('reaches each hall state through the reducer', () => {
    expect(FIRST_TIME).toStrictEqual({ place: 'hall', visitorName: 'Ada', firstTime: true, idea: true, replay: false, cameFrom: 'hall' })
    expect(FIRST_TIME_NAMELESS).toStrictEqual({ place: 'hall', visitorName: '', firstTime: true, idea: true, replay: false, cameFrom: 'hall' })
    expect(FIRST_TIME_NOT_ASKING).toStrictEqual({ place: 'hall', visitorName: 'Ada', firstTime: true, idea: false, replay: false, cameFrom: 'hall' })
    expect(RETURNING).toStrictEqual({ place: 'hall', visitorName: '', firstTime: false, idea: false, replay: false, cameFrom: 'hall' })
    expect(RETURNING_ASKING).toStrictEqual({ place: 'hall', visitorName: '', firstTime: false, idea: true, replay: false, cameFrom: 'hall' })
    expect(RECORDING).toStrictEqual({ place: 'hall', visitorName: '', firstTime: true, idea: false, replay: true, cameFrom: 'hall' })
    expect(RECORDING_NAMED).toStrictEqual({ place: 'hall', visitorName: 'Ada', firstTime: true, idea: false, replay: true, cameFrom: 'hall' })
  })

  it('greets a first-time visitor by name and asks what to build', () => {
    expect(hallGuide(FIRST_TIME, [], null, null)).toStrictEqual({
      status: 'Come in, Ada. Nothing here opens unless you open it.',
      question: 'What do you want to build?',
      options: [NAME_MYSELF, STEP_OUTSIDE],
      ...POINTING,
    })
    // Without a name the greeting is the nameless one.
    expect(hallGuide(FIRST_TIME_NAMELESS, [], null, null).status).toBe('Come in. Nothing here opens unless you open it.')
  })

  it('offers a first-time visitor who put the question away to build something new', () => {
    expect(hallGuide(FIRST_TIME_NOT_ASKING, [], null, null)).toStrictEqual({
      status: 'Come in, Ada. No mansion stands here yet.',
      question: HALL_QUESTION,
      options: [BUILD_NEW, STEP_OUTSIDE],
      ...POINTING,
    })
  })

  it('sends a returning visitor back into the one ready mansion first', () => {
    const view = hallGuide(RETURNING, [ATTIC], null, null)
    expect(view).toStrictEqual({
      status: 'One mansion stands here: attic.',
      question: HALL_QUESTION,
      options: [enter('attic'), BUILD_NEW, STEP_OUTSIDE],
      ...POINTING,
    })
    expect(view.options[0].id).toBe('enter:attic')
  })

  it('sends a returning visitor back into the selected mansion when several stand', () => {
    const view = hallGuide(RETURNING, [ATTIC, BELFRY, CELLAR_MISSING], 'belfry', null)
    expect(view).toStrictEqual({
      status: '3 mansions stand here.',
      question: HALL_QUESTION,
      options: [enter('belfry'), BUILD_NEW, STEP_OUTSIDE],
      ...POINTING,
    })
    expect(view.options[0].id).toBe('enter:belfry')
  })

  it('offers no mansion to go back into when several stand and none is selected', () => {
    const view = hallGuide(RETURNING, [ATTIC, BELFRY, CELLAR_MISSING], null, null)
    expect(view).toStrictEqual({
      status: '3 mansions stand here.',
      question: HALL_QUESTION,
      options: [BUILD_NEW, STEP_OUTSIDE],
      ...WATCHING,
    })
    expect(view.options.some(({ id }) => id.startsWith('enter:'))).toBe(false)
  })

  it('offers no mansion to go back into when the only one is not ready', () => {
    for (const mansion of [CELLAR_MISSING, CRYPT_CONFLICT]) {
      // Selected or not: a mansion that is not ready cannot be opened.
      for (const selected of [null, mansion.name]) {
        const view = hallGuide(RETURNING, [mansion], selected, null)
        expect(view).toStrictEqual({
          // It says so, and where the reason is: the list's own row for that mansion.
          status: `One mansion stands here, ${mansion.name}, but it cannot be opened. The list below says why.`,
          question: HALL_QUESTION,
          options: [BUILD_NEW, STEP_OUTSIDE],
          ...WATCHING,
        })
        expect(view.options.some(({ id }) => id.startsWith('enter:'))).toBe(false)
      }
    }
  })

  it('asks a returning visitor what to build once they choose to build something new', () => {
    expect(hallGuide(RETURNING_ASKING, [ATTIC], null, null)).toStrictEqual({
      status: 'Nothing here opens unless you open it.',
      question: 'What do you want to build?',
      options: [enter('attic'), NAME_MYSELF, STEP_OUTSIDE],
      ...POINTING,
    })
  })

  it('invites the visitor of a recording to watch the recorded mansion first', () => {
    const view = hallGuide(RECORDING, [DEMO], null, 'demo-mansion')
    expect(view).toStrictEqual({
      status: 'Come in. This house holds a recording of demo-mansion being built.',
      question: HALL_QUESTION,
      options: [watch('demo-mansion'), STEP_OUTSIDE],
      ...POINTING,
    })
    expect(view.options[0].id).toBe('watch:demo-mansion')
    // The invited mansion comes first wherever it is listed, and a named visitor is greeted by name.
    const named = hallGuide(RECORDING_NAMED, [ATTIC, DEMO], null, 'demo-mansion')
    expect(named.status).toBe('Come in, Ada. This house holds a recording of demo-mansion being built.')
    expect(named.options.map(({ id }) => id)).toEqual(['watch:demo-mansion', 'step-outside'])
  })

  it('says so when a recording could not be read', () => {
    for (const mansions of [[], [CELLAR_MISSING]]) {
      expect(hallGuide(RECORDING, mansions, null, 'demo-mansion')).toStrictEqual({
        status: 'Come in. This house holds a recording, but it could not be read.',
        question: HALL_QUESTION,
        options: [STEP_OUTSIDE],
        ...WATCHING,
      })
    }
  })

  it('never offers more than four things, repeats none, and never shouts', () => {
    const states = [FIRST_TIME, FIRST_TIME_NAMELESS, FIRST_TIME_NOT_ASKING, RETURNING, RETURNING_ASKING, RECORDING, RECORDING_NAMED]
    const lists: readonly (readonly HallMansion[])[] = [
      [],
      [ATTIC],
      [CELLAR_MISSING],
      [ATTIC, CELLAR_MISSING],
      [ATTIC, BELFRY, CELLAR_MISSING, CRYPT_CONFLICT],
      [DEMO],
      [ATTIC, DEMO],
    ]
    const names = [null, 'attic', 'belfry', 'cellar', 'demo-mansion', 'nowhere']
    const views: HallGuideView[] = []
    for (const state of states) {
      for (const mansions of lists) {
        for (const selected of names) {
          for (const invited of names) {
            const view = hallGuide(state, mansions, selected, invited)
            views.push(view)
            // Going back in, or watching, is only ever offered for a listed mansion that is ready.
            for (const { id } of view.options) {
              if (!id.startsWith('enter:') && !id.startsWith('watch:')) continue
              expect(id.startsWith('watch:')).toBe(state.replay)
              expect(mansions).toContainEqual({ name: id.slice(id.indexOf(':') + 1), status: 'ready' })
            }
          }
        }
      }
    }
    expect(views).toHaveLength(states.length * lists.length * names.length * names.length)
    for (const view of views) {
      expect(view.options.length).toBeGreaterThanOrEqual(1)
      expect(view.options.length).toBeLessThanOrEqual(4)
      expect(new Set(view.options.map(({ id }) => id)).size).toBe(view.options.length)
      for (const option of view.options) {
        expect(option.label.trim()).not.toBe('')
        expect(option.consequence.trim()).not.toBe('')
        expect(option.label).not.toContain('!')
        expect(option.consequence).not.toContain('!')
      }
      // The same holds for everything else the balloon says.
      for (const line of [view.status, view.question, view.poseLabel]) {
        expect(line.trim()).not.toBe('')
        expect(line).not.toContain('!')
      }
      expect([HALL_QUESTION, IDEA_QUESTION]).toContain(view.question)
    }
  })
})
