// The practice house against the demo recording.
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { decisionPoints, logNumbers, logNumbersText, nextDecision, practiceAnswer } from './practice'
import { parseEventLog } from './seance-log'

const EVENTS = parseEventLog(demo).events

describe('practice on the demo recording', () => {
  it('finds the six decisions the owner made, in order', () => {
    const points = decisionPoints(EVENTS)
    expect(points.map((point) => [point.subject, point.recorded])).toEqual([
      ['door', 'approved'],
      ['door', 'approved'],
      ['risky', 'rejected'],
      ['door', 'approved'],
      ['risky', 'approved'],
      ['door', 'approved'],
    ])
    expect(points[2].question).toBe('Tinker 2 wants to run "bun test". Do you let it?')
    expect(points[4].question).toBe('Tinker 2 wants to run "bun test lantern.test.ts". Do you let it?')
    expect(points[0].question).toBe('The Archivist has finished what it must do (the requirements). Do you open the door?')
    expect(nextDecision(points, 64)?.proposalId).toBe('risky-run-tests-1')
  })

  it('explains a choice against the recording and decides nothing', () => {
    const held = decisionPoints(EVENTS)[2]
    expect(practiceAnswer(held, 'rejected')).toEqual({
      meaning: 'Refusing it means nothing runs. The ghost goes back to its work and may ask again for less.',
      recorded: 'In the recording, the owner chose: refuse it.',
      same: true,
    })
    expect(practiceAnswer(held, 'approved').same).toBe(false)
  })

  it('counts the run from the log', () => {
    const numbers = logNumbers(EVENTS)
    expect(numbers).toEqual({ records: 91, ghosts: 7, waits: numbers.waits })
    expect(numbers.waits).toBeGreaterThanOrEqual(6)
    expect(logNumbersText(numbers)).toMatch(/^This recording holds 91 events from 7 ghosts\. The house stopped and waited for a person \d+ times\.$/)
  })
})
