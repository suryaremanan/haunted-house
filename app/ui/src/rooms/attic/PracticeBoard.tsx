// Practice mode for the static replay (Spec 10, practice-house), in two parts.
//
// PracticeBoard: one line under the replay bar with the run's numbers from the
// log and the "Practice: you decide" switch.
//
// PracticeBalloon: while practice waits at a decision, the Warden asks it in
// his own balloon, in place of his usual words, so the room keeps its size:
// the question the owner faced, the owner's two answers, and then what the
// choice means against what the owner chose.
import { GraduationCap } from 'lucide-react'
import { useId } from 'react'
import { PRACTICE_NOTE, logNumbersText } from '../../core/practice'
import type { PracticeModel } from './use-practice'

export const PRACTICE_LABEL = 'Practice: you decide'
export const PRACTICE_HINT = 'The recording stops wherever its owner had to decide, and the Warden asks you instead. Nothing real changes.'
export const PRACTICE_WAITING = 'Practice is on. Press Play: the recording stops at the next decision.'
export const PRACTICE_DONE = 'You have made every decision in this recording.'

export function PracticeBoard({ practice }: { practice: PracticeModel }) {
  const hintId = useId()
  const { on, asking } = practice
  const state = !on ? null : asking !== null ? null : practice.made > 0 && practice.made === practice.total ? PRACTICE_DONE : PRACTICE_WAITING
  return (
    <section className="hh-ui-practice" aria-label="Practice" data-practice={on ? 'on' : 'off'}>
      <p className="hh-ui-practice-numbers" data-log-numbers>
        {logNumbersText(practice.numbers)}
      </p>
      <button type="button" className="hh-ui-button" data-practice-toggle aria-pressed={on} aria-describedby={hintId} onClick={practice.toggle}>
        <GraduationCap size={16} aria-hidden />
        {PRACTICE_LABEL}: {on ? 'on' : 'off'}
      </button>
      <span className="hh-ui-visually-hidden" id={hintId}>
        {PRACTICE_HINT}
      </span>
      {state === null ? null : (
        <p className="hh-ui-practice-state" data-practice-state>
          {state}
        </p>
      )}
    </section>
  )
}

export function PracticeBalloon({ practice }: { practice: PracticeModel }) {
  const { asking, answer } = practice
  if (asking === null) return null
  return (
    <div className="hh-guide-balloon hh-practice-balloon" data-guide-balloon data-practice-question={asking.proposalId}>
      <div className="hh-guide-head">
        <p className="hh-guide-note" data-practice-note>
          {PRACTICE_NOTE}
        </p>
        <p className="hh-guide-status hh-ui-practice-question" data-guide-text>
          {asking.question}
        </p>
      </div>
      <div className="hh-guide-body">
        {answer === null ? (
          <div className="hh-ui-practice-choices">
            <button type="button" className="hh-guide-foot-button" data-practice-choice="approved" onClick={() => practice.choose('approved')}>
              {asking.choices[0]}
            </button>
            <button type="button" className="hh-guide-foot-button" data-practice-choice="rejected" onClick={() => practice.choose('rejected')}>
              {asking.choices[1]}
            </button>
          </div>
        ) : (
          <div className="hh-ui-practice-answer" data-practice-answer={answer.same ? 'same' : 'different'}>
            <p>{answer.meaning}</p>
            <p>{answer.recorded}</p>
            <button type="button" className="hh-guide-foot-button" data-practice-go-on onClick={practice.goOn}>
              Go on with the recording
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
