// Practice mode for the static replay (Spec 10, practice-house): while it is
// on, playback stops on the record before each owner decision and waits for
// the visitor's choice; "Go on" plays past it. The decision points and the
// answers come from core/practice.ts. Nothing is written and no request is
// made: the hook only sends the replay's own pause, seek and play commands.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AtticReplay } from '../../adapters/attic-replay'
import { decisionPoints, logNumbers, practiceAnswer, type DecisionPoint, type LogNumbers, type PracticeAnswer, type PracticeChoice } from '../../core/practice'

export interface PracticeModel {
  readonly on: boolean
  readonly toggle: () => void
  /** The decision the visitor faces now, or null. */
  readonly asking: DecisionPoint | null
  /** The visitor's choice at `asking`, explained, once made. */
  readonly answer: PracticeAnswer | null
  readonly choose: (choice: PracticeChoice) => void
  readonly goOn: () => void
  readonly numbers: LogNumbers
  /** How many decisions the recording holds, and how many the visitor has made. */
  readonly made: number
  readonly total: number
}

export function usePractice(attic: AtticReplay): PracticeModel {
  const records = attic.model.records
  const points = useMemo(() => decisionPoints(records), [records])
  const numbers = useMemo(() => logNumbers(records), [records])
  const [on, setOn] = useState(false)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const [answer, setAnswer] = useState<PracticeAnswer | null>(null)
  const { cursor, status } = attic.state
  const command = attic.command

  // Playback that reaches an unanswered decision stops on the record before it.
  const previous = useRef(cursor)
  useEffect(() => {
    const before = previous.current
    previous.current = cursor
    if (!on) return
    const crossed = points.find((point) => !answered.has(point.eventId) && before < point.sequence && cursor >= point.sequence - 1 && before <= point.sequence - 1)
    if (crossed === undefined) return
    if (status === 'playing') command({ kind: 'pause' })
    if (cursor !== crossed.sequence - 1) command({ kind: 'seek', cursor: crossed.sequence - 1 })
  }, [on, cursor, status, points, answered, command])

  const asking = on ? (points.find((point) => !answered.has(point.eventId) && cursor === point.sequence - 1) ?? null) : null

  // Turning practice on goes straight to the next decision, so a visitor is asked at once rather than after a minute
  // of playback; "Go on" then plays the recording from that decision to the next.
  const toggle = useCallback(() => {
    const turningOn = !on
    setOn(turningOn)
    setAnswered(new Set())
    setAnswer(null)
    if (!turningOn) return
    const next = points.find((point) => point.sequence > cursor) ?? points[0]
    if (next === undefined) return
    if (status === 'playing') command({ kind: 'pause' })
    previous.current = next.sequence - 1
    command({ kind: 'seek', cursor: next.sequence - 1 })
  }, [on, points, cursor, status, command])
  const choose = useCallback(
    (choice: PracticeChoice) => {
      if (asking !== null) setAnswer(practiceAnswer(asking, choice))
    },
    [asking],
  )
  const goOn = useCallback(() => {
    if (asking === null) return
    setAnswered((set) => new Set([...set, asking.eventId]))
    setAnswer(null)
    previous.current = asking.sequence
    command({ kind: 'seek', cursor: asking.sequence })
    command({ kind: 'play' })
  }, [asking, command])

  return { on, toggle, asking, answer: asking === null ? null : answer, choose, goOn, numbers, made: answered.size, total: points.length }
}
