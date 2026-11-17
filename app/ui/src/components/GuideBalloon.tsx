// The Warden's balloon (Spec 8, Requirement 3). It renders what the guide
// says and nothing else: one line about what is true now, the question, at
// most four things to do, and the full list and the Word Book behind
// "Something else…".
//
// Every choice is an ordinary button. Its second line says what pressing does
// and is its accessible description. The balloon decides nothing: a press is
// handed up, and the page presses the house's own controls. It is not a
// dialog, takes no focus by itself and announces nothing.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { TERMS, term, type TermId, type WordMode } from '../core/house-words'

export const SOMETHING_ELSE_LABEL = 'Something else…'
export const STEP_BACK_LABEL = 'Step back'
export const STEP_BACK_HINT = 'The Warden stops talking. Every control and the house map still work.'
export const WORD_BOOK_TITLE = 'What the words mean'

/** One choice. A room's Guide Option and a hall option both fit. */
export interface BalloonOption {
  readonly id: string
  readonly label: string
  readonly consequence: string
  /** The term whose Kiro word is shown beside the label when Kiro's words are on. */
  readonly term?: TermId | null
  readonly kind?: string
}

/** What the balloon shows. A room's Guide View fits as it is. */
export interface BalloonView<Option extends BalloonOption> {
  readonly status: string
  readonly statusKind?: string
  readonly terms?: readonly TermId[]
  readonly note?: string | null
  /** Null where the screen's own form asks the question (the Gate). */
  readonly question: string | null
  readonly options: readonly Option[]
  readonly everything: readonly Option[]
}

export interface GuideBalloonProps<Option extends BalloonOption> {
  view: BalloonView<Option>
  words: WordMode
  /** Told which choice was pressed, and the button it was pressed on. The page runs it. */
  onPress: (option: Option, from: HTMLElement) => void
  onStepBack: () => void
  /** Why the last press did nothing, in the room's own words. */
  refusal?: string | null
  /** The status line, so the page can put focus on it. */
  statusRef?: RefObject<HTMLParagraphElement>
  /** The screen's own controls, shown under the status line (the Gate's name and Knock). */
  children?: ReactNode
}

interface OptionProps<Option extends BalloonOption> {
  option: Option
  words: WordMode
  onPress: (option: Option, from: HTMLElement) => void
}

function OptionButton<Option extends BalloonOption>({ option, words, onPress }: OptionProps<Option>) {
  const labelId = useId()
  const consequenceId = useId()
  const kiro = words === 'with-kiro' && option.term != null ? term(option.term).kiro : null
  return (
    <li>
      <button
        type="button"
        className="hh-guide-option"
        data-guide-option={option.id}
        data-kind={option.kind}
        aria-labelledby={labelId}
        aria-describedby={consequenceId}
        onClick={(event) => onPress(option, event.currentTarget)}
      >
        <span className="hh-guide-bullet" aria-hidden="true" />
        <span className="hh-guide-option-words">
          <span className="hh-guide-option-label" id={labelId}>
            {option.label}
            {kiro === null ? null : (
              <>
                {' '}
                <span className="hh-guide-kiro">({kiro})</span>
              </>
            )}
          </span>
          <span className="hh-guide-consequence" id={consequenceId}>
            {option.consequence}
          </span>
        </span>
      </button>
    </li>
  )
}

/** "What is this?" for one term: its two sentences, shown in place. */
function TermHelp({ id }: { id: TermId }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const entry = term(id)
  return (
    <span className="hh-guide-term" data-term={id}>
      <button type="button" className="hh-guide-what" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        What is “{entry.plain}”?
      </button>
      {open ? (
        <span className="hh-guide-about" id={panelId}>
          {entry.about[0]} {entry.about[1]}
        </span>
      ) : null}
    </span>
  )
}

export function GuideBalloon<Option extends BalloonOption>({ view, words, onPress, onStepBack, refusal = null, statusRef, children }: GuideBalloonProps<Option>) {
  const [more, setMore] = useState(false)
  const moreId = useId()
  const stepBackHintId = useId()
  const ownStatus = useRef<HTMLParagraphElement>(null)
  const status = statusRef ?? ownStatus
  const terms = view.terms ?? []
  const note = view.note ?? null
  const primary = new Set(view.options.map((option) => option.id))
  const rest = view.everything.filter((option) => !primary.has(option.id))

  // When the pressed choice goes away and focus is left nowhere, focus goes to
  // the status line: never onto whatever choice took the old one's place, so a
  // second Enter cannot land on something that decides.
  const pressed = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const button = pressed.current
    if (button === null || button.isConnected) return
    pressed.current = null
    const active = document.activeElement
    if (active === null || active === document.body) status.current?.focus()
  })
  const press = (option: Option, from: HTMLElement) => {
    pressed.current = from
    onPress(option, from)
  }

  return (
    <div className="hh-guide-balloon" data-guide-balloon data-status={view.statusKind}>
      {/* What is true now stays in view; what can be done scrolls under it where the layout gives the balloon a height. */}
      <div className="hh-guide-head">
        <p className="hh-guide-status" data-guide-text tabIndex={-1} ref={status}>
          {view.status}
        </p>
        {terms.length === 0 ? null : (
          <p className="hh-guide-terms">
            {terms.map((id) => (
              <TermHelp key={id} id={id} />
            ))}
          </p>
        )}
        {note === null ? null : (
          <p className="hh-guide-note" data-guide-note>
            {note}
          </p>
        )}
        {refusal === null ? null : (
          <p className="hh-guide-note" data-guide-refusal>
            {refusal}
          </p>
        )}
        {view.question === null ? null : <p className="hh-guide-question">{view.question}</p>}
      </div>
      <div className="hh-guide-body">
        {children}
        {view.options.length === 0 ? null : (
          <ul className="hh-guide-options" data-guide-primary>
            {view.options.map((option) => (
              <OptionButton key={option.id} option={option} words={words} onPress={press} />
            ))}
          </ul>
        )}
        <div className="hh-guide-foot">
          <button
            type="button"
            className="hh-guide-foot-button"
            data-guide-more
            aria-expanded={more}
            aria-controls={more ? moreId : undefined}
            onClick={() => setMore((value) => !value)}
          >
            {more ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            {SOMETHING_ELSE_LABEL}
          </button>
          <button type="button" className="hh-guide-foot-button" data-guide-step-back aria-describedby={stepBackHintId} onClick={onStepBack}>
            {STEP_BACK_LABEL}
          </button>
          <span className="hh-guide-hidden" id={stepBackHintId}>
            {STEP_BACK_HINT}
          </span>
        </div>
        {more ? (
          <div className="hh-guide-everything" id={moreId} data-guide-everything>
            {rest.length === 0 ? null : (
              <ul className="hh-guide-options">
                {rest.map((option) => (
                  <OptionButton key={option.id} option={option} words={words} onPress={press} />
                ))}
              </ul>
            )}
            <p className="hh-guide-book-title">{WORD_BOOK_TITLE}</p>
            <dl className="hh-guide-book" data-word-book>
              {TERMS.map((entry) => (
                <div key={entry.id} data-term={entry.id}>
                  <dt>
                    {entry.plain} <span className="hh-guide-kiro">(Kiro: {entry.kiro})</span>
                  </dt>
                  <dd>
                    {entry.about[0]} {entry.about[1]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  )
}
