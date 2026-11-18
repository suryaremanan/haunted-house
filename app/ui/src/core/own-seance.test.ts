// Bring your own séance: the check accepts a whole log and nothing else.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import vectors from '../../../../fixtures/seance/workflow-vectors.json'
import { OWN_SEANCE_BROKEN, OWN_SEANCE_EMPTY, OWN_SEANCE_MAX_BYTES, OWN_SEANCE_NOT_A_LOG, OWN_SEANCE_TOO_BIG, checkOwnSeance } from './own-seance'
import { serializeAppEvent } from './seance-event'
import { parseEventLog } from './seance-log'

const bytes = (text: string) => new TextEncoder().encode(text).length
const MESSAGES = new Set([OWN_SEANCE_BROKEN, OWN_SEANCE_EMPTY, OWN_SEANCE_NOT_A_LOG, OWN_SEANCE_TOO_BIG])

describe('checkOwnSeance', () => {
  it('accepts the demo log and the vector log whole, naming their mansions', () => {
    const accepted = checkOwnSeance(demo, bytes(demo))
    expect(accepted).toMatchObject({ ok: true, mansionIds: ['demo-mansion'] })
    if (accepted.ok) expect(accepted.records).toHaveLength(91)
    const other = (vectors.events as unknown[]).map((raw) => JSON.stringify(raw)).join('\n') + '\n'
    const second = checkOwnSeance(other, bytes(other))
    expect(second).toMatchObject({ ok: true, mansionIds: ['vector-mansion'] })
  })

  it('refuses an empty, foreign, cut or oversized file with one plain sentence', () => {
    expect(checkOwnSeance('', 0)).toEqual({ ok: false, message: OWN_SEANCE_EMPTY })
    expect(checkOwnSeance('hello\nworld\n', 12)).toEqual({ ok: false, message: OWN_SEANCE_NOT_A_LOG })
    const lines = demo.split('\n').filter((line) => line !== '')
    const cut = [...lines.slice(0, 10), ...lines.slice(11)].join('\n') + '\n'
    expect(checkOwnSeance(cut, bytes(cut)).ok).toBe(false)
    expect(checkOwnSeance(demo, OWN_SEANCE_MAX_BYTES + 1)).toEqual({ ok: false, message: OWN_SEANCE_TOO_BIG })
  })

  it('Property 1: any change to one line of a real log is refused, and every refusal is one of the fixed sentences', () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    fc.assert(
      fc.property(fc.integer({ min: 0, max: lines.length - 1 }), fc.string({ minLength: 1, maxLength: 40 }), (index, junk) => {
        const changed = [...lines]
        changed[index] = changed[index].slice(0, Math.max(1, changed[index].length - junk.length)) + junk
        const text = changed.join('\n') + '\n'
        if (text === demo) return
        const result = checkOwnSeance(text, bytes(text))
        if (result.ok) {
          // Only a change that leaves the line a byte-identical valid event could pass; then the log is still whole.
          expect(parseEventLog(text).events.map(serializeAppEvent).join('')).toBe(text)
        } else {
          expect(MESSAGES.has(result.message)).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })
})
