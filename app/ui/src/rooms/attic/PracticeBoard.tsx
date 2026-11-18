// The practice board under the replay bar (Spec 10, practice-house): the
// "Practice: you decide" switch, the run's numbers from the log, and, while
// practice is on, the decision the visitor faces, the two answers the owner
// had, and what the choice means against what the owner chose.
import { GraduationCap } from 'lucide-react'
import { useId } from 'react'
import { PRACTICE_NOTE, logNumbersText } from '../../core/practice'
import type { PracticeModel } from './use-practice'

export const PRACTICE_LABEL = 'Practice: you decide'
export const PRACTICE_HINT = 'The recording stops wherever its owner had to decide, and asks you instead. Nothing real changes.'
export const PRACTICE_WAITING = 'Press Play. The recording will stop at the next decision.'
export const PRACTICE_DONE = 'You have made every decision in this recording.'

export function PracticeBoard({ practice }: { practice: PracticeModel }) {
  const hintId = useId()
  const { on, asking, answer } = practice
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
      {on ? (
        <div className="hh-ui-practice-body" data-practice-body>
          <p className="hh-ui-practice-note" data-practice-note>
            {PRACTICE_NOTE}
          </p>
          {asking === null ? (
            <p>{practice.made > 0 && practice.made === practice.total ? PRACTICE_DONE : PRACTICE_WAITING}</p>
          ) : (
            <div data-practice-question={asking.proposalId}>
              <p className="hh-ui-practice-question">{asking.question}</p>
              {answer === null ? (
                <div className="hh-ui-practice-choices">
                  <button type="button" className="hh-ui-button" data-variant="primary" data-practice-choice="approved" onClick={() => practice.choose('approved')}>
                    {asking.choices[0]}
                  </button>
                  <button type="button" className="hh-ui-button" data-practice-choice="rejected" onClick={() => practice.choose('rejected')}>
                    {asking.choices[1]}
                  </button>
                </div>
              ) : (
                <div className="hh-ui-practice-answer" data-practice-answer={answer.same ? 'same' : 'different'}>
                  <p>{answer.meaning}</p>
                  <p>{answer.recorded}</p>
                  <button type="button" className="hh-ui-button" data-variant="primary" data-practice-go-on onClick={practice.goOn}>
                    Go on with the recording
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
