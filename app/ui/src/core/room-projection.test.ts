// Room Ghosts read-route parser (Spec 5 task 9.1).
// **Validates: Requirements 10.4, 10.6, 11.1**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import vectorsJson from '../../../../fixtures/room-ghosts/room-projection-vectors.json'
import {
  DOCUMENT_PHASES,
  MAX_CONTENT_CHARACTERS,
  emptyRoomGhosts,
  parseRoomGhosts,
  roomGhostsToJson,
  type RoomGhosts,
} from './room-projection'
import { MANSION } from '../test/workflow-arbitraries'
import { SPEC, artifact, document, roomGhosts, run, workshopAtWork } from '../test/room-kit'

interface Vectors {
  readonly valid: readonly { readonly name: string; readonly value: unknown }[]
  readonly invalid: readonly { readonly name: string; readonly refused_at: string; readonly value: unknown }[]
}
const vectors = vectorsJson as unknown as Vectors

const wire = (value: RoomGhosts): unknown => JSON.parse(JSON.stringify(roomGhostsToJson(value)))

function parsed(value: unknown, mansion?: string, spec?: string): RoomGhosts {
  const result = parseRoomGhosts(value, mansion, spec)
  if (!result.ok) throw new Error(`refused at ${result.path}`)
  return result.roomGhosts
}

describe('shared Room Ghosts vectors', () => {
  it('has valid and invalid vectors to check', () => {
    expect(vectors.valid.length).toBeGreaterThanOrEqual(5)
    expect(vectors.invalid.length).toBeGreaterThanOrEqual(30)
  })

  it.each(vectors.valid.map((vector) => [vector.name, vector.value] as const))('accepts %s and prints it back unchanged', (_name, value) => {
    expect(wire(parsed(value))).toEqual(value)
  })

  it.each(vectors.invalid.map((vector) => [vector.name, vector.refused_at, vector.value] as const))(
    'refuses %s at %s',
    (_name, refusedAt, value) => {
      expect(parseRoomGhosts(value)).toEqual({ ok: false, path: refusedAt })
    },
  )

  it('carries no home path, token or secret-shaped text', () => {
    const text = JSON.stringify(vectors)
    expect(text).not.toMatch(/\/Users\/|\/home\/|token|secret|Bearer/i)
  })
})

describe('parseRoomGhosts', () => {
  it('reads the empty answer: three unwritten documents in workflow order', () => {
    const value = parsed(wire(emptyRoomGhosts(MANSION, SPEC)), MANSION, SPEC)
    expect(value.documents.map((item) => item.phase)).toEqual([...DOCUMENT_PHASES])
    expect(value.documents.map((item) => item.artifact)).toEqual([null, null, null])
    expect(value.documents[0].writeScope).toEqual(['.kiro/specs/demo/requirements.md'])
    expect(value).toMatchObject({ taskPlan: null, runs: [], review: null, readOnly: false, seanceEnabled: false })
  })

  it('refuses an answer about another Mansion or another spec', () => {
    const body = wire(roomGhosts())
    expect(parseRoomGhosts(body, 'other-mansion', SPEC)).toEqual({ ok: false, path: '$.mansion_id' })
    expect(parseRoomGhosts(body, MANSION, 'other')).toEqual({ ok: false, path: '$.spec_name' })
    expect(parseRoomGhosts(body, MANSION, SPEC).ok).toBe(true)
  })

  it('keeps the task plan, claims, outcomes and backpressure of a working Workshop', () => {
    const value = parsed(wire(workshopAtWork()))
    const plan = value.taskPlan!
    expect(plan.waves).toEqual([
      ['1.2', '2.1'],
      ['1.3', '2.2'],
    ])
    expect(plan.tasks.find((item) => item.taskId === '2.1')).toMatchObject({
      optional: false,
      writes: ['src/guestbook/render.py', 'src/guestbook/templates/*.html'],
      outcome: { status: 'queued', attempt: 0 },
      backpressure: { dispatchFailures: 2, nextDelaySeconds: 4, lastReason: 'crew_capacity' },
    })
    expect(value.runs[0]).toMatchObject({ ghostId: 'tinker-1', taskId: '1.2', canCancel: true, claimPaths: ['src/guestbook/store.py'] })
  })

  it('accepts withheld document text and a document at the size limit, and refuses one over it', () => {
    const withText = (content: string | null) => wire(roomGhosts({ documents: [document('requirements', { artifact: artifact({ content }) }), document('design'), document('tasks')] }))
    expect(parsed(withText(null)).documents[0].artifact?.content).toBeNull()
    expect(parseRoomGhosts(withText('x'.repeat(MAX_CONTENT_CHARACTERS))).ok).toBe(true)
    expect(parseRoomGhosts(withText('x'.repeat(MAX_CONTENT_CHARACTERS + 1)))).toEqual({ ok: false, path: '$.documents[0].artifact.content' })
  })

  it('accepts a session link only as a plain slot key', () => {
    const withLink = (sessionLink: string | null) => wire(roomGhosts({ runs: [run({ sessionLink })] }))
    expect(parsed(withLink('hh-archivist-requirements-1')).runs[0].sessionLink).toBe('hh-archivist-requirements-1')
    for (const link of ['', 'dashboard:hh-archivist', '/chat?sid=x', 'https://example.test/chat', 'a b', 'x'.repeat(161)]) {
      expect(parseRoomGhosts(withLink(link))).toEqual({ ok: false, path: '$.runs[0].session_link' })
    }
  })

  it('refuses claim paths on a run that has no task', () => {
    const body = wire(roomGhosts({ runs: [run({ claimPaths: ['src/a.py'] })] }))
    expect(parseRoomGhosts(body)).toEqual({ ok: false, path: '$.runs[0].claim_paths' })
  })

  it('refuses a read_only flag that is not a boolean', () => {
    const body = { ...(wire(roomGhosts()) as object), read_only: 'yes' }
    expect(parseRoomGhosts(body)).toEqual({ ok: false, path: '$.read_only' })
  })

  it('never throws on arbitrary input and never accepts it by accident', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = parseRoomGhosts(value)
        expect(result.ok).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  // Regression: this check used to draw mutations at random and failed about once in
  // 7 whole-suite runs. The cause was the test, not the parser: one of its "wrong"
  // replacements, `[[]]`, is a valid value for `task_plan.waves` when no task names a
  // wave (one empty wave), which the plan of the review vector allows. The check now
  // walks every mutation, so it cannot depend on a seed, and uses `[[[]]]`, which no
  // field accepts.
  it('accepts a wave that lists no task, where no task claims a wave', () => {
    const review = vectors.valid.find((vector) => vector.name === 'seance_review_changes_requested')!.value as { task_plan: { waves: unknown } }
    const body = JSON.parse(JSON.stringify(review)) as { task_plan: { waves: unknown } }
    expect(body.task_plan.waves).toEqual([])
    body.task_plan.waves = [[]]
    const result = parseRoomGhosts(body)
    expect(result.ok && result.roomGhosts.taskPlan?.waves).toEqual([[]])
    // A wave may still not name a task that says another wave, or none.
    body.task_plan.waves = [['1.1']]
    expect(parseRoomGhosts(body)).toEqual({ ok: false, path: '$.task_plan.waves[0][0]' })
  })

  it('refuses a valid answer after any one field is removed or replaced by a wrong type (every case)', () => {
    /** Every path to a value inside `value`. */
    const paths = (value: unknown, prefix: (string | number)[] = []): (string | number)[][] => {
      if (Array.isArray(value)) return value.flatMap((item, index) => [[...prefix, index], ...paths(item, [...prefix, index])])
      if (typeof value === 'object' && value !== null) {
        return Object.entries(value).flatMap(([key, item]) => [[...prefix, key], ...paths(item, [...prefix, key])])
      }
      return []
    }
    // Values no field of this schema accepts. The text carries a control character.
    const replacements: unknown[] = [-1.5, { nested: true }, `not${String.fromCharCode(0)}valid`, [[[]]]]
    const accepted: string[] = []
    let cases = 0
    for (const vector of vectors.valid) {
      for (const path of paths(vector.value)) {
        const last = path[path.length - 1]
        for (const [index, replacement] of [...replacements, undefined].entries()) {
          const remove = index === replacements.length
          // An array element cannot be "absent"; shortening a list is covered by the named vectors.
          if (remove && typeof last !== 'string') continue
          // `read_only` is the one optional key: removing it leaves a valid answer.
          if (remove && path.length === 1 && last === 'read_only') continue
          // The document text is the one field that accepts any string.
          if (typeof replacement === 'string' && last === 'content') continue
          const copy = JSON.parse(JSON.stringify(vector.value)) as Record<string | number, unknown>
          let at = copy
          for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
          if (remove) delete at[last]
          else at[last] = replacement
          cases += 1
          if (parseRoomGhosts(copy).ok) accepted.push(`${vector.name} ${JSON.stringify(path)} ${remove ? 'removed' : JSON.stringify(replacement)}`)
        }
      }
    }
    expect(accepted).toEqual([])
    expect(cases).toBeGreaterThan(1500)
  })
})
