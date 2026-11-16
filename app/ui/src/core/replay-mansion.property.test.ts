// Feature: mansion-lifecycle, Property 10: Replay operations are deterministic and isolated
//
// For all valid fixture registries and list, create, and open operation
// sequences, two Replay_Adapter instances started from the same fixture produce
// equivalent response and Foyer-state sequences, make no Gateway request,
// perform no filesystem operation, and preserve the fixture input.
//
// **Validates: Requirements 9.2**
//
// The model under test is the pure registry the SDK stand-in answers from.
// Replies are folded into Foyer state with the live parsers and the live
// reducer, exactly as the Foyer does. Every way out of the page (network,
// browser storage, file pickers) is replaced by a recording spy.
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialFoyerState, foyerReducer, type FoyerState } from './foyer-reducer'
import {
  MANSION_STATUSES,
  isMansionName,
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type MansionDescriptor,
} from './mansion-api'
import {
  REPLAY_MANSIONS_PATH,
  REPLAY_MANSION_ROOT,
  REPLAY_OPEN_MANSION_PATH,
  createReplayMansionModel,
  createReplayMansionState,
  replayMansionOperation,
  replayMansionStep,
  type ReplayMansionOperation,
  type ReplayMansionReply,
} from './replay-mansion'
import source from './replay-mansion.ts?raw'

const POOL = ['attic', 'belfry', 'cellar', 'crypt-2', 'east-wing', 'z'] as const

const validNameArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...POOL) },
  {
    weight: 1,
    arbitrary: fc
      .array(fc.stringMatching(/^[a-z0-9]{1,6}$/), { minLength: 1, maxLength: 5 })
      .map((parts) => parts.join('-'))
      .filter(isMansionName),
  },
)

const invalidNameArb = fc.oneof(
  fc.constantFrom('', 'Attic', 'attic-', '-attic', 'a--b', '../attic', 'attic/..', ' attic', 'a'.repeat(41), 'café'),
  fc.string({ maxLength: 50 }).filter((value) => !isMansionName(value)),
)

/** A recorded `GET /api/mansions` reply: unique names, any status, any order, extra fields allowed. */
const fixtureArb = fc
  .uniqueArray(validNameArb, { maxLength: 8 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc.record({
          name: fc.constant(name),
          projectSpec: fc.constant(name),
          displayPath: fc.constantFrom(`${REPLAY_MANSION_ROOT}/${name}`, `~/workspace/${name}`),
          status: fc.constantFrom(...MANSION_STATUSES),
          recordedExtra: fc.option(fc.boolean(), { nil: undefined }),
        }),
      ),
    ),
  )
  .map((mansions) => ({ schemaVersion: 1, mansions, recordedBy: 'fixture' }))

const bodyArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: validNameArb.map((name) => ({ name })) },
  { weight: 2, arbitrary: invalidNameArb.map((name) => ({ name })) },
  {
    weight: 2,
    arbitrary: fc.oneof(
      fc.jsonValue({ maxDepth: 2 }),
      fc.constantFrom<unknown>(undefined, null, [], {}, { name: 7 }, { name: null }, ['attic'], 'attic'),
      validNameArb.map((name) => ({ name, path: '/tmp/elsewhere' })),
      validNameArb.map((name) => ({ Name: name })),
    ),
  },
  {
    // Design decision 2026-11-16: create also takes an optional feature brief.
    weight: 2,
    arbitrary: fc.oneof(
      fc.tuple(validNameArb, fc.string({ maxLength: 30 })).map(([name, brief]) => ({ name, brief })),
      fc
        .tuple(validNameArb, fc.constantFrom<unknown>('a\u0000b', 'x'.repeat(2001), null, 7))
        .map(([name, brief]) => ({ name, brief })),
      validNameArb.map((name) => ({ name, brief: 'ok', path: '/tmp/elsewhere' })),
    ),
  },
)

const operationArb: fc.Arbitrary<ReplayMansionOperation> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<ReplayMansionOperation>({ kind: 'list' }) },
  { weight: 4, arbitrary: bodyArb.map((body): ReplayMansionOperation => ({ kind: 'create', body })) },
  { weight: 4, arbitrary: bodyArb.map((body): ReplayMansionOperation => ({ kind: 'open', body })) },
)

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function nameOf(operation: ReplayMansionOperation): string {
  if (operation.kind === 'list') return ''
  const body = operation.body
  const name = typeof body === 'object' && body !== null ? (body as { name?: unknown }).name : undefined
  return typeof name === 'string' ? name : ''
}

function isSuccess(reply: ReplayMansionReply): boolean {
  return reply.status >= 200 && reply.status < 300
}

/** Folds one reply into Foyer state the way the Foyer does, using the live parsers and reducer. */
function foldIntoFoyer(state: FoyerState, operation: ReplayMansionOperation, reply: ReplayMansionReply): FoyerState {
  if (operation.kind === 'list') {
    return foyerReducer(state, { type: 'load_succeeded', mansions: parseMansionListResponse(reply.body).mansions })
  }
  const name = nameOf(operation)
  if (operation.kind === 'create') {
    const pending = foyerReducer(state, { type: 'create_started', name })
    return isSuccess(reply)
      ? foyerReducer(pending, { type: 'create_succeeded', mansion: parseCreateMansionResponse(reply.body).mansion })
      : foyerReducer(pending, { type: 'create_failed', name, message: parseMansionApiError(reply.body).error.message })
  }
  const selected = foyerReducer(state, { type: 'mansion_selected', name })
  const pending = foyerReducer(selected, { type: 'open_started', name })
  if (!isSuccess(reply)) {
    return foyerReducer(pending, { type: 'open_failed', name, message: parseMansionApiError(reply.body).error.message })
  }
  const opened = foyerReducer(pending, { type: 'open_succeeded', mansion: parseOpenMansionResponse(reply.body).mansion })
  return foyerReducer(opened, { type: 'returned_to_foyer' })
}

interface Run {
  replies: ReplayMansionReply[]
  states: FoyerState[]
  registries: MansionDescriptor[][]
}

/** One fresh replay model, started from the fixture and loaded like a freshly mounted Foyer. */
function run(fixture: unknown, operations: readonly ReplayMansionOperation[]): Run {
  const model = createReplayMansionModel(fixture)
  const first = model.request({ kind: 'list' })
  let state = foldIntoFoyer(createInitialFoyerState(), { kind: 'list' }, first)
  const result: Run = { replies: [first], states: [state], registries: [model.snapshot()] }
  for (const operation of operations) {
    const reply = model.request(operation)
    state = foldIntoFoyer(state, operation, reply)
    result.replies.push(reply)
    result.states.push(state)
    result.registries.push(model.snapshot())
  }
  return result
}

// Every way out of the page. Any call fails the property.
const escapes: string[] = []

function refuse(name: string) {
  return (..._args: unknown[]): never => {
    escapes.push(name)
    throw new Error(`The replay mansion model must not use ${name}.`)
  }
}

function refuseConstruction(name: string) {
  return class {
    constructor() {
      refuse(name)()
    }
  }
}

beforeEach(() => {
  escapes.length = 0
  // Gateway and network surfaces.
  vi.stubGlobal('fetch', vi.fn(refuse('fetch')))
  vi.stubGlobal('XMLHttpRequest', refuseConstruction('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', refuseConstruction('WebSocket'))
  vi.stubGlobal('EventSource', refuseConstruction('EventSource'))
  // Filesystem and persistent-storage surfaces a browser page can reach.
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(refuse(`Storage.${method}`))
  }
  vi.stubGlobal('indexedDB', { open: refuse('indexedDB.open'), deleteDatabase: refuse('indexedDB.deleteDatabase') })
  vi.stubGlobal('caches', { open: refuse('caches.open') })
  vi.stubGlobal('showOpenFilePicker', refuse('showOpenFilePicker'))
  vi.stubGlobal('showSaveFilePicker', refuse('showSaveFilePicker'))
  vi.stubGlobal('showDirectoryPicker', refuse('showDirectoryPicker'))
  vi.stubGlobal('FileReader', refuseConstruction('FileReader'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Property 10: Replay operations are deterministic and isolated', () => {
  it('two fresh models give the same replies and Foyer states, touch nothing outside, and keep the fixture', () => {
    fc.assert(
      fc.property(fixtureArb, fc.array(operationArb, { maxLength: 30 }), (fixture, operations) => {
        const pristine = structuredClone(fixture)
        deepFreeze(fixture)
        deepFreeze(operations)

        const first = run(fixture, operations)
        const second = run(fixture, operations)

        // Deterministic: equivalent response and Foyer-state sequences.
        expect(second.replies).toEqual(first.replies)
        expect(second.states).toEqual(first.states)
        expect(second.registries).toEqual(first.registries)

        // Isolated: no Gateway request, no filesystem or storage operation.
        expect(escapes).toEqual([])
        expect(fetch).not.toHaveBeenCalled()

        // The fixture input is preserved (and was frozen, so an edit would have thrown).
        expect(fixture).toEqual(pristine)

        first.registries.forEach((registry, index) => {
          // The registry stays unique and name-sorted, and Foyer state tracks it.
          const names = registry.map(({ name }) => name)
          expect(new Set(names).size).toBe(names.length)
          expect(names).toEqual([...names].sort())
          const load = first.states[index].load
          expect(load).toEqual({ kind: 'ready', mansions: registry })
          // No reply or state carries an absolute path.
          expect(JSON.stringify(first.replies[index])).not.toMatch(/"\/|[A-Za-z]:\\\\/)
        })

        operations.forEach((operation, index) => {
          const before = first.registries[index]
          const after = first.registries[index + 1]
          const reply = first.replies[index + 1]
          const name = nameOf(operation)
          const listedBefore = before.find((mansion) => mansion.name === name)

          if (operation.kind === 'list') {
            expect(reply).toEqual({ status: 200, body: { schemaVersion: 1, mansions: before } })
            expect(after).toEqual(before)
            return
          }
          if (!isSuccess(reply)) {
            // A refused operation changes nothing and answers with a stable error body.
            expect(after).toEqual(before)
            expect(() => parseMansionApiError(reply.body)).not.toThrow()
            return
          }
          expect(isMansionName(name)).toBe(true)
          if (operation.kind === 'open') {
            expect(listedBefore?.status).toBe('ready')
            expect(reply).toEqual({ status: 200, body: { mansion: listedBefore } })
            expect(after).toEqual(before)
            return
          }
          // create: 201 exactly when the registry changed, and exactly one record for the name.
          const created = parseCreateMansionResponse(reply.body)
          expect(reply.status).toBe(created.outcome === 'created' ? 201 : 200)
          expect(created.outcome === 'created').toBe(listedBefore?.status !== 'ready')
          expect(after.filter((mansion) => mansion.name === name)).toEqual([created.mansion])
          expect(after.filter((mansion) => mansion.name !== name)).toEqual(
            before.filter((mansion) => mansion.name !== name),
          )
        })
      }),
      { numRuns: 300 },
    )
  })

  it('the pure step never edits the state it was given', () => {
    fc.assert(
      fc.property(fixtureArb, fc.array(operationArb, { maxLength: 15 }), (fixture, operations) => {
        let state = deepFreeze(createReplayMansionState(fixture))
        for (const operation of operations) {
          const step = replayMansionStep(state, operation)
          expect(replayMansionStep(state, operation)).toEqual(step)
          state = deepFreeze(step.state)
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('replay mansion model examples', () => {
  const fixture = {
    schemaVersion: 1,
    mansions: [
      { name: 'weather-station', projectSpec: 'weather-station', displayPath: `${REPLAY_MANSION_ROOT}/weather-station`, status: 'ready' },
      { name: 'lost-lighthouse', projectSpec: 'lost-lighthouse', displayPath: `${REPLAY_MANSION_ROOT}/lost-lighthouse`, status: 'missing' },
      { name: 'crowded-crypt', projectSpec: 'crowded-crypt', displayPath: `${REPLAY_MANSION_ROOT}/crowded-crypt`, status: 'conflict' },
    ],
  }

  it('lists the fixture sorted by name', () => {
    const reply = createReplayMansionModel(fixture).request({ kind: 'list' })
    expect(reply.status).toBe(200)
    expect(parseMansionListResponse(reply.body).mansions.map(({ name }) => name)).toEqual([
      'crowded-crypt',
      'lost-lighthouse',
      'weather-station',
    ])
  })

  it('creates once with 201, then answers 200 existing_compatible', () => {
    const model = createReplayMansionModel(fixture)
    const body = { name: 'new-wing' }
    const mansion = { name: 'new-wing', projectSpec: 'new-wing', displayPath: `${REPLAY_MANSION_ROOT}/new-wing`, status: 'ready' }
    expect(model.request({ kind: 'create', body })).toEqual({ status: 201, body: { outcome: 'created', mansion } })
    expect(model.request({ kind: 'create', body })).toEqual({
      status: 200,
      body: { outcome: 'existing_compatible', mansion },
    })
    expect(model.snapshot().filter(({ name }) => name === 'new-wing')).toHaveLength(1)
  })

  it.each([
    ['create', { name: 'Bad Name' }, 422, 'invalid_mansion_name'],
    ['open', { name: '../etc' }, 422, 'invalid_mansion_name'],
    ['create', { name: 'ok', extra: true }, 400, 'invalid_request'],
    ['create', { name: 'ok', brief: 'a\u0007b' }, 400, 'invalid_request'],
    ['create', { name: 'ok', brief: 'x'.repeat(2001) }, 400, 'invalid_request'],
    ['create', { name: 'ok', brief: null }, 400, 'invalid_request'],
    ['create', { name: 'ok', brief: 'x', path: '/tmp' }, 400, 'invalid_request'],
    ['create', { brief: 'x' }, 400, 'invalid_request'],
    ['create', { name: 'Bad Name', brief: 'x' }, 422, 'invalid_mansion_name'],
    ['open', { name: 'weather-station', brief: 'x' }, 400, 'invalid_request'],
    ['open', 'weather-station', 400, 'invalid_request'],
    ['open', undefined, 400, 'invalid_request'],
    ['create', { name: 'crowded-crypt' }, 409, 'mansion_conflict'],
    ['open', { name: 'crowded-crypt' }, 409, 'mansion_conflict'],
    ['open', { name: 'lost-lighthouse' }, 409, 'mansion_missing'],
    ['open', { name: 'never-made' }, 404, 'mansion_not_registered'],
  ] as const)('%s %j answers %i %s and changes nothing', (kind, body, status, code) => {
    const model = createReplayMansionModel(fixture)
    const before = model.snapshot()
    const reply = model.request({ kind, body })
    expect(reply.status).toBe(status)
    expect(parseMansionApiError(reply.body).error.code).toBe(code)
    expect(model.snapshot()).toEqual(before)
  })

  it('creates with a valid or blank brief exactly as it creates with a name alone', () => {
    for (const brief of ['A tide clock.\r\nWith alarms.', '  ', '\u{1F47B}'.repeat(2000)]) {
      const withBrief = createReplayMansionModel(fixture)
      const nameOnly = createReplayMansionModel(fixture)
      expect(withBrief.request({ kind: 'create', body: { name: 'new-wing', brief } })).toEqual(
        nameOnly.request({ kind: 'create', body: { name: 'new-wing' } }),
      )
      expect(withBrief.snapshot()).toEqual(nameOnly.snapshot())
    }
  })

  it('recreates a missing mansion, as the live planner does, and then opens it', () => {
    const model = createReplayMansionModel(fixture)
    expect(model.request({ kind: 'create', body: { name: 'lost-lighthouse' } }).status).toBe(201)
    expect(model.request({ kind: 'open', body: { name: 'lost-lighthouse' } }).status).toBe(200)
  })

  it('hands out copies: editing a reply or a snapshot cannot change the registry', () => {
    const model = createReplayMansionModel(fixture)
    const reply = model.request({ kind: 'list' }) as { body: { mansions: MansionDescriptor[] } }
    reply.body.mansions.length = 0
    ;(model.snapshot()[0] as { status: string }).status = 'missing'
    expect(model.snapshot()).toHaveLength(3)
    expect(model.snapshot()[0].status).toBe('conflict')
  })

  it('refuses a fixture the live list parser would refuse', () => {
    expect(() => createReplayMansionModel({ schemaVersion: 1, mansions: [{ name: 'x' }] })).toThrow()
    expect(() => createReplayMansionModel(null)).toThrow()
  })

  it('routes only the three live calls', () => {
    expect(replayMansionOperation('GET', REPLAY_MANSIONS_PATH)).toEqual({ kind: 'list' })
    expect(replayMansionOperation('POST', REPLAY_MANSIONS_PATH, { name: 'a' })).toEqual({ kind: 'create', body: { name: 'a' } })
    expect(replayMansionOperation('POST', REPLAY_OPEN_MANSION_PATH, { name: 'a' })).toEqual({ kind: 'open', body: { name: 'a' } })
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect(replayMansionOperation(method, REPLAY_MANSIONS_PATH, { name: 'a' })).toBeNull()
      expect(replayMansionOperation(method, `${REPLAY_MANSIONS_PATH}/a`)).toBeNull()
    }
    expect(replayMansionOperation('GET', REPLAY_OPEN_MANSION_PATH)).toBeNull()
    expect(replayMansionOperation('GET', `${REPLAY_MANSIONS_PATH}/`)).toBeNull()
    expect(replayMansionOperation('POST', `${REPLAY_MANSIONS_PATH}/delete`, { name: 'a' })).toBeNull()
  })

  it('imports nothing but the pure mansion parsers', () => {
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    expect(imports).toEqual(['./mansion-api'])
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(|localStorage|Date\.now|new Date|Math\.random/)
  })
})
